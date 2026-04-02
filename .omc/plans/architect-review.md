# Architect Review: DLAI MCP Server Implementation Plan

**Reviewer:** Architect (Ralplan Consensus)
**Date:** 2026-04-02
**Plan Reviewed:** `.omc/plans/planner-draft.md`
**Spec Reviewed:** `.omc/specs/deep-interview-dlai-mcp.md`
**Verdict:** **ITERATE** (3 specific changes required before execution)

---

## Summary

The plan is structurally sound — layered module architecture is the right call, JSON cache is appropriate for 121 records, and the phased task flow is well-sequenced. However, live verification of the DLAI website reveals **three material gaps** that will cause implementation failures if not addressed: (1) the catalog page serves data via embedded Algolia JSON in `__NEXT_DATA__`, not traditional HTML cards, making the Cheerio-based scraping strategy partially wrong; (2) the MCP SDK API has changed — the plan references `Server` and `setRequestHandler` but the current SDK uses `McpServer` and `registerTool`; (3) the plan underestimates first-run latency and has no strategy for the 24-second cold start when scraping 121 course detail pages.

---

## Analysis

### 1. CRITICAL: Scraper Strategy Misaligned With Actual Site Structure

**Finding:** The DLAI catalog page (`deeplearning.ai/courses/`) is a Next.js SSG application backed by Algolia search. Course data is **not in HTML card elements** — it is embedded as a JSON payload inside a `<script id="__NEXT_DATA__">` tag.

**Evidence (live verification):**
- Catalog page contains `__NEXT_DATA__` with `initialResults` object
- Each course "hit" has: `title`, `slug`, `course_type`, `skill_level`, `partnership`, `topic`, `description`, `instructors`, `date`, `landing_page`
- Pagination metadata: `nbHits: 121`, `page: 0` (zero-indexed), `nbPages: 7`, `hitsPerPage: 20`
- The Algolia index name is `courses_date_desc`

**What the plan says (Step 2, line 109):**
> `scrapeCatalog()`: Fetches all 7 pages of `/courses/?page=N`, parses course cards via Cheerio

**What should happen:** Cheerio is still the right tool, but the target is `JSON.parse()` of the `__NEXT_DATA__` script tag content, not CSS-selector-based card extraction. The scraper should:
1. Fetch each page
2. Extract `__NEXT_DATA__` JSON via Cheerio (`$('script#__NEXT_DATA__').text()`)
3. Parse the Algolia hits from `pageProps.initialResults[indexName].results[0].hits`

**Individual course pages** (`/short-courses/{slug}`) also use `__NEXT_DATA__` with lesson data in an `outlineList` array containing `slug`, `name`, `type`, `time` fields. This is confirmed via live fetch.

**Impact:** If the executor builds CSS-selector-based scraping per the current plan, it will extract zero courses. This is a blocking issue.

### 2. CRITICAL: MCP SDK API References Are Outdated

**Finding:** The plan references patterns from an older MCP SDK version.

**What the plan says (Step 5, line 200-201):**
> Register all 3 tools via `server.setRequestHandler(ListToolsRequestSchema, ...)` and `server.setRequestHandler(CallToolRequestSchema, ...)`

**Current SDK API (verified from official docs):**
```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'dlai-mcp-server', version: '1.0.0' });

server.registerTool('search_courses', {
    description: 'Search DLAI courses',
    inputSchema: z.object({ query: z.string() }),
}, async ({ query }) => {
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});

await server.connect(new StdioServerTransport());
```

**Key differences:**
- Class is `McpServer`, not `Server`
- Import from `@modelcontextprotocol/server`, not `@modelcontextprotocol/sdk`
- Tool registration via `server.registerTool()`, not `setRequestHandler()`
- Zod import is `zod/v4`, not `zod`
- No need for separate `ListToolsRequestSchema` / `CallToolRequestSchema` handlers — `registerTool` handles both automatically

**Impact:** The executor will hit import errors and API mismatches immediately. Must be corrected in the plan.

### 3. HIGH: First-Run Cold Start Is Unaddressed

**Finding:** The open questions file (line 9) correctly flags this, but the plan itself (Step 5) does not incorporate the recommended mitigation.

**The problem:** On first run (no cache), the server must scrape all catalog pages + potentially 121 course detail pages. At 200ms delay per request: `7 catalog pages + 121 detail pages = 128 requests * 200ms = ~26 seconds`. During this time, the MCP client (Claude Code) is waiting for the server to connect, and the user sees nothing.

**The plan says (Step 5, line 203):**
> If not [valid cache], run `scrapeCatalog()` to populate cache (log progress to stderr)

**This is ambiguous:** Does `scrapeCatalog()` fetch only the 7 catalog pages (~1.4s) or all 121 detail pages too? The open questions file recommends "catalog-only on startup, lazy-scrape details" — this MUST be promoted into the plan, not left as an open question.

**Recommended strategy:**
- **Startup:** Scrape only 7 catalog pages (~1.4s). Cache course metadata immediately.
- **On `get_course_details` call:** If lesson data missing for that slug, scrape the individual course page on-demand, merge into cache.
- This is already hinted at in Step 4 (line 172): "If not, trigger scrape of individual course page" — but Step 5 must explicitly NOT scrape all detail pages at startup.

### 4. MEDIUM: Pagination Is Zero-Indexed, Plan Assumes 1-Indexed

**Finding:** The plan says "Fetches all 7 pages of `/courses/?page=N`" without specifying the index base. Live verification shows `page: 0` in the Algolia data, meaning pages are `?page=0` through `?page=6`, not `?page=1` through `?page=7`.

**Impact:** Off-by-one will either miss the last page or 404 on a non-existent page. Minor but real.

### 5. MEDIUM: URL Patterns Are Mixed

**Finding:** The plan doesn't acknowledge that courses have two distinct URL patterns:
- Short courses: `/short-courses/{slug}`
- Regular courses/specializations: `/courses/{slug}`

The `landing_page` field in the Algolia data contains the correct path for each. The scraper must use this field rather than hardcoding a single URL pattern.

**Impact:** `get_course_details` will 404 for ~50% of courses if it assumes a single URL prefix.

### 6. LOW: Cheerio Dependency May Be Unnecessary for Catalog

**Finding:** Since catalog data is pure JSON embedded in `__NEXT_DATA__`, you could extract it with a regex or simple string split + `JSON.parse()` without Cheerio for catalog pages. However, Cheerio is still useful for individual course pages where lesson data might be in HTML, and for robustly extracting the `<script>` tag. Keeping Cheerio is fine, but the plan should clarify that the primary extraction method is JSON parsing, not HTML traversal.

### 7. LOW: `robots.txt` Is Permissive — But No Mention in Plan

**Finding:** DLAI's `robots.txt` has `Allow: /` with no crawl-delay. This is good news — scraping is explicitly permitted. The plan mentions "Polite User-Agent" in the risk table but should note the `robots.txt` finding as validation that the approach is legally/ethically sound.

---

## Root Cause

The plan was written based on assumptions about the DLAI website structure (HTML card elements, CSS selectors) rather than verified observation. The MCP SDK references are from an older version of the docs. Both are correctable with targeted amendments — the architecture itself (layered modules, JSON cache, STDIO transport) is sound.

---

## Recommendations

| # | Change | Effort | Impact | Priority |
|-|-|-|-|-|
| 1 | **Rewrite Step 2 scraper strategy:** Target `__NEXT_DATA__` JSON extraction, not HTML cards. Document the Algolia hit schema. Update test fixtures to use JSON payloads, not HTML fragments. | S | Blocking — scraper won't work without this | MUST |
| 2 | **Update Step 5 MCP SDK references:** `McpServer` not `Server`, `registerTool()` not `setRequestHandler()`, import from `@modelcontextprotocol/server`, use `zod/v4`. | S | Blocking — server won't compile | MUST |
| 3 | **Promote lazy-scrape strategy into Step 5:** Startup scrapes catalog only (7 pages). Course details scraped on-demand per `get_course_details` call. Explicitly state this in the plan, not just open questions. | S | High — 26s cold start is unacceptable UX | MUST |
| 4 | Fix pagination to zero-indexed (`?page=0` through `?page=6`). | XS | Medium — off-by-one bug | SHOULD |
| 5 | Use `landing_page` field from Algolia data for course detail URLs instead of hardcoding `/short-courses/` prefix. | XS | Medium — half the courses will 404 | SHOULD |
| 6 | Add note that `robots.txt` permits scraping (validation of approach). | XS | Low — documentation quality | NICE |

---

## Trade-offs

| Option | Pros | Cons |
|-|-|-|
| **JSON extraction from `__NEXT_DATA__`** (recommended) | Structured data, no brittle CSS selectors, all fields pre-parsed by Algolia | Depends on Next.js page structure; if DLAI migrates away from Next.js, this breaks. But this is MORE resilient than CSS selectors, not less. |
| **Direct Algolia API calls** (alternative) | Even more reliable; official search API; supports filtering/sorting natively | Requires discovering the public API key (not found in quick scan); couples to Algolia specifically; may violate ToS if key isn't meant to be public |
| **Catalog-only startup + lazy detail scrape** (recommended) | ~1.4s startup vs ~26s; details cached incrementally | First `get_course_details` call incurs ~300ms network latency; but this happens once per course then is cached |
| **Full scrape on startup** (current plan) | All data available immediately; simpler logic | 26s cold start blocks MCP connection; terrible first-run UX; unnecessary for `search_courses` and `list_topics` which only need catalog data |

---

## Consensus Addendum

### Antithesis (steelman)

The strongest argument AGAINST this plan is: **scraping a third-party website for a production tool is inherently fragile, regardless of extraction method.** Whether you parse `__NEXT_DATA__` JSON or CSS selectors, a single Next.js version bump, Algolia index rename, or page restructure breaks the server silently. For a tool meant to impress the DLAI engineering team, shipping something that breaks when they push a deploy is a bad look. The counter-argument would be: skip scraping entirely and just ship a **static JSON file** with the 121 courses hardcoded, updated manually or via a GitHub Action. This is more honest about the data source, more reliable, and the "wow" factor comes from the MCP integration, not the data freshness.

**Why the plan is still correct despite this:** The spec explicitly targets a proof-of-concept to pitch for API access. A working scraper demonstrates what's possible with public data and motivates the eng team to provide a stable API. A static JSON file doesn't tell that story. The cache layer already mitigates scraper fragility — if scraping fails, the last cached data survives. The risk is manageable for MVP.

### Tradeoff Tension

**Automation vs. reliability.** The plan wants zero-config (`npx dlai-mcp-server` just works), which means automatic scraping on first run. But automatic scraping means the tool's reliability is coupled to DLAI's website stability. Every `npx` install is a potential failure if the site changed. The tension cannot be fully resolved — you must accept some fragility for automation, or sacrifice automation for reliability (e.g., ship a bundled static dataset that's periodically updated via npm publish).

### Synthesis

Ship with **both paths:** The scraper runs on first install and populates the cache. But ALSO bundle a `fallback-courses.json` in the npm package (snapshot of catalog data at publish time). If scraping fails, fall back to the bundled data with a stderr warning: "Using bundled catalog data (may be outdated). Run with --refresh-cache to retry." This preserves zero-config install (bundled data always works), demonstrates scraping capability (for the eng team pitch), and survives website changes gracefully.

### Principle Violations

| Principle | Violation | Severity |
|-|-|-|
| P3: Standard MCP patterns | Plan uses deprecated `Server`/`setRequestHandler` API instead of current `McpServer`/`registerTool` | **HIGH** — will not compile |
| P4: Zero-config install | 26s cold start on first run violates "works out of the box" | **MEDIUM** — functional but poor UX |
| P2: Cache-over-network | Startup scrape blocks the network before cache exists; no fallback | **MEDIUM** — first run has no cache to fall back to |

---

## References

- **DLAI catalog page** (`deeplearning.ai/courses/`): Course data in `__NEXT_DATA__` JSON, Algolia index `courses_date_desc`, 20 hits/page, 7 pages, zero-indexed pagination
- **DLAI course page** (`deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/`): Lesson data in `__NEXT_DATA__` via `outlineList` array with `slug`, `name`, `type`, `time` fields
- **DLAI `robots.txt`**: `Allow: /`, no crawl-delay, scraping explicitly permitted
- **MCP SDK current API**: `McpServer` class, `registerTool()` method, `StdioServerTransport`, import from `@modelcontextprotocol/server`, `zod/v4`
- **Plan Step 2** (line 109): Assumes HTML card parsing — must be rewritten for JSON extraction
- **Plan Step 5** (lines 200-201): References `setRequestHandler` — must use `registerTool`
- **Open Questions** (line 9): Correctly identifies cold start issue but fix not promoted into plan
