# dlai-mcp-server

MCP server that makes [DeepLearning.AI](https://www.deeplearning.ai)'s 121-course catalog discoverable from AI coding tools like Claude Code, Codex, and others.

Ask questions about courses in natural language — right from your IDE.

## Quick Start (30 seconds)

### Option A: Remote (no install needed)

Add to your Claude Code MCP config (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "dlai": {
      "type": "url",
      "url": "https://dlai-mcp-server-production.up.railway.app/mcp"
    }
  }
}
```

### Option B: Local (runs on your machine)

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

Restart Claude Code. That's it — start asking questions.

## What Can I Ask?

Once installed, just talk to Claude naturally. Here are real examples:

### "What should I learn?"

```
> "I want to learn how to build AI agents from scratch. What courses should I take?"

Claude will search the catalog, find agent-related courses, and recommend a learning path
based on difficulty level and prerequisites.
```

### "Find me something specific"

```
> "Find beginner courses about RAG by LlamaIndex"
> "What courses does Andrew Ng teach?"
> "Show me all courses about prompt engineering"
> "Are there any courses on computer vision?"
```

### "Tell me what's in a course"

```
> "What does the ChatGPT Prompt Engineering course cover?"
> "How many lessons are in the crewAI multi-agent course?"
> "Show me the full lesson breakdown for Building Agentic RAG"
```

### "Help me compare"

```
> "Compare the RAG courses — which ones are for beginners vs advanced?"
> "What's the difference between the LangChain and LlamaIndex agent courses?"
```

### "What topics exist?"

```
> "What topics are available on DeepLearning.AI?"
> "How many courses are there about Agents?"
> "What are the most popular topics?"
```

## Use Cases

| Who | How They Use It |
|-----|----------------|
| **Developer learning AI** | "I know Python but nothing about LLMs. Where do I start?" |
| **Team lead** | "Find courses to upskill my team on RAG and agents" |
| **Student** | "What's the shortest course that covers prompt engineering?" |
| **Career switcher** | "I'm a backend dev. What's the path to AI engineering?" |
| **AI practitioner** | "Are there any advanced courses on fine-tuning?" |
| **Hiring manager** | "What skills does the DLAI curriculum cover? Map it to my job reqs" |

## Tools Reference

### `search_courses`

Search the catalog by keyword with optional filters.

**Parameters:**
- `query` (required) — search term (e.g., "RAG", "agents", "prompt engineering")
- `topic` — filter by topic (e.g., "Agents", "RAG", "Computer Vision")
- `level` — "Beginner", "Intermediate", or "Advanced"
- `partner` — filter by partner (e.g., "OpenAI", "LangChain", "AWS")
- `type` — "Short Course", "Course", or "Specialization"

### `get_course_details`

Get full details including lesson-by-lesson breakdown.

**Parameters:**
- `slug` (required) — course slug from search results

**Returns:** title, description, instructors, level, partner, prerequisites, learning outcomes, lesson list (with titles, durations, types), code example count.

### `list_topics`

Browse all 38 topics with course counts and example courses.

**No parameters.** Returns every topic with how many courses cover it.

## How It Works

```
User asks a question in Claude Code
       |
       v
Claude invokes the appropriate MCP tool
       |
       v
dlai-mcp-server queries DeepLearning.AI's Algolia search index
       |
       v
Results cached locally (24h TTL) or served from Railway
       |
       v
Claude formats the answer naturally
```

- **121 courses** across 38 topics from 70+ partners
- **Lesson-level data** fetched on-demand for individual courses
- **Bundled fallback** ensures it works even if the network is unavailable
- **robots.txt** permits access (`Allow: /`, no crawl-delay)

## Roadmap

### Phase 1 (shipped)
- Course search with filters (topic, level, partner, type)
- Lesson-level details with durations and content types
- Topic browsing with course counts
- Hosted on Railway + local via npx

### Phase 2 (next)
- Semantic search ("courses about building things that remember context")
- Learning path generation ("I want to go from zero to agent builder")
- Course comparison tool
- Instructor profiles

### Phase 3 (with DLAI eng team)
- Code example extraction from course notebooks
- Transcript search ("which lesson explains attention mechanisms?")
- Enrollment + progress tracking (authenticated)
- Push to DLAI's official MCP registry

## Hosting

| Mode | URL / Command | For |
|------|--------------|-----|
| **Remote** | `https://dlai-mcp-server-production.up.railway.app/mcp` | Zero-install, hosted on Railway |
| **Local** | `npx dlai-mcp-server` | Offline-capable, runs on your machine |
| **Health** | `GET /health` | Monitoring |
| **Info** | `GET /` | Server metadata |

## Testing

### 1. Verify the remote server is running

```bash
curl https://dlai-mcp-server-production.up.railway.app/health
# Expected: {"status":"ok","courses":121}
```

### 2. Test in Claude Code (recommended)

After adding the MCP config and restarting Claude Code, try these prompts:

```
"Search for RAG courses on DeepLearning.AI"
"What does the ChatGPT Prompt Engineering course cover?"
"List all topics on DeepLearning.AI"
"Find beginner agent courses"
```

If Claude invokes the tools and returns course data, it's working.

### 3. MCP Inspector (visual tool explorer)

```bash
# For local server:
cd dlai-mcp-server
npm run build
npx @modelcontextprotocol/inspector node dist/index.js

# Opens a browser UI — click each tool, fill parameters, see responses
```

### 4. CLI quick test

```bash
# Test each tool from the terminal:
bash tests/mcp-test.sh search_courses '{"query":"RAG"}'
bash tests/mcp-test.sh search_courses '{"query":"agents","level":"Beginner"}'
bash tests/mcp-test.sh list_topics '{}'
bash tests/mcp-test.sh get_course_details '{"slug":"chatgpt-prompt-engineering-for-developers"}'
```

Expected output:
```
Results: 35 items
  - Retrieval Augmented Generation (RAG)
  - Building Multimodal Search and RAG
  - Building Agentic RAG with LlamaIndex
  ...
```

### 5. Unit tests

```bash
npm test
# Expected: 25 passed (25), 0 failed
```

### 6. Verify data accuracy

```bash
# Compare cached data against live Algolia API:
curl -s "https://Y5109WLMQW-dsn.algolia.net/1/indexes/courses_date_desc?query=&hitsPerPage=200" \
  -H "X-Algolia-Application-Id: Y5109WLMQW" \
  -H "X-Algolia-API-Key: 9030ff79d3ba653535d5b66c26b56683" | \
  python3 -c "import json,sys; print(f'{len(json.load(sys.stdin)[\"hits\"])} courses live')"
# Should match the number from /health endpoint
```

## Development

```bash
git clone https://github.com/gauravsurtani/dlai-mcp-server
cd dlai-mcp-server
npm install
npm run build
npm test
```

## Cache Management

```bash
# Force refresh (local mode only)
dlai-mcp-server --refresh-cache

# Cache location
~/.dlai-mcp/cache/courses.json

# Cache auto-refreshes every 24 hours
```

## License

MIT
