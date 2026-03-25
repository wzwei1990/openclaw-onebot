import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type ExecCb = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

(globalThis as any).__onebotExecImpl = (_command: string, _options: Record<string, unknown>, callback: ExecCb) =>
  callback(null, { stdout: '', stderr: '' });

vi.mock('node:child_process', () => ({
  exec: (command: string, options: unknown, callback?: ExecCb) => {
    const cb = (typeof options === 'function' ? options : callback) as ExecCb;
    const opts = typeof options === 'function' || options == null ? {} : options as Record<string, unknown>;
    (globalThis as any).__onebotExecImpl(command, opts, cb);
    return {} as any;
  },
}));

import { convertAmrToMp3, convertSilkToMp3, processVoiceSegments } from '../src/gateway.js';

const sq = (command: string) => [...command.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const dq = (command: string) => [...command.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe('gateway voice conversion', () => {
  let sandboxDir: string;

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), 'onebot-gateway-convert-'));
    (globalThis as any).__onebotExecImpl = (_command: string, _options: Record<string, unknown>, callback: ExecCb) =>
      callback(null, { stdout: '', stderr: '' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(sandboxDir, { recursive: true, force: true });
  });

  it('converts SILK and AMR files to mp3', async () => {
    (globalThis as any).__onebotExecImpl = (command: string, _options: Record<string, unknown>, callback: ExecCb) => {
      void (async () => {
        if (command.includes('pilk.decode')) await writeFile(sq(command)[1], Buffer.from('pcm'));
        if (command.includes('ffmpeg')) await writeFile(dq(command).at(-1)!, Buffer.from('mp3'));
        callback(null, { stdout: '', stderr: '' });
      })();
    };
    const silkPath = join(sandboxDir, 'sample.silk');
    const amrPath = join(sandboxDir, 'sample.amr');
    await writeFile(silkPath, Buffer.from('\u0002#!SILK_V3 payload'));
    await writeFile(amrPath, Buffer.from('#!AMR\npayload'));

    const silk = await convertSilkToMp3(silkPath, { info: vi.fn(), error: vi.fn(), debug: vi.fn() });
    const amr = await convertAmrToMp3(amrPath, { info: vi.fn(), error: vi.fn(), debug: vi.fn() });

    expect(silk).toBe(join(sandboxDir, 'sample.mp3'));
    expect(amr).toBe(join(sandboxDir, 'sample.mp3'));
    expect(existsSync(join(sandboxDir, 'sample.pcm'))).toBe(false);
    expect(existsSync(silkPath)).toBe(false);
    expect(existsSync(amrPath)).toBe(false);
  });

  it('returns null for failed SILK and AMR conversions', async () => {
    (globalThis as any).__onebotExecImpl = (_command: string, _options: Record<string, unknown>, callback: ExecCb) =>
      callback(new Error('ffmpeg failed'));
    const silkPath = join(sandboxDir, 'broken.silk');
    const amrPath = join(sandboxDir, 'broken.amr');
    await writeFile(silkPath, Buffer.from('\u0002#!SILK_V3 broken'));
    await writeFile(join(sandboxDir, 'broken.pcm'), Buffer.from('stale pcm'));
    await writeFile(amrPath, Buffer.from('#!AMR\nbroken'));

    const silk = await convertSilkToMp3(silkPath, { info: vi.fn(), error: vi.fn(), debug: vi.fn() });
    const amr = await convertAmrToMp3(amrPath, { info: vi.fn(), error: vi.fn(), debug: vi.fn() });

    expect(silk).toBeNull();
    expect(amr).toBeNull();
    expect(existsSync(join(sandboxDir, 'broken.pcm'))).toBe(false);
  });

  it('processes local SILK and AMR attachments into audio media entries', async () => {
    (globalThis as any).__onebotExecImpl = (command: string, _options: Record<string, unknown>, callback: ExecCb) => {
      void (async () => {
        if (command.includes('pilk.decode')) await writeFile(sq(command)[1], Buffer.from('pcm'));
        if (command.includes('ffmpeg')) await writeFile(dq(command).at(-1)!, Buffer.from('mp3'));
        callback(null, { stdout: '', stderr: '' });
      })();
    };
    const silkPath = join(sandboxDir, 'voice1.silk');
    const amrPath = join(sandboxDir, 'voice2.amr');
    await writeFile(silkPath, Buffer.from('\u0002#!SILK_V3 inbound'));
    await writeFile(amrPath, Buffer.from('#!AMR\ninbound'));

    const results = await processVoiceSegments([
      { type: 'record', data: { file: `file://${silkPath}` } },
      { type: 'record', data: { file: `file://${amrPath}` } },
    ] as any, { info: vi.fn(), error: vi.fn(), debug: vi.fn() });

    expect(results).toEqual([
      { path: join(sandboxDir, 'voice1.mp3'), contentType: 'audio/mpeg' },
      { path: join(sandboxDir, 'voice2.mp3'), contentType: 'audio/mpeg' },
    ]);
  });
});
