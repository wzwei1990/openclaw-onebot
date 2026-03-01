# OpenClaw OneBot 11 Channel Plugin

A channel plugin for [OpenClaw](https://github.com/openclaw/openclaw) that connects to [NapCat](https://github.com/NapNeko/NapCatQQ), [go-cqhttp](https://github.com/Mrs4s/go-cqhttp), or any OneBot 11 compatible QQ bot.

## Features

- 🔌 First-class QQ messaging via OneBot 11 protocol
- 📨 Private & group chat support (inbound + outbound)
- 🖼️ Image, audio (record), and file attachments
- 🔄 WebSocket auto-reconnect with exponential backoff
- 🔒 Optional access token authentication
- 🎯 `allowFrom` filtering (private/group/user-level)
- 📊 58 tests passing

## Architecture

```
NapCat (OneBot 11)
  ├── WebSocket → Inbound messages
  └── HTTP API  → Outbound messages
      ↕
OpenClaw OneBot Plugin (ChannelPlugin)
      ↕
OpenClaw Main Session
```

## Installation

```bash
openclaw plugin install openclaw-onebot
```

Or manually:

```bash
cd ~/.openclaw/plugins
git clone https://github.com/xucheng/openclaw-onebot.git onebot
cd onebot && npm install && npm run build
```

Then restart your gateway.

## Configuration

Add to `openclaw.json`:

```json
{
  "channels": {
    "onebot": {
      "enabled": true,
      "wsUrl": "ws://localhost:3001",
      "httpUrl": "http://localhost:3001"
    }
  }
}
```

Or via environment variables:

```bash
ONEBOT_WS_URL=ws://localhost:3001
ONEBOT_HTTP_URL=http://localhost:3001
ONEBOT_ACCESS_TOKEN=your_token  # optional
```

### Advanced Options

```json
{
  "channels": {
    "onebot": {
      "enabled": true,
      "wsUrl": "ws://localhost:3001",
      "httpUrl": "http://localhost:3001",
      "accessToken": "your_token",
      "allowFrom": ["private:12345", "group:67890"],
      "users": ["12345"]
    }
  }
}
```

- **`allowFrom`**: Filter inbound messages — `private:<qq>`, `group:<id>`, or just `<qq>` (matches both)
- **`users`**: Whitelist of QQ user IDs that can trigger the bot
- **`accessToken`**: Sent as `Authorization: Bearer <token>` for HTTP API and as query param for WebSocket

## Target Format

When sending messages, targets use the format:
- `private:<qq_number>` — Private message
- `group:<group_id>` — Group message
- `<qq_number>` — Auto-detected as private

## NapCat Setup

1. Deploy [NapCat](https://github.com/NapNeko/NapCatQQ) (Docker recommended)
2. Enable WebSocket server and HTTP API on the same port (e.g., 3001)
3. Configure the plugin with the NapCat endpoint

## Development

```bash
npm install
npm test          # Run tests
npm run build     # Compile TypeScript
npm run coverage  # Coverage report
```

## License

MIT
