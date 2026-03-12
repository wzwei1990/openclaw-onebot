---
name: openclaw-onebot
description: OpenClaw OneBot 11 plugin for QQ via NapCat/go-cqhttp. Native channel integration with private/group chat, group reactions, block streaming, voice pipeline, allowFrom filtering, and local install/repair workflow.
---

# OpenClaw OneBot 11 Channel Plugin

[中文](#中文) | [English](#english)

---

## 中文

OpenClaw 的 **OneBot 11 协议通道插件**，让 QQ 成为 OpenClaw 一等消息通道。

支持 [NapCat](https://github.com/NapNeko/NapCatQQ)、[go-cqhttp](https://github.com/Mrs4s/go-cqhttp) 等所有兼容 OneBot 11 协议的 QQ 机器人框架。

说明：

- 插件 `id` 是 `openclaw-onebot`
- 通道 `id` 仍然是 `onebot`
- 因此 `plugins.allow` / `plugins.entries` / `plugins.installs` 使用 `openclaw-onebot`
- `channels.onebot` 保持不变

### 功能

- 原生 OpenClaw ChannelPlugin 集成
- QQ 私聊和群聊收发
- 群聊 reaction
- 群聊自动 reaction，默认开启
- OpenClaw block streaming 分块回复
- QQ 语音链路：SILK/AMR -> MP3 -> STT/TTS -> sendRecord
- 图片、语音、文件附件发送
- `allowFrom` 来源过滤
- WebSocket 自动重连
- 64 个测试用例通过

### 与其他方案对比

| | **openclaw-onebot** | 方案 A | 方案 B |
|---|---|---|---|
| **协议** | OneBot 11 (NapCat/go-cqhttp) | QQ 官方 Bot API | OneBot 11 |
| **集成方式** | OpenClaw 原生 ChannelPlugin | 独立 Python 脚本 + 文件队列 | 独立 Python 脚本 |
| **消息路由** | OpenClaw 自动路由 | 手动桥接 | 手动调用 |
| **Reaction** | 群聊支持 | 无 | 无 |
| **流式回复** | Block streaming | 无 | 无 |
| **语音支持** | 完整自动链路 | 无 | 无 |
| **自动重连** | 指数退避 | 外部守护 | 无 |
| **测试** | 64 tests | 无 | 无 |
| **额外进程** | 不需要 | 需要 | 需要 |

核心区别：

- 这是 OpenClaw 原生插件，不是外挂桥接脚本
- QQ 会像 Telegram、Discord 一样进入统一消息管线
- 不需要额外消息队列或独立 listener

### 适合什么场景

- 想把 QQ 接进 OpenClaw 主网关
- 需要 QQ 私聊和群聊共存
- 需要群聊自动 reaction
- 需要 QQ 端分块连续回复
- 需要处理 QQ 语音消息
- 需要按 `private:<qq>` / `group:<id>` 做精确路由

### 能力边界

- 群聊 reaction 可用
- QQ 私聊 reaction 目前不可靠，不应作为稳定能力依赖
- streaming 这里指 OpenClaw `block streaming`
- QQ 端表现为连续多条分块消息，不是“编辑同一条消息”

### OpenClaw 侧最小配置

```json
{
  "plugins": {
    "allow": ["openclaw-onebot"],
    "entries": {
      "openclaw-onebot": {
        "enabled": true
      }
    }
  },
  "channels": {
    "onebot": {
      "enabled": true,
      "wsUrl": "ws://your-host:3001",
      "httpUrl": "http://your-host:3001",
      "groupAutoReact": true,
      "groupAutoReactEmojiId": 1
    }
  }
}
```

如果你希望 QQ 支持 block streaming，还需要：

```json
{
  "agents": {
    "defaults": {
      "blockStreamingDefault": "on"
    }
  }
}
```

可选调优：

```json
{
  "channels": {
    "onebot": {
      "blockStreamingCoalesce": {
        "minChars": 80,
        "idleMs": 600
      }
    }
  }
}
```

### 常用参数

| 参数 | 说明 |
|---|---|
| `channels.onebot.wsUrl` | OneBot WebSocket 地址 |
| `channels.onebot.httpUrl` | OneBot HTTP API 地址 |
| `channels.onebot.accessToken` | 可选鉴权 token |
| `channels.onebot.allowFrom` | 允许的私聊/群聊来源 |
| `channels.onebot.groupAutoReact` | 群聊自动 reaction 开关，默认 `true` |
| `channels.onebot.groupAutoReactEmojiId` | 默认群聊 reaction emoji id，默认 `1` |
| `agents.defaults.blockStreamingDefault` | 是否默认开启 block streaming |

### 目标格式

- `private:<QQ号>` -> 私聊
- `group:<群号>` -> 群聊
- `<QQ号>` -> 自动识别为私聊

### 这个 skill 会做什么

使用这个 skill 时，默认执行：

1. 克隆或更新 `https://github.com/xucheng/openclaw-onebot.git`
2. 同步到 `~/.openclaw/extensions/onebot`
3. 检查 `~/.openclaw/openclaw.json` 中的插件与通道配置
4. 按需补齐 block streaming 和 group auto reaction 配置
5. 运行 `npm test`
6. 重启 OpenClaw gateway
7. 验证 `openclaw status --deep`
8. 验证 QQ 收发、群聊 reaction、分块回复

### 安装后建议验证

```bash
cd ~/.openclaw/local-plugins/openclaw-onebot
npm test
openclaw status --deep
```

成功标准：

- 测试通过
- `OneBot = ON / OK`
- QQ 能正常收发
- 群聊 reaction 生效
- 开启 streaming 后日志能看到 `deliver(block)`

### 备注

- 这个 skill 用于安装、更新、修复、验收插件，不用于发布代码
- 如果 gateway 重启后短暂断开，等待几秒再查一次即可

---

## English

An **OpenClaw OneBot 11 channel plugin** that makes QQ a first-class OpenClaw channel.

Works with [NapCat](https://github.com/NapNeko/NapCatQQ), [go-cqhttp](https://github.com/Mrs4s/go-cqhttp), and other OneBot 11 compatible QQ bot frameworks.

Notes:

- Plugin id: `openclaw-onebot`
- Channel id: `onebot`
- Use `openclaw-onebot` for `plugins.allow` / `plugins.entries` / `plugins.installs`
- Use `channels.onebot` for runtime channel config

### Features

- Native OpenClaw ChannelPlugin integration
- QQ private and group messaging
- Group reactions
- Automatic group reactions enabled by default
- OpenClaw block streaming
- Voice pipeline for QQ voice messages
- Attachments for images, voice, and files
- `allowFrom` filtering
- WebSocket auto-reconnect
- 64 tests passing

### Comparison

| | **openclaw-onebot** | Solution A | Solution B |
|---|---|---|---|
| **Protocol** | OneBot 11 (NapCat/go-cqhttp) | QQ official bot API | OneBot 11 |
| **Integration** | Native OpenClaw ChannelPlugin | Standalone Python + file queue | Standalone Python scripts |
| **Routing** | Native OpenClaw routing | Manual bridge | Manual API calls |
| **Reactions** | Group chats supported | None | None |
| **Streaming** | Block streaming | None | None |
| **Voice** | End-to-end voice flow | None | None |
| **Reconnect** | Exponential backoff | External daemon | None |
| **Tests** | 64 tests | None | None |
| **Extra process** | No | Yes | Yes |

### Capability boundaries

- Group reactions are supported
- Private-chat reactions are not reliable
- Streaming here means OpenClaw `block streaming`
- QQ receives multiple chunked messages, not in-place message edits

### Minimal OpenClaw config

```json
{
  "plugins": {
    "allow": ["openclaw-onebot"],
    "entries": {
      "openclaw-onebot": {
        "enabled": true
      }
    }
  },
  "channels": {
    "onebot": {
      "enabled": true,
      "wsUrl": "ws://your-host:3001",
      "httpUrl": "http://your-host:3001",
      "groupAutoReact": true,
      "groupAutoReactEmojiId": 1
    }
  }
}
```

To enable block streaming:

```json
{
  "agents": {
    "defaults": {
      "blockStreamingDefault": "on"
    }
  }
}
```

Optional coalescing:

```json
{
  "channels": {
    "onebot": {
      "blockStreamingCoalesce": {
        "minChars": 80,
        "idleMs": 600
      }
    }
  }
}
```

### What this skill does

When used, this skill should:

1. Clone or update `https://github.com/xucheng/openclaw-onebot.git`
2. Sync it into `~/.openclaw/extensions/onebot`
3. Verify plugin and channel config in `~/.openclaw/openclaw.json`
4. Enable block streaming and group auto reactions when requested
5. Run `npm test`
6. Restart the OpenClaw gateway
7. Verify `openclaw status --deep`
8. Verify QQ round-trip messaging, group reactions, and streaming blocks

### Post-install checks

```bash
cd ~/.openclaw/local-plugins/openclaw-onebot
npm test
openclaw status --deep
```

Expected:

- tests pass
- `OneBot = ON / OK`
- QQ messages round-trip
- group reactions are visible
- `deliver(block)` appears in logs when streaming is enabled
