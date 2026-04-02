# Deep Interview Spec: DeepLearning.AI MCP Server

## Metadata
- Interview Rounds: 6
- Final Ambiguity Score: 14%
- Type: Greenfield
- Generated: 2026-04-02
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-|-|-|-|
| Goal Clarity | 0.90 | 0.40 | 0.36 |
| Constraint Clarity | 0.85 | 0.30 | 0.255 |
| Success Criteria | 0.80 | 0.30 | 0.24 |
| **Total Clarity** | | | **0.855** |
| **Ambiguity** | | | **14.5%** |

## Goal

Build an MCP server that makes DeepLearning.AI's 121-course catalog discoverable and queryable from AI coding tools (Claude Code, Codex, etc.). The MVP uses publicly available data from `deeplearning.ai/courses/` — no internal API required. This serves as a proof-of-concept to later pitch the DLAI engineering team for deeper API access (transcripts, notebook code, user data).

## Phased Roadmap

```
Phase 1 (MVP):      Course search + metadata via 3 MCP tools
Phase 2 (Advanced):  Lesson-level content lookup
Phase 3 (Advanced):  Smart learning path recommendations
Phase 4 (Premium):   Code example extraction from notebooks (requires internal API)
```

## MVP Scope — 3 MCP Tools

### Tool 1: `search_courses`
- **Description:** Search the DLAI course catalog by keyword with optional filters
- **Input:**
  - `query` (string, required): Search query (e.g., "RAG", "agents", "prompt engineering")
  - `topic` (string, optional): Filter by topic (e.g., "Agents", "RAG", "Computer Vision")
  - `level` (string, optional): "Beginner" | "Intermediate" | "Advanced"
  - `partner` (string, optional): Filter by partner org (e.g., "OpenAI", "LangChain", "AWS")
  - `type` (string, optional): "Short Course" | "Course" | "Specialization"
- **Output:** Array of matching courses with:
  - `title`, `slug`, `description`, `instructors[]`, `level`, `partner`, `duration`, `type`, `topics[]`, `url`

### Tool 2: `get_course_details`
- **Description:** Get full details for a specific course including lesson list
- **Input:**
  - `slug` (string, required): Course slug (e.g., "chatgpt-prompt-engineering-for-developers")
- **Output:**
  - All fields from search_courses, PLUS:
  - `lessons[]`: Array of { `title`, `duration`, `type` (video/code/reading) }
  - `prerequisites`, `learning_outcomes[]`, `total_duration`, `lesson_count`, `code_example_count`

### Tool 3: `list_topics`
- **Description:** List all available DLAI topics with course counts
- **Input:** None
- **Output:** Array of { `topic`, `course_count`, `example_courses[]` (top 3 per topic) }

## Architecture

```
deeplearning.ai/courses/    (public website)
       |
       v
  Scraper (Cheerio)          <-- runs on install or daily cron
  Parse HTML + JSON-LD
       |
       v
  Local JSON cache           <-- courses.json (~121 courses)
  (~/.dlai-mcp/cache/)
       |
       v
  MCP Server (TypeScript)    <-- @modelcontextprotocol/sdk
  STDIO transport
       |
       v
  Claude Code / Codex / etc.
```

## Tech Stack
- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Scraping:** Cheerio (HTML parsing) + native fetch
- **Cache:** Local JSON file (`~/.dlai-mcp/cache/courses.json`)
- **Transport:** STDIO (standard for Claude Code MCP servers)
- **Build:** tsx or tsup for bundling
- **Package manager:** npm

## Constraints
- Public data only for MVP (no DLAI internal APIs)
- DLAI website has 121 courses across 7 pages (20/page pagination)
- Individual course pages at `/short-courses/{slug}` and `/courses/{slug}` have lesson-level data
- Schema.org JSON-LD is present on course pages (potential structured data source)
- 37 topics, 70+ partner organizations
- Short courses hosted on `learn.deeplearning.ai` (not Coursera)
- Specializations may link to Coursera

## Non-Goals
- User authentication or enrollment data (Phase 4+ with internal API)
- Course content playback or video access
- Notebook/code execution
- Payment or subscription management
- Real-time sync with DLAI backend (daily cache refresh is sufficient)
- Coursera API integration (out of scope for MVP)

## Acceptance Criteria
- [ ] MCP server installs via `npx` or npm global install
- [ ] `search_courses` returns relevant results for "RAG", "agents", "prompt engineering"
- [ ] `get_course_details` returns lesson list for at least 5 tested courses
- [ ] `list_topics` returns all 37 DLAI topics with correct course counts
- [ ] Server works in Claude Code via MCP config (`~/.claude.json` or project `.mcp.json`)
- [ ] Cache refreshes on first run and via manual trigger
- [ ] Response time < 500ms for cached queries
- [ ] README with installation instructions and example queries
- [ ] Published to npm as `dlai-mcp-server` (or similar)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|-|-|-|
| Need internal API for MVP | Contrarian: DLAI site already has structured data | Public data is sufficient for MVP; internal API is Phase 4+ |
| Build both paths simultaneously | Simplifier: focus on one | Public path first, demo to eng team, then request API access |
| Python is the natural choice | Simplifier: what's leanest? | TypeScript — standard MCP ecosystem, native Claude Code support |
| Database needed | Simplifier: what's simplest? | JSON file cache — 121 courses fits in memory |

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|-|-|-|-|
| Course | core domain | title, slug, description, instructors, level, partner, duration, type, topics, url | has many Lessons, belongs to Topics |
| Lesson | core domain | title, duration, content_type (video/code/reading) | belongs to Course |
| Topic | supporting | name, course_count | has many Courses |
| Partner | supporting | name, logo_url | has many Courses |
| Cache | infrastructure | courses_json, last_updated, ttl | stores Courses |
| MCP Tool | infrastructure | name, description, input_schema, output_schema | serves Courses/Topics |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-|-|-|-|-|-|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1 | 0 | 4 | 80% |
| 3 | 7 | 2 | 0 | 5 | 71% |
| 4 | 8 | 1 | 0 | 7 | 87% |
| 5 | 8 | 0 | 0 | 8 | 100% |
| 6 | 8 | 0 | 0 | 8 | 100% |

## Future Phases (Post-MVP)

### Phase 2: Lesson-Level Lookup
- New tool: `get_lesson_details` — returns lesson summary, key concepts
- Requires scraping individual course pages more deeply

### Phase 3: Learning Path Recommendations
- New tool: `recommend_learning_path` — takes a goal, returns ordered course sequence
- Could use LLM-generated recommendations based on course metadata + topics

### Phase 4: Code Example Extraction (Internal API Required)
- New tool: `get_code_examples` — returns notebook code from specific lessons
- Requires: DLAI eng team API access to `learn.deeplearning.ai` content
- Pitch: "Here's what we built on public data. With notebook access, we can make DLAI the go-to learning resource inside every AI coding tool."

## Interview Transcript

<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1
**Q:** When a developer installs this MCP server in Claude Code and types a natural language query, what's the ONE thing they should be able to do that they can't do today?
**A:** All — course discovery, lesson-level content, learning paths, AND community discoverability
**Ambiguity:** 73% (Goal: 0.50, Constraints: 0.10, Criteria: 0.15)

### Round 2
**Q:** You mentioned two paths: external scraping vs internal API. Which can you START with in 2 weeks?
**A:** Both in parallel — external scraper AND pitch eng team. External is fallback.
**Ambiguity:** 60% (Goal: 0.55, Constraints: 0.45, Criteria: 0.15)

### Round 3
**Q:** What's the ONE query you type into Claude Code that makes the eng team say 'wow'?
**A:** Phase 1: Course search + metadata (MVP). Then lesson lookup, recommendations, code extraction.
**Ambiguity:** 44% (Goal: 0.70, Constraints: 0.45, Criteria: 0.50)

### Round 4 (Contrarian Mode)
**Q:** If DLAI already has structured data on its website, why does the eng team need to build a separate API?
**A:** Build on public data first for MVP, internal API later.
**Ambiguity:** 35% (Goal: 0.75, Constraints: 0.65, Criteria: 0.50)

### Round 5
**Q:** Are these 3 MCP tools the right MVP scope? search_courses, get_course_details, list_topics
**A:** These 3 are perfect.
**Ambiguity:** 22% (Goal: 0.85, Constraints: 0.70, Criteria: 0.75)

### Round 6 (Simplifier Mode)
**Q:** TypeScript or Python for the MCP server?
**A:** TypeScript (Recommended)
**Ambiguity:** 14% (Goal: 0.90, Constraints: 0.85, Criteria: 0.80)

</details>
