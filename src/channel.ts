import { homedir } from "node:os";
import { join } from "node:path";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import type { ResolvedOneBotAccount } from "./types.js";
import { listOneBotAccountIds, resolveOneBotAccount, applyOneBotAccountConfig } from "./config.js";
import { reactToMessage, sendText } from "./outbound.js";
import { startGateway } from "./gateway.js";

const DEFAULT_ACCOUNT_ID = "default";
const ONEBOT_MESSAGE_ACTIONS = ["react"] as const;
const DEFAULT_SHARED_DIR = process.env.ONEBOT_SHARED_DIR ?? join(homedir(), "napcat", "shared");
const DEFAULT_CONTAINER_SHARED_DIR = process.env.ONEBOT_CONTAINER_SHARED_DIR ?? "/shared";

function createActionResult<TDetails>(text: string, details: TDetails) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export const onebotPlugin: ChannelPlugin<ResolvedOneBotAccount> = {
  id: "onebot",
  meta: {
    id: "onebot",
    label: "OneBot",
    selectionLabel: "OneBot (QQ via NapCat)",
    docsPath: "/docs/channels/onebot",
    blurb: "Connect to QQ via OneBot 11 protocol (NapCat/go-cqhttp)",
    order: 55,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: true,
    threads: false,
    blockStreaming: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: {
      minChars: 80,
      idleMs: 600,
    },
  },
  reload: { configPrefixes: ["channels.onebot"] },
  messaging: {
    normalizeTarget: (target) => {
      return target.replace(/^onebot:/i, "");
    },
    targetResolver: {
      looksLikeId: (id) => {
        const normalized = id.replace(/^onebot:/i, "");
        if (normalized.startsWith("private:")) return /^private:\d+$/.test(normalized);
        if (normalized.startsWith("group:")) return /^group:\d+$/.test(normalized);
        return /^\d+$/.test(normalized);
      },
      hint: "private:<user_id> or group:<group_id>",
    },
  },
  config: {
    listAccountIds: (cfg) => listOneBotAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveOneBotAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => Boolean(account?.wsUrl && account?.httpUrl),
    describeAccount: (account) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.wsUrl && account?.httpUrl),
    }),
  },
  setup: {
    validateInput: ({ input }) => {
      if (!input.token && !input.useEnv) {
        return "OneBot requires --token (format: wsUrl,httpUrl[,accessToken[,sharedDir[,containerSharedDir]]]) or --use-env (ONEBOT_WS_URL, ONEBOT_HTTP_URL)";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      let wsUrl = "";
      let httpUrl = "";
      let accessToken: string | undefined;
      const raw = input as Record<string, unknown>;
      let sharedDir = typeof raw.sharedDir === "string" && raw.sharedDir.trim()
        ? raw.sharedDir.trim()
        : undefined;
      let containerSharedDir = typeof raw.containerSharedDir === "string" && raw.containerSharedDir.trim()
        ? raw.containerSharedDir.trim()
        : undefined;

      if (input.token) {
        const parts = input.token.split(",");
        wsUrl = parts[0]?.trim() ?? "";
        httpUrl = parts[1]?.trim() ?? "";
        accessToken = parts[2]?.trim() || undefined;
        sharedDir ??= parts[3]?.trim() || undefined;
        containerSharedDir ??= parts[4]?.trim() || undefined;
      }

      if (!input.useEnv) {
        sharedDir ??= DEFAULT_SHARED_DIR;
        containerSharedDir ??= DEFAULT_CONTAINER_SHARED_DIR;
      }

      return applyOneBotAccountConfig(cfg, accountId, {
        wsUrl,
        httpUrl,
        accessToken,
        sharedDir,
        containerSharedDir,
        name: input.name,
      });
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4500,
    sendText: async ({ to, text, accountId, replyToId, cfg }) => {
      const account = resolveOneBotAccount(cfg, accountId);
      const result = await sendText({ to, text, accountId, replyToId, account });
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.messageId) {
        throw new Error("OneBot sendText did not return a messageId");
      }
      return {
        channel: "onebot",
        messageId: result.messageId,
      };
    },
  },
  actions: {
    describeMessageTool: ({ cfg }) => {
      const account = resolveOneBotAccount(cfg);
      if (!account.enabled || !account.wsUrl || !account.httpUrl) {
        return null;
      }
      return {
        actions: [...ONEBOT_MESSAGE_ACTIONS],
      };
    },
    supportsAction: ({ action }) => action === "react",
    handleAction: async ({ action, cfg, params, accountId, toolContext }) => {
      if (action !== "react") {
        return createActionResult(`Unsupported OneBot action: ${action}`, {
          ok: false,
          channel: "onebot",
          action,
          error: `Unsupported OneBot action: ${action}`,
        });
      }

      const messageId =
        params.message_id ??
        params.messageId ??
        params.message ??
        toolContext?.currentMessageId;
      const emojiId =
        params.emoji_id ??
        params.emojiId ??
        params.emoji ??
        params.reaction;

      if (messageId == null || emojiId == null || String(emojiId).trim() === "") {
        return createActionResult(
          "OneBot react requires `emoji` and `message_id` (or current message context).",
          {
            ok: false,
            channel: "onebot",
            action,
            error: "OneBot react requires `emoji` and `message_id` (or current message context).",
          },
        );
      }

      const account = resolveOneBotAccount(cfg, accountId);
      const result = await reactToMessage(account, messageId as string | number, emojiId as string | number);

      if (!result.ok) {
        return createActionResult(result.error ?? "OneBot reaction failed", {
          ok: false,
          channel: "onebot",
          action,
          error: result.error ?? "OneBot reaction failed",
          data: result,
        });
      }

      return createActionResult(`Reacted with ${String(emojiId)} to message ${String(messageId)}.`, {
        ok: true,
        channel: "onebot",
        action,
        data: result,
      });
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { account, abortSignal, log, cfg } = ctx;

      log?.info(`[onebot:${account.accountId}] Starting gateway`);

      await startGateway({
        account,
        abortSignal,
        cfg,
        log,
        onReady: () => {
          log?.info(`[onebot:${account.accountId}] Gateway ready`);
          ctx.setStatus({
            ...ctx.getStatus(),
            running: true,
            connected: true,
            lastConnectedAt: Date.now(),
          });
        },
        onError: (error) => {
          log?.error(`[onebot:${account.accountId}] Gateway error: ${error.message}`);
          ctx.setStatus({
            ...ctx.getStatus(),
            lastError: error.message,
          });
        },
      });
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      name: account?.name,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.wsUrl && account?.httpUrl),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
};
