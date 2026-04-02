# dlai-mcp-server

MCP server that makes [DeepLearning.AI](https://www.deeplearning.ai)'s 121-course catalog discoverable from AI coding tools like Claude Code, Codex, and others.

Search courses, explore lesson details, and browse topics — all from your IDE.

## Install

### Claude Code

Add to your MCP config (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "dlai": {
      "command": "npx",
      "args": ["-y", "dlai-mcp-server"]
    }
  }
}
```

### Global install

```bash
npm install -g dlai-mcp-server
```

## Tools

### `search_courses`

Search the DLAI catalog by keyword with optional filters.

```
"Find me courses about RAG"
"Search for beginner agent courses by LangChain"
"What courses does OpenAI partner on?"
```

**Parameters:**
- `query` (required) — search term
- `topic` — filter by topic (e.g., "Agents", "RAG", "Computer Vision")
- `level` — "Beginner", "Intermediate", or "Advanced"
- `partner` — filter by partner (e.g., "OpenAI", "LangChain", "AWS")
- `type` — "Short Course", "Course", or "Specialization"

### `get_course_details`

Get full details for a specific course including lesson-by-lesson breakdown.

```
"Show me the lessons in the ChatGPT Prompt Engineering course"
"What does the LangChain course cover?"
```

**Parameters:**
- `slug` (required) — course slug from search results

**Returns:** Full metadata + lesson list with titles, durations, and content types (video/code/reading).

### `list_topics`

Browse all 38 DLAI topics with course counts.

```
"What topics are available on DeepLearning.AI?"
"How many agent courses are there?"
```

## How it works

The server queries DeepLearning.AI's public course catalog via their Algolia search index. Course data is cached locally at `~/.dlai-mcp/cache/courses.json` (refreshes every 24 hours). Lesson details are fetched on-demand when you request a specific course.

A bundled fallback dataset ensures the server works even if the network is unavailable.

### Cache management

```bash
# Force refresh
dlai-mcp-server --refresh-cache

# Cache location
~/.dlai-mcp/cache/courses.json
```

## Development

```bash
git clone https://github.com/gauravsurtani/dlai-mcp-server
cd dlai-mcp-server
npm install
npm run build
npm test
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
