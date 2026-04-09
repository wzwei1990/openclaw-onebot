import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import plugin from '../index.js';
import setupEntry from '../setup-entry.js';
import { onebotPlugin } from '../src/channel.js';
import { clearOneBotRuntime, getOneBotRuntime } from '../src/runtime.js';

describe('plugin entry compatibility', () => {
  beforeEach(() => {
    clearOneBotRuntime();
  });

  afterEach(() => {
    clearOneBotRuntime();
    vi.restoreAllMocks();
  });

  it('default export is a channel entry bound to the onebot plugin', () => {
    expect(plugin.id).toBe('openclaw-onebot');
    expect((plugin as any).channelPlugin).toBe(onebotPlugin);
    expect(typeof plugin.register).toBe('function');
  });

  it('register wires runtime storage and channel registration', () => {
    const runtime = { channel: { activity: { record: () => {} }, routing: {}, reply: {} } } as any;
    const registerChannel = vi.fn();

    plugin.register({
      runtime,
      registerChannel,
      registrationMode: 'full',
    } as any);

    expect(registerChannel).toHaveBeenCalledWith({ plugin: onebotPlugin });
    expect(getOneBotRuntime()).toBe(runtime);
  });

  it('setup entry keeps the plugin id stable while registering the onebot channel', () => {
    const registerChannel = vi.fn();

    expect((setupEntry as any).id).toBe('openclaw-onebot');

    (setupEntry as any).register({
      registerChannel,
      registrationMode: 'setup-only',
    });

    expect(registerChannel).toHaveBeenCalledWith({ plugin: onebotPlugin });
  });
});

describe('package compatibility metadata', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  it('advertises the tested openclaw build and plugin sdk versions', () => {
    expect(packageJson.openclaw.build).toEqual({
      openclawVersion: '2026.4.9',
      pluginSdkVersion: '2026.4.9',
    });
  });

  it('declares the minimum gateway/plugin api version required by the modern sdk entrypoints', () => {
    expect(packageJson.openclaw.compat).toEqual({
      pluginApi: '>=2026.3.23-1',
      minGatewayVersion: '2026.3.23-1',
    });
    expect(packageJson.peerDependencies.openclaw).toBe('>=2026.3.23-1 <2027');
    expect(packageJson.openclaw.setupEntry).toBe('./dist/setup-entry.js');
  });
});
