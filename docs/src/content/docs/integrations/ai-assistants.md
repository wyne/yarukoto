---
title: AI assistants (MCP)
description: Connect an AI assistant to Yarukoto over the Model Context Protocol.
---

The server also speaks the [Model Context Protocol](https://modelcontextprotocol.io) at `/mcp`
(Streamable HTTP, same bearer token), so an AI client can list, add, edit, schedule, complete and
delete tasks. It sits outside `/api/v1` because MCP clients are configured with one URL.

Claude Code:

```bash
claude mcp add --transport http yarukoto https://todo.example.com/mcp \
  --header "Authorization: Bearer $YARUKOTO_TOKEN"
```

Claude Desktop, through the `mcp-remote` bridge in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yarukoto": {
      "command": "npx",
      "args": ["mcp-remote", "https://todo.example.com/mcp", "--header", "Authorization: Bearer YOUR_TOKEN"]
    }
  }
}
```

Tools: `list_lists`, `list_tasks`, `get_task`, `create_task` (takes quick-add text), `update_task`,
`schedule_task`, `complete_task`, `delete_task` (to Trash) and `restore_task`. Relative dates
resolve in `YARUKOTO_TZ`, and any call can pass its own `timeZone`.

The token grants full access, so the same caveat as the app applies: put the server behind HTTPS
before pointing a client at it from outside your network. claude.ai's custom connectors expect
OAuth, which the server doesn't offer yet.
