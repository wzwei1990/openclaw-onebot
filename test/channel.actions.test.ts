import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reactToMessage, sendText } = vi.hoisted(() => ({
  reactToMessage: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock('../src/outbound.js', () => ({
  reactToMessage,
  sendText,
}));

import { onebotPlugin } from '../src/channel.js';

describe('channel actions', () => {
  beforeEach(() => {
    reactToMessage.mockReset();
    sendText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('advertises the react action only', () => {
    expect(onebotPlugin.actions?.listActions()).toEqual(['react']);
    expect(onebotPlugin.actions?.supportsAction?.({ action: 'react' } as any)).toBe(true);
    expect(onebotPlugin.actions?.supportsAction?.({ action: 'wave' } as any)).toBe(false);
  });

  it('rejects unsupported actions and missing reaction params', async () => {
    const unsupported = await onebotPlugin.actions!.handleAction!({
      action: 'wave',
      cfg: {},
      params: {},
      accountId: 'default',
      toolContext: {},
    } as any);
    expect(unsupported.ok).toBe(false);
    expect(String(unsupported.error)).toMatch(/Unsupported OneBot action/);

    const missing = await onebotPlugin.actions!.handleAction!({
      action: 'react',
      cfg: {},
      params: {},
      accountId: 'default',
      toolContext: {},
    } as any);
    expect(missing.ok).toBe(false);
    expect(String(missing.error)).toMatch(/requires `emoji` and `message_id`/);
  });

  it('forwards successful reactions and reports failures', async () => {
    reactToMessage.mockResolvedValueOnce({
      ok: true,
      messageId: '123',
      emojiId: '128077',
    });

    const success = await onebotPlugin.actions!.handleAction!({
      action: 'react',
      cfg: {
        channels: {
          onebot: {
            wsUrl: 'ws://127.0.0.1:3000',
            httpUrl: 'http://127.0.0.1:3001',
          },
        },
      },
      params: {
        message_id: '123',
        emoji: '128077',
      },
      accountId: 'default',
      toolContext: {},
    } as any);

    expect(success.ok).toBe(true);
    expect(reactToMessage).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'default' }),
      '123',
      '128077',
    );

    reactToMessage.mockResolvedValueOnce({
      ok: false,
      error: 'reaction failed',
    });

    const failure = await onebotPlugin.actions!.handleAction!({
      action: 'react',
      cfg: {
        channels: {
          onebot: {
            wsUrl: 'ws://127.0.0.1:3000',
            httpUrl: 'http://127.0.0.1:3001',
          },
        },
      },
      params: {
        messageId: '555',
        reaction: '1',
      },
      accountId: 'default',
      toolContext: {},
    } as any);

    expect(failure.ok).toBe(false);
    expect(String(failure.error)).toMatch(/reaction failed/);
  });

  it('routes outbound text through resolved OneBot accounts', async () => {
    sendText.mockResolvedValueOnce({
      channel: 'onebot',
      messageId: 'out-1',
      error: undefined,
    });

    const result = await onebotPlugin.outbound!.sendText!({
      to: 'private:42',
      text: 'hello',
      accountId: 'default',
      replyToId: 'r1',
      cfg: {
        channels: {
          onebot: {
            wsUrl: 'ws://127.0.0.1:3000',
            httpUrl: 'http://127.0.0.1:3001',
          },
        },
      },
    } as any);

    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({
      to: 'private:42',
      text: 'hello',
      replyToId: 'r1',
      account: expect.objectContaining({ httpUrl: 'http://127.0.0.1:3001' }),
    }));
    expect(result.messageId).toBe('out-1');
    expect(result.error).toBeUndefined();

    sendText.mockResolvedValueOnce({
      channel: 'onebot',
      messageId: 'out-2',
      error: 'send failed',
    });

    const failed = await onebotPlugin.outbound!.sendText!({
      to: 'private:42',
      text: 'hello',
      accountId: 'default',
      cfg: {
        channels: {
          onebot: {
            wsUrl: 'ws://127.0.0.1:3000',
            httpUrl: 'http://127.0.0.1:3001',
          },
        },
      },
    } as any);

    expect(failed.error).toBeInstanceOf(Error);
    expect(String(failed.error?.message ?? failed.error)).toMatch(/send failed/);
  });

  it('builds status snapshots from runtime state', () => {
    const snapshot = onebotPlugin.status!.buildAccountSnapshot!({
      account: {
        accountId: 'default',
        name: 'QQ',
        enabled: true,
        wsUrl: 'ws://127.0.0.1:3000',
        httpUrl: 'http://127.0.0.1:3001',
      },
      runtime: {
        running: true,
        connected: true,
        lastConnectedAt: 123,
        lastError: 'none',
      },
    } as any);

    expect(snapshot).toEqual(expect.objectContaining({
      accountId: 'default',
      name: 'QQ',
      enabled: true,
      configured: true,
      running: true,
      connected: true,
      lastConnectedAt: 123,
      lastError: 'none',
    }));
  });
});
