import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startMockOneBotWsServer } from './helpers/mock-ws-server.js';

let mockRuntime: any;
vi.mock('../src/runtime.js', () => ({
  getOneBotRuntime: () => mockRuntime,
}));

const sentTexts: string[] = [];
vi.mock('../src/outbound.js', () => ({
  sendText: async ({ text }: any) => {
    sentTexts.push(String(text));
    return { channel: 'onebot', messageId: 'm1' };
  },
  sendImage: async () => ({ status: 'ok', retcode: 0, data: {} }),
}));

describe('gateway timeout + error handling', () => {
  beforeEach(() => {
    sentTexts.length = 0;
  });

  afterEach(() => {
    delete (globalThis as any).onDispatch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends a processing message on response timeout (fake timers)', async () => {
    vi.useFakeTimers();

    // runtime that never delivers
    mockRuntime = {
      channel: {
        activity: { record: () => {} },
        routing: { resolveAgentRoute: () => ({ sessionKey: 's', accountId: 'default', agentId: 'a' }) },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatInboundEnvelope: (x: any) => x.body,
          finalizeInboundContext: (x: any) => x,
          resolveEffectiveMessagesConfig: () => ({ responsePrefix: '' }),
          dispatchReplyWithBufferedBlockDispatcher: async () => { if (globalThis.onDispatch) globalThis.onDispatch(); return new Promise(() => {}); },
        },
      },
    };

    const wsServer = await startMockOneBotWsServer();
    const { startGateway } = await import('../src/gateway.js');

    const ac = new AbortController();

    let readyResolve!: () => void;
    const readyP = new Promise<void>((r) => (readyResolve = r));

    const runP = startGateway({
      account: {
        accountId: 'default',
        enabled: true,
        wsUrl: wsServer.wsUrl,
        httpUrl: 'http://x',
        config: {},
      },
      abortSignal: ac.signal,
      cfg: {},
      onReady: () => readyResolve(),
      log: { info: () => {}, error: () => {}, debug: () => {} },
    });

    await readyP;

    wsServer.sendToAll({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: 301,
      user_id: 401,
      message: [{ type: 'text', data: { text: 'hi' } }],
      raw_message: 'hi',
      sender: { user_id: 401, nickname: 'T' },
      self_id: 999,
      time: Math.floor(Date.now() / 1000),
    });

    // Advance to trigger the 90s timeout inside gateway.ts
    await new Promise<void>((r) => { globalThis.onDispatch = r; });
    await vi.advanceTimersByTimeAsync(100_000);

    await vi.waitFor(() => expect(sentTexts.some((t) => t.includes('processing'))).toBe(true));

    ac.abort();
    await runP;
    await wsServer.close();
  });

  it('sends error text when runtime dispatch throws', async () => {
    mockRuntime = {
      channel: {
        activity: { record: () => {} },
        routing: { resolveAgentRoute: () => ({ sessionKey: 's', accountId: 'default', agentId: 'a' }) },
        reply: {
          resolveEnvelopeFormatOptions: () => ({}),
          formatInboundEnvelope: (x: any) => x.body,
          finalizeInboundContext: (x: any) => x,
          resolveEffectiveMessagesConfig: () => ({ responsePrefix: '' }),
          dispatchReplyWithBufferedBlockDispatcher: async ({ dispatcherOptions }: any) => {
            await dispatcherOptions.onError(new Error('dispatch boom'));
          },
        },
      },
    };

    const wsServer = await startMockOneBotWsServer();
    const { startGateway } = await import('../src/gateway.js');

    const ac = new AbortController();
    let readyResolve!: () => void;
    const readyP = new Promise<void>((r) => (readyResolve = r));

    const runP = startGateway({
      account: {
        accountId: 'default',
        enabled: true,
        wsUrl: wsServer.wsUrl,
        httpUrl: 'http://x',
        config: {},
      },
      abortSignal: ac.signal,
      cfg: {},
      onReady: () => readyResolve(),
      log: { info: () => {}, error: () => {}, debug: () => {} },
    });

    await readyP;

    wsServer.sendToAll({
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: 302,
      user_id: 402,
      message: [{ type: 'text', data: { text: 'hi' } }],
      raw_message: 'hi',
      sender: { user_id: 402, nickname: 'T' },
      self_id: 999,
      time: Math.floor(Date.now() / 1000),
    });

    await vi.waitFor(() => {
      expect(sentTexts.length).toBeGreaterThan(0);
    });

    expect(sentTexts.join('\n')).toMatch(/Error: dispatch boom/);

    ac.abort();
    await runP;
    await wsServer.close();
  });
});
