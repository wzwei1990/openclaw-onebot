import WebSocket from "ws";
import type {
  ResolvedOneBotAccount,
  OneBotEvent,
  OneBotMessageEvent,
  OneBotMessageSegment,
} from "./types.js";
import { getOneBotRuntime } from "./runtime.js";
import { sendText as sendOutboundText, sendImage } from "./outbound.js";

// Reconnect configuration
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000, 60000];
const MAX_RECONNECT_ATTEMPTS = 100;

export interface GatewayContext {
  account: ResolvedOneBotAccount;
  abortSignal: AbortSignal;
  cfg: unknown;
  onReady?: (data: unknown) => void;
  onError?: (error: Error) => void;
  log?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
}

/**
 * Extract text content from OneBot message segments.
 */
function extractText(segments: OneBotMessageSegment[]): string {
  return segments
    .filter((seg) => seg.type === "text")
    .map((seg) => String(seg.data.text ?? ""))
    .join("");
}

/**
 * Extract image URLs from OneBot message segments.
 */
function extractImages(segments: OneBotMessageSegment[]): string[] {
  return segments
    .filter((seg) => seg.type === "image")
    .map((seg) => String(seg.data.url ?? seg.data.file ?? ""))
    .filter(Boolean);
}

/**
 * Extract record/voice URLs from OneBot message segments.
 */
function extractRecords(segments: OneBotMessageSegment[]): string[] {
  return segments
    .filter((seg) => seg.type === "record")
    .map((seg) => String(seg.data.url ?? seg.data.file ?? ""))
    .filter(Boolean);
}

/**
 * Start WebSocket gateway with auto-reconnect.
 */
export async function startGateway(ctx: GatewayContext): Promise<void> {
  const { account, abortSignal, cfg, onReady, onError, log } = ctx;

  if (!account.wsUrl) {
    throw new Error("OneBot not configured (missing wsUrl)");
  }

  let reconnectAttempts = 0;
  let isAborted = false;
  let currentWs: WebSocket | null = null;
  let isConnecting = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  abortSignal.addEventListener("abort", () => {
    isAborted = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    cleanup();
  });

  const cleanup = () => {
    if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
      currentWs.close();
    }
    currentWs = null;
  };

  const getReconnectDelay = () => {
    const idx = Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1);
    return RECONNECT_DELAYS[idx];
  };

  const scheduleReconnect = (customDelay?: number) => {
    if (isAborted || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log?.error(`[onebot:${account.accountId}] Max reconnect attempts reached or aborted`);
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const delay = customDelay ?? getReconnectDelay();
    reconnectAttempts++;
    log?.info(`[onebot:${account.accountId}] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isAborted) {
        connect();
      }
    }, delay);
  };

  const connect = async () => {
    if (isConnecting) {
      log?.debug?.(`[onebot:${account.accountId}] Already connecting, skip`);
      return;
    }
    isConnecting = true;

    try {
      cleanup();

      const wsUrl = account.wsUrl;
      const wsOptions: WebSocket.ClientOptions = {};

      // Add access token as query param or header
      let connectUrl = wsUrl;
      if (account.accessToken) {
        const separator = wsUrl.includes("?") ? "&" : "?";
        connectUrl = `${wsUrl}${separator}access_token=${account.accessToken}`;
      }

      log?.info(`[onebot:${account.accountId}] Connecting to ${wsUrl}`);

      const ws = new WebSocket(connectUrl, wsOptions);
      currentWs = ws;

      const pluginRuntime = getOneBotRuntime();

      /**
       * Handle an incoming message event.
       */
      const handleMessage = async (event: OneBotMessageEvent) => {
        const isGroup = event.message_type === "group";
        const senderId = String(event.user_id);
        const senderName = event.sender.card || event.sender.nickname || senderId;
        const text = extractText(event.message) || event.raw_message;
        const images = extractImages(event.message);
        const records = extractRecords(event.message);

        // allowFrom check — reject unlisted senders
        const peerId = isGroup ? `group:${event.group_id}` : `private:${senderId}`;

        if (account.allowFrom && account.allowFrom.length > 0) {
          if (!account.allowFrom.some((pattern) => peerId === pattern || pattern === "*")) {
            log?.debug?.(`[onebot:${account.accountId}] Ignoring message from unlisted ${peerId}`);
            return;
          }
        }

        log?.info(
          `[onebot:${account.accountId}] ${isGroup ? "Group" : "Private"} message from ${senderName}(${senderId}): ${text.slice(0, 100)}`,
        );

        pluginRuntime.channel.activity.record({
          channel: "onebot",
          accountId: account.accountId,
          direction: "inbound",
        });

        const route = pluginRuntime.channel.routing.resolveAgentRoute({
          cfg,
          channel: "onebot",
          accountId: account.accountId,
          peer: {
            kind: isGroup ? "group" : "dm",
            id: peerId,
          },
        });

        const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);

        // Build attachment info for images/records
        let attachmentInfo = "";
        for (const img of images) {
          attachmentInfo += `\n[Image: ${img}]`;
        }
        for (const rec of records) {
          attachmentInfo += `\n[Voice: ${rec}]`;
        }

        const userContent = text + attachmentInfo;

        const body = pluginRuntime.channel.reply.formatInboundEnvelope({
          channel: "OneBot",
          from: senderName,
          timestamp: event.time * 1000,
          body: userContent,
          chatType: isGroup ? "group" : "direct",
          sender: {
            id: senderId,
            name: senderName,
          },
          envelope: envelopeOptions,
          ...(images.length > 0 ? { imageUrls: images } : {}),
        });

        const fromAddress = isGroup
          ? `onebot:group:${event.group_id}`
          : `onebot:private:${senderId}`;
        const toAddress = fromAddress;

        const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
          Body: body,
          RawBody: text,
          CommandBody: text,
          From: fromAddress,
          To: toAddress,
          SessionKey: route.sessionKey,
          AccountId: route.accountId,
          ChatType: isGroup ? "group" : "direct",
          SenderId: senderId,
          SenderName: senderName,
          Provider: "onebot",
          Surface: "onebot",
          MessageSid: String(event.message_id),
          Timestamp: event.time * 1000,
          OriginatingChannel: "onebot",
          OriginatingTo: toAddress,
        });

        log?.info(
          `[onebot:${account.accountId}] ctxPayload: From=${fromAddress}, SessionKey=${route.sessionKey}, ChatType=${isGroup ? "group" : "direct"}`,
        );

        // Helper to send error messages back to the user
        const sendErrorMessage = async (errorText: string) => {
          try {
            await sendOutboundText({
              to: fromAddress,
              text: errorText,
              account,
            });
          } catch (sendErr) {
            log?.error(`[onebot:${account.accountId}] Failed to send error message: ${sendErr}`);
          }
        };

        try {
          const messagesConfig = pluginRuntime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

          let hasResponse = false;
          const responseTimeout = 90000;
          let timeoutId: ReturnType<typeof setTimeout> | null = null;

          const timeoutPromise = new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => {
              if (!hasResponse) {
                reject(new Error("Response timeout"));
              }
            }, responseTimeout);
          });

          const dispatchPromise = pluginRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
              responsePrefix: messagesConfig.responsePrefix,
              deliver: async (
                payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string },
                info: { kind: string },
              ) => {
                hasResponse = true;
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }

                log?.info(
                  `[onebot:${account.accountId}] deliver(${info.kind}): textLen=${payload.text?.length ?? 0}`,
                );

                let replyText = payload.text ?? "";

                // Send media if present
                const mediaPaths: string[] = [];
                if (payload.mediaUrls?.length) {
                  mediaPaths.push(...payload.mediaUrls);
                }
                if (payload.mediaUrl && !mediaPaths.includes(payload.mediaUrl)) {
                  mediaPaths.push(payload.mediaUrl);
                }

                for (const mediaPath of mediaPaths) {
                  try {
                    const targetType = isGroup ? "group" as const : "private" as const;
                    const targetId = isGroup ? event.group_id! : event.user_id;
                    await sendImage(account, targetType, targetId, mediaPath);
                    log?.info(`[onebot:${account.accountId}] Sent media: ${mediaPath}`);
                  } catch (err) {
                    log?.error(`[onebot:${account.accountId}] Media send failed: ${err}`);
                  }
                }

                // Send text
                if (replyText.trim()) {
                  try {
                    await sendOutboundText({
                      to: fromAddress,
                      text: replyText,
                      account,
                    });
                    pluginRuntime.channel.activity.record({
                      channel: "onebot",
                      accountId: account.accountId,
                      direction: "outbound",
                    });
                  } catch (err) {
                    log?.error(`[onebot:${account.accountId}] Send failed: ${err}`);
                  }
                }
              },
              onError: async (err: unknown) => {
                log?.error(`[onebot:${account.accountId}] Dispatch error: ${err}`);
                hasResponse = true;
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }
                const errMsg = String(err);
                await sendErrorMessage(`[OpenClaw] Error: ${errMsg.slice(0, 500)}`);
              },
            },
            replyOptions: {},
          });

          try {
            await Promise.race([dispatchPromise, timeoutPromise]);
          } catch (err) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            if (!hasResponse) {
              log?.error(`[onebot:${account.accountId}] No response within timeout`);
              await sendErrorMessage("[OpenClaw] Request received, processing...");
            }
          }
        } catch (err) {
          log?.error(`[onebot:${account.accountId}] Message processing failed: ${err}`);
          await sendErrorMessage(`[OpenClaw] Processing failed: ${String(err).slice(0, 500)}`);
        }
      };

      ws.on("open", () => {
        log?.info(`[onebot:${account.accountId}] WebSocket connected`);
        isConnecting = false;
        reconnectAttempts = 0;
        onReady?.({});
      });

      ws.on("message", async (data) => {
        try {
          const rawData = data.toString();
          const event = JSON.parse(rawData) as OneBotEvent;

          log?.debug?.(`[onebot:${account.accountId}] Event: post_type=${event.post_type}`);

          switch (event.post_type) {
            case "meta_event":
              if (event.meta_event_type === "lifecycle" && event.sub_type === "connect") {
                log?.info(`[onebot:${account.accountId}] Lifecycle: connected`);
              }
              // Heartbeat events are handled silently
              break;

            case "message":
              await handleMessage(event as OneBotMessageEvent);
              break;

            case "notice":
              log?.debug?.(`[onebot:${account.accountId}] Notice: ${(event as { notice_type?: string }).notice_type}`);
              break;
          }
        } catch (err) {
          log?.error(`[onebot:${account.accountId}] Message parse error: ${err}`);
        }
      });

      ws.on("close", (code, reason) => {
        log?.info(`[onebot:${account.accountId}] WebSocket closed: ${code} ${reason.toString()}`);
        isConnecting = false;
        cleanup();

        if (!isAborted && code !== 1000) {
          scheduleReconnect();
        }
      });

      ws.on("error", (err) => {
        log?.error(`[onebot:${account.accountId}] WebSocket error: ${err.message}`);
        isConnecting = false;
        onError?.(err);
      });
    } catch (err) {
      isConnecting = false;
      log?.error(`[onebot:${account.accountId}] Connection failed: ${err}`);
      scheduleReconnect();
    }
  };

  // Start connection
  await connect();

  // Wait for abort signal
  return new Promise((resolve) => {
    abortSignal.addEventListener("abort", () => resolve());
  });
}
