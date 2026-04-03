# dlai-mcp-server

MCP server that makes [DeepLearning.AI](https://www.deeplearning.ai)'s course catalog searchable from AI coding tools like Claude Code, Codex, and Cursor.

Ask questions about 121 courses in natural language — right from your IDE.

---

## Setup (2 minutes, zero code)

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (CLI, desktop app, or VS Code extension)
- That's it. No API keys, no accounts, no dependencies.

### Step 1: Add the MCP server

Open your terminal and run:

```bash
# Open your Claude Code MCP config
code ~/.claude.json        # VS Code
# OR
nano ~/.claude.json        # Terminal
```

Add this inside the `"mcpServers"` section (create it if it doesn't exist):

**Option A: Local via npx (recommended)**

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

**Option B: Remote hosted server**

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

> Note: Remote URL MCP support varies by Claude Code version. If Option B doesn't connect, use Option A.
> If you already have other MCP servers configured, just add the `"dlai"` entry alongside them.

### Step 2: Restart Claude Code

Close and reopen Claude Code (or restart the CLI). The MCP server connects automatically.

### Step 3: You'll see a security prompt

Claude Code will show a message like **"Allow connection to dlai-mcp-server?"** — this is normal. It appears for all third-party MCP servers. The server only reads public course data from deeplearning.ai.

**Click "Allow" or "Trust"** to proceed. This is a one-time prompt.

### Step 4: Start asking questions

```
> "What courses does DeepLearning.AI offer about RAG?"
```

That's it. You're done.

---

## What Can I Ask? (Verified Examples)

Once connected, just talk naturally. Claude automatically picks the right tool. Every example below was tested against the live server on April 2, 2026.

### Find courses

> **"What courses about RAG?"**
> Returns 35 courses including Retrieval Augmented Generation (RAG), Building Multimodal Search and RAG, Building Agentic RAG with LlamaIndex, Knowledge Graphs for RAG, and 31 more.

> **"Find beginner courses on AI agents"**
> Returns 17 courses: Governing AI Agents (Databricks), Evaluating AI Agents (Arize AI), Agent Skills with Anthropic, Practical Multi AI Agents with crewAI, and more.

> **"What does OpenAI partner with DLAI on?"**
> Returns 4 courses: Reasoning with o1, Collaborative Writing and Coding with OpenAI Canvas, Building Systems with the ChatGPT API, ChatGPT Prompt Engineering for Developers.

> **"What courses does Andrew Ng teach?"**
> Returns 13 courses: Build with Andrew, Agentic AI, AI Python for Beginners, Machine Learning Specialization, and more.

> **"Show me courses about prompt engineering"**
> Returns 46 courses across beginner and intermediate levels from partners like Meta, OpenAI, Comet, and more.

> **"What LangChain courses are there?"**
> Returns 5 courses: Build LLM Apps with LangChain.js, Functions Tools and Agents with LangChain, LangChain Chat with Your Data, LangChain for LLM Application Development, AI Agents in LangGraph.

> **"What Specializations are available?"**
> Returns 14 specializations: PyTorch for Deep Learning, Data Analytics, Generative AI for Software Development, Data Engineering, AI for Good, Machine Learning, and more.

### Explore a specific course

> **"What does the ChatGPT Prompt Engineering course cover?"**
> Returns: 10 lessons | 7 code examples | 1h 30m total
> Lessons: Introduction (6m), Guidelines (17m), Iterative (13m), Summarizing (8m), Inferring (12m), Transforming (13m), Expanding (7m), Chatbot (12m), Conclusion (2m), Quiz.

> **"How many lessons in the crewAI multi-agent course?"**
> Returns: 20 lessons | 7 code examples | 2h 43m total
> Covers: AI Agents overview, creating research agents, customer support automation, agent tools, event planning automation, financial analysis, job application tailoring, and more.

> **"Tell me about Building Agentic RAG with LlamaIndex"**
> Returns: 7 lessons | 4 code examples | 45m total
> Lessons: Introduction, Router Query Engine, Tool Calling, Building an Agent Reasoning Loop, Building a Multi-Document Agent, Conclusion, Quiz.

### Browse topics

> **"What topics are available on DeepLearning.AI?"**
> Returns 38 topics. Top 10 by course count:
> - GenAI Applications: 60 courses
> - Prompt Engineering: 46 courses
> - Agents: 41 courses
> - RAG: 34 courses
> - Generative Models: 30 courses
> - LLMOps: 27 courses
> - Search and Retrieval: 24 courses
> - Chatbots: 23 courses
> - Task Automation: 20 courses
> - AI Frameworks: 20 courses

### Combined filters

> **"Find beginner Agent courses"** (topic + level filter)
> Returns 17 courses from Anthropic, CrewAI, Databricks, Replit, LlamaIndex, Windsurf, Arize AI, OpenAI, and more.

> **"Fine-tuning courses"**
> Returns 17 courses covering post-training, GRPO, LLM serving, pretraining, vision model prompting, and more.

### Edge cases

> **"Courses on kubernetes?"** → 0 results (not in catalog)
> **"Advanced courses?"** → 0 results (DLAI only has Beginner and Intermediate levels)
> **Invalid course slug** → Clear error message: "Course not found. Use search_courses to find valid slugs."

### Recommendations (Claude combines results with reasoning)

These prompts work because Claude uses the search tools and then reasons about the results:

```
"I'm a Python developer new to AI. Where should I start?"
"What's the fastest path to learning RAG?"
"Compare the beginner RAG courses — which one should I take first?"
"I want to learn about AI agents. Give me a 4-week learning plan."
```

---

## Try It Right Now (no install)

Want to verify the server works before adding it to Claude Code? Run this in your terminal:

```bash
# 1. Check the server is alive
curl https://dlai-mcp-server-production.up.railway.app/health
# Expected: {"status":"ok","courses":121}

# 2. See server info
curl https://dlai-mcp-server-production.up.railway.app/
# Returns: server name, version, course count, tool list

# 3. Test the MCP handshake
curl -X POST https://dlai-mcp-server-production.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":0}'
# Expected: SSE response with server capabilities and 3 tools
```

If all 3 return data, the server is working. Add it to your config and start asking questions.

---

## Alternative: Run Locally

If you prefer running the server on your machine instead of using the hosted version:

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

Requires Node.js 18+. Data is cached locally at `~/.dlai-mcp/cache/courses.json` and auto-refreshes every 24 hours.

---

## Use Cases

| Who | Example Question |
|-----|-----------------|
| **Developer learning AI** | "I know Python but nothing about LLMs. Where do I start?" |
| **Team lead** | "Find courses to upskill my team on RAG and agents" |
| **Student** | "What's the shortest course that covers prompt engineering?" |
| **Career switcher** | "I'm a backend dev. What's the path to AI engineering?" |
| **Bootcamp instructor** | "Map the DLAI curriculum to my syllabus on generative AI" |
| **Hiring manager** | "What skills does the DLAI catalog cover? Map to my job reqs" |

---

## How It Works

```
You ask a question in Claude Code
       |
       v
Claude picks the right tool automatically
       |
       v
dlai-mcp-server searches DeepLearning.AI's course catalog
       |
       v
Claude formats the answer in natural language
```

The server queries the same Algolia search index that powers deeplearning.ai/courses. No scraping, no hacks — just the public search API.

- **121 courses** across **38 topics** from **70+ partners** (OpenAI, Google, AWS, Meta, etc.)
- **Lesson-level data** fetched on-demand when you ask about a specific course
- **Always up-to-date** — queries the live catalog, cached for 24h

---

## Tools Reference

For developers building on top of this MCP server:

### `search_courses`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search term (e.g., "RAG", "agents") |
| `topic` | No | Filter by topic (e.g., "Agents", "Computer Vision") |
| `level` | No | "Beginner", "Intermediate", or "Advanced" |
| `partner` | No | Filter by partner (e.g., "OpenAI", "LangChain") |
| `type` | No | "Short Course", "Course", or "Specialization" |

### `get_course_details`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `slug` | Yes | Course slug from search results |

Returns: full metadata, lesson list with titles/durations/types, prerequisites, learning outcomes, code example count.

### `list_topics`

No parameters. Returns all 38 topics with course counts and top 3 example courses per topic.

---

## FAQ

**Q: Is this official?**
A: No. This is a community-built tool that reads public data from deeplearning.ai. Not affiliated with or endorsed by DeepLearning.AI.

**Q: Why does Claude Code show a security warning?**
A: Claude Code warns you when connecting to any third-party MCP server. This is normal and expected. Click "Allow" — the server only reads public course metadata.

**Q: Is my data being collected?**
A: No. The server is stateless. It doesn't log queries, track users, or store any personal data. All it does is proxy requests to DeepLearning.AI's public course catalog.

**Q: How current is the data?**
A: Live. The server queries the same Algolia index that powers deeplearning.ai/courses. New courses appear within 24 hours (cache TTL).

**Q: Can I use this with Codex or Cursor?**
A: Yes, if your tool supports MCP over Streamable HTTP. Use the URL: `https://dlai-mcp-server-production.up.railway.app/mcp`

**Q: The server is down / returning errors?**
A: Check status: `curl https://dlai-mcp-server-production.up.railway.app/health`. If it's down, open an issue on GitHub.

---

## Roadmap

- **Phase 1 (shipped):** Course search, lesson details, topic browsing
- **Phase 2:** Semantic search, learning path generation, course comparisons
- **Phase 3:** Code example extraction, transcript search (requires DLAI eng partnership)

---

## Development

```bash
git clone https://github.com/gauravsurtani/dlai-mcp-server
cd dlai-mcp-server
npm install
npm run build
npm test                   # 25 tests, all passing

# Test with MCP Inspector (visual):
npx @modelcontextprotocol/inspector node dist/index.js

# Test from CLI:
bash tests/mcp-test.sh search_courses '{"query":"RAG"}'
```

## Contributing

Issues and PRs welcome at [github.com/gauravsurtani/dlai-mcp-server](https://github.com/gauravsurtani/dlai-mcp-server).

## License

MIT
