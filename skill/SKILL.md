---
name: openclaw-onebot
description: Install, update, or repair the OpenClaw OneBot plugin for QQ/NapCat, then verify message routing, block streaming, and group reactions on a local OpenClaw setup.
---

# OpenClaw OneBot

Use this skill when the user wants to install, update, repair, or verify the `openclaw-onebot` plugin on a local OpenClaw setup.

Published ClawHub slug: `openclaw-onebot`

## What this skill does

- Clones or updates `https://github.com/xucheng/openclaw-onebot.git`
- Syncs the plugin into `~/.openclaw/extensions/onebot`
- Ensures the plugin is enabled in `~/.openclaw/openclaw.json`
- Verifies OneBot channel config, block streaming, and group auto reactions
- Rebuilds the plugin, restarts the local OpenClaw gateway, and checks health

## Default workflow

When using this skill, perform these steps directly:

1. Clone or update `https://github.com/xucheng/openclaw-onebot.git` into `~/.openclaw/local-plugins/openclaw-onebot`
2. Sync the repo into `~/.openclaw/extensions/onebot`
3. Ensure `~/.openclaw/openclaw.json` contains:
   - `plugins.allow` including `openclaw-onebot`
   - `plugins.entries.openclaw-onebot.enabled = true`
   - `plugins.installs.openclaw-onebot` pointing at the local plugin and extension paths
   - `channels.onebot` with valid `wsUrl` and `httpUrl`
4. If the user wants QQ block streaming, ensure:
   - `agents.defaults.blockStreamingDefault = "on"`
   - optional `channels.onebot.blockStreamingCoalesce`
5. Build the plugin and run its test suite
6. Restart the local OpenClaw gateway
7. Verify:
   - `openclaw status --deep`
   - OneBot channel is `ON / OK`
   - a QQ test message can round-trip
   - group auto reaction is visible in QQ group chat when enabled

## What to verify after install

Run these checks:

```bash
cd ~/.openclaw/local-plugins/openclaw-onebot
npm test
openclaw status --deep
```

Expected outcomes:

- tests pass
- `openclaw status --deep` shows `OneBot = ON / OK`
- QQ private and/or group messages can be received and replied to

## Notes

- This skill installs and verifies the plugin from GitHub; it does not publish code.
- QQ private-chat reactions are not reliable; treat group reactions as the supported path.
- If the gateway briefly disconnects after restart, retry once after a short delay.
