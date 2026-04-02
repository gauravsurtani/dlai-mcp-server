# Critic Review: DLAI MCP Server — Implementation Plan v2

**Reviewer:** Critic (Ralplan Consensus)
**Date:** 2026-04-02
**Plan Reviewed:** `.omc/plans/planner-revised.md`
**Architect Review:** `.omc/plans/architect-review.md`
**Spec Reviewed:** `.omc/specs/deep-interview-dlai-mcp.md`

---

## VERDICT: ITERATE

**2 specific changes required before execution.**

---

## Overall Assessment

The revised plan successfully incorporated all 3 MUST-FIX and both SHOULD-FIX items from the architect review. The architecture is sound, the layered module design is the right call, and the fallback-courses.json synthesis is a strong addition. However, the plan introduces a **new critical error** in the MCP SDK import path (ironically while fixing the original SDK API issue), and the acceptance test commands are **all broken** because they skip the required MCP initialization handshake. Both are straightforward fixes.

---

## Pre-commitment Predictions

| Predicted Problem | Found? |
|-|-|
| SDK import path inconsistency between spec and plan | YES — CRITICAL. Plan uses `@modelcontextprotocol/server` (alpha package) instead of `@modelcontextprotocol/sdk` |
| Fallback-courses.json strategy has gaps | MINOR — generation timing is vague but not blocking |
| Acceptance test commands won't work as written | YES — CRITICAL. All test commands skip MCP initialization handshake |
| Open questions contain unresolved items affecting execution | NO — remaining items are implementation-time decisions, acceptable |
| Architect SHOULD-FIX items incompletely addressed | NO — both fully addressed |

---

## Critical Findings

### 1. CRITICAL: Wrong npm Package Name — `@modelcontextprotocol/server` Does Not Exist as Stable Package

**Evidence:** Step 1, line 108: `Install deps: @modelcontextprotocol/server, cheerio, zod`
Step 5, line 247: `import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';`

**Verified via npm:**
- `@modelcontextprotocol/server` is at `2.0.0-alpha.2` (published yesterday, alpha tag only). It fails to install cleanly due to missing peer dependencies (`@cfworker/json-schema`).
- `@modelcontextprotocol/sdk` is at `1.29.0` (stable, 78 versions). This is the correct package.

**Correct imports (verified against SDK v1.29.0):**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

Note: `McpServer` is NOT re-exported from `@modelcontextprotocol/sdk/server` (that index only exports the low-level `Server` class). The submodule paths are required.

- **Confidence:** HIGH
- **Why this matters:** `npm install @modelcontextprotocol/server` will install an unstable alpha. The import statement `import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server'` will fail at runtime — these are not named exports from the alpha package's index. The executor will hit this on the first `npm install` + `tsc` pass.
- **Fix:** In Step 1 line 108, change `@modelcontextprotocol/server` to `@modelcontextprotocol/sdk`. In Step 5 code snippet (line 247), change import to:
  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
  ```
  Also update Principle 3 (line 31) and the Step 5 acceptance criterion (line 287) to reference `@modelcontextprotocol/sdk`, not `@modelcontextprotocol/server`.

### 2. CRITICAL: All Acceptance Test Commands Skip MCP Initialization Handshake

**Evidence:** Acceptance Test Plan, tests 2-5 and 7 (lines 329-380) all use this pattern:
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

**Verified via actual MCP server:** The MCP protocol requires a 3-message handshake before any method call:
1. Client sends `initialize` with `protocolVersion` and `clientInfo`
2. Server responds with capabilities
3. Client sends `notifications/initialized`
4. Only THEN can the client call `tools/list` or `tools/call`

Without this handshake, the server will either: (a) ignore the `tools/list` request silently, (b) return an error, or (c) hang waiting for initialization. The current test commands will produce no useful output.

Additionally, STDIO transport keeps the process alive waiting for more input. The `echo ... | node` pattern closes stdin immediately after one line, which will terminate the transport prematurely. The working pattern requires keeping stdin open (e.g., via `(printf '...init...\n...initialized...\n...tools/list...\n'; sleep 2) | node dist/index.js`).

- **Confidence:** HIGH (verified by running an actual MCP server)
- **Why this matters:** Every acceptance test in the plan will fail as written. The executor will waste significant time debugging test infrastructure instead of the actual server. This also means the plan's verification strategy is untested.
- **Fix:** Provide a helper script or inline the full handshake. For example:
  ```bash
  (printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":0}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","method":"tools/list","id":1}\n'; sleep 2) | node dist/index.js 2>/dev/null
  ```
  Or better: add a `tests/e2e-helper.sh` to the file structure that wraps the handshake, so acceptance tests become:
  ```bash
  ./tests/e2e-helper.sh '{"method":"tools/list","id":1}'
  ```
  Alternatively, recommend using `npx @modelcontextprotocol/inspector` for integration testing.

---

## Major Findings

None. The two critical findings are the only blockers. The rest of the plan is solid.

---

## Minor Findings

1. **`--help` flag is mentioned but never implemented.** Acceptance Test 1 (line 326) says `npx dlai-mcp-server --help` should "show usage or start server." Step 5 only implements `--refresh-cache`. The executor will need to decide: does `--help` print usage and exit, or is it ignored? Not blocking, but the test expectation should match the implementation.

2. **Spec says `@modelcontextprotocol/sdk` in architecture diagram (line 74) and tech stack (line 86).** The revised plan changed this to `@modelcontextprotocol/server` everywhere. This creates a spec-plan inconsistency. Since the spec's reference was actually closer to correct (the stable package), the plan should align back to `@modelcontextprotocol/sdk`.

3. **`getcourses()` function name uses inconsistent casing.** Step 3 (line 183) uses `getcourses()` while the rest of the plan follows camelCase conventions. Should be `getCourses()`.

4. **Fallback data generation timing is vague.** The plan says `data/fallback-courses.json` is "updated each npm publish" and Step 6 mentions an `update-fallback` script, but doesn't specify when this data is first created. During Step 3 (cache module)? During Step 6 (build)? The executor needs to know: run scraper manually and save output, or is this a separate pre-publish step?

5. **Spec says "37 topics" (line 111) but the plan's test (line 347) says "topics present" without asserting a count.** The original draft (line 279) tested for 37 specifically. The revised plan relaxed this — which is arguably better since topic count may change, but worth noting.

---

## What's Missing

- **No error response format specified.** The plan says `get_course_details` returns "clear error message" for invalid slugs but doesn't specify the MCP error format. Should it return `{ content: [{type: "text", text: "Course not found: ..."}] }` or throw an `McpError` with a specific error code? MCP has both patterns and they surface differently in clients.

- **No handling of concurrent `get_course_details` calls for different slugs.** If a user asks "compare LangChain and RAG courses," Claude may issue two parallel `get_course_details` calls. Both trigger on-demand scrapes. Both try to merge into the same cache file. Potential race condition on cache write. Low probability for MVP but worth a one-line note about sequential cache writes or a write lock.

- **No `--version` flag.** Standard CLI practice; trivial to add.

- **No note about Node.js minimum version.** Step 6 says "target node18+" for tsup, but the `bin/dlai-mcp-server.js` shebang file should enforce this or the README should state the requirement.

---

## Architect Feedback Incorporation Check

| Architect Item | Priority | Addressed in v2? | Quality |
|-|-|-|-|
| #1: `__NEXT_DATA__` JSON extraction | MUST | YES (Step 2 fully rewritten) | Thorough — includes Algolia hit schema, field mappings, `nbPages` dynamic detection |
| #2: `McpServer` + `registerTool` API | MUST | YES (Step 5 rewritten) | Correct API methods, but WRONG package name (see Critical #1) |
| #3: Lazy-scrape startup strategy | MUST | YES (Step 5 explicit about catalog-only startup) | Clear — startup limited to 7 pages, details on-demand |
| #4: Zero-indexed pagination | SHOULD | YES (Step 2 line 129) | Correct |
| #5: `landing_page` for course URLs | SHOULD | YES (Step 2 line 142, Step 1 line 111) | Correct — field added to Course type |
| Synthesis: bundled fallback | RECOMMENDED | YES (Step 3, Step 5, data/fallback-courses.json) | Well-integrated — priority chain: cache -> scrape -> fallback |
| `robots.txt` note | NICE | YES (Risk table line 397) | Present |

5 of 6 items fully addressed. Item #2 is addressed in intent (correct API methods) but introduces a new error (wrong package name).

---

## Ambiguity Risks

- `Step 2 line 153: "Parse lesson data from outlineList array in the page props"` — The exact path within `__NEXT_DATA__` to reach `outlineList` is not specified. Is it `pageProps.outlineList`? `pageProps.course.outlineList`? `pageProps.initialData.outlineList`? The architect review says "outlineList array" but doesn't give the full JSON path. The executor will need to inspect a live course page to discover this.
  - Risk: Medium — executor may need to explore multiple paths, but this is expected for a scraper task.

- `Step 5 line 264: "If scrape fails: load bundled fallback-courses.json"` — "Scrape fails" is ambiguous: does it mean (a) network timeout on one page, (b) all pages fail, (c) parsing returns zero courses? A single page failure shouldn't trigger fallback if 6 other pages succeeded.
  - Risk: Low — reasonable to interpret as "complete failure to get any data."

---

## Multi-Perspective Notes

**Executor:** The plan is very close to execution-ready. The two critical fixes are mechanical (change package name, fix test commands). The open questions file is well-structured — all remaining items are implementation-time decisions that an experienced executor can resolve without asking. The dependency graph is clear and parallelizable (Steps 2+3 concurrent).

**Stakeholder:** The plan directly addresses the goal: 3 MCP tools, npx install, wow-demo for eng team. The fallback strategy is a smart addition — it means the demo won't embarrass you if the site changed overnight. The <2s startup time (catalog-only) is good UX.

**Skeptic:** The strongest argument against this plan is that `@modelcontextprotocol/sdk` is at v1.29.0 and the API is evolving fast (78 versions). The `McpServer` class currently lives in a non-index submodule (`server/mcp.js`), which suggests it may move. Mitigation: pin the SDK version in package.json and document the import paths in CLAUDE.md. This is standard practice for fast-moving dependencies.

---

## Ralplan Gate Checks

| Check | Status | Notes |
|-|-|-|
| Principle-Option Consistency | PASS | Selected option (layered modules) aligns with all 5 principles. Fallback strategy addresses P2+P4 tension. |
| Alternatives Depth | PASS | 3 alternatives with genuine pros/cons. No straw-men. Monolithic rejection is well-reasoned (P5 violation). SQLite rejection is pragmatic (121 records). |
| Risk/Verification Rigor | FAIL (fixable) | Risks are well-identified, but the verification commands (acceptance tests) are broken. Fix the test commands and this passes. |
| Architect Feedback | PASS (with caveat) | All items addressed, but #2 fix introduced a new error. |

---

## Verdict Justification

**ITERATE** with 2 specific, mechanical fixes. Both are high-confidence findings verified against actual npm packages and a running MCP server.

Mode: THOROUGH throughout. Two CRITICALs found, but both are the same class of error (incorrect technical reference that would block at compile/runtime), not systemic issues. The plan's architecture, task decomposition, risk analysis, and acceptance criteria design are all solid. Escalation to ADVERSARIAL was considered but not warranted — the errors are localized, not systemic.

Realist check: Both CRITICALs would be caught within the first 5 minutes of execution (npm install fails or test commands produce no output). However, "caught quickly" does not downgrade severity for a plan review — the plan's job is to prevent the executor from hitting these walls at all. The whole point of plan review is to catch what would otherwise cost implementation time.

**What needs to change for APPROVE:**
1. Fix the package name from `@modelcontextprotocol/server` to `@modelcontextprotocol/sdk` and correct all import paths to use submodule imports (`/server/mcp.js`, `/server/stdio.js`).
2. Fix all acceptance test commands to include the MCP initialization handshake (initialize + notifications/initialized before any tools/ calls).

Once these two changes are made, this plan is ready for execution.

---

## Open Questions (unscored)

- The `@modelcontextprotocol/server` package (v2.0.0-alpha.2) appears to be the next-gen replacement for the SDK. If/when it reaches stable, the import paths will change again. The plan should note this as a future migration concern, not block on it now.
- Zod v4 is now stable (v4.3.6), but `zod/v4` as an import path is a migration bridge from zod v3. If the project installs zod v4 directly, `import { z } from 'zod'` works fine. The `zod/v4` path is only needed if zod v3 is also present. Not wrong, but potentially confusing. Executor should just use `import { z } from 'zod'` and install zod v4.

---

*Hand off to: **planner** (2 targeted fixes, then back to critic for fast re-review)*
