# Prompt pack: KMS Spark — knowledge graph + end-to-end tracking

5 chained prompts. Run them in order, review each output before feeding it to the next.

**Where to run each prompt:**

| Prompt | Run in | Why |
|---|---|---|
| 1. Research & plan | **Claude Code, inside the KMS Spark repo** | It must read your actual code and do web research; recommendations grounded in real files beat generic advice |
| 2. PRD | Claude (chat) or Claude Code | Needs research output + your product answers |
| 3. TRD | Claude (chat) or Claude Code | Interview-style; needs PRD + research output |
| 4. Epics & stories | Claude (chat) | Needs approved TRD |
| 5. Executable tasks | **Claude Code, inside the repo** | Tasks must reference real file paths and be runnable |

**The flow:** Research → you review and decide → PRD → TRD (interview, engineer signs) → Epics → tasks.md in the repo → Claude Code executes task by task.

---

## PROMPT 1 — Research & implementation plan

*Run in Claude Code inside the KMS Spark repo. Replace [bracketed] parts.*

### CONTEXT
This repo is KMS Spark, an internal knowledge management platform I'm building with Claude Code. Stack: [FILL: e.g. Next.js + Postgres + Prisma]. Users are internal employees, roughly [FILL: n] users. Before proposing anything, inspect the codebase: routing structure, page/component organization, data model (especially how knowledge pages/notes and any links or tags between them are stored today), database, and auth. Base every codebase claim on a real file path.

### OBJECTIVE
Research and plan 2 features end to end:

**Feature A — Knowledge graph.** Every node (page, note, document) should have visible relations to other nodes, viewable as an interactive graph. Evaluate 2 scopes and recommend a phasing: (1) explicit relations only (links users create, references, shared tags), (2) adding AI-derived relations later (embedding similarity suggesting "related" nodes). Cover: data model for relations (dedicated links table in our existing DB vs a graph database; justify whether a graph DB is worth its operational cost at our scale), how to extract link data from existing content, graph traversal queries we'll need (backlinks, n-hop neighbors, orphan nodes), and visualization library options for our frontend stack with bundle size and performance at [FILL: expected node count] nodes.

**Feature B — End-to-end usage tracking, built by us.** We prefer building our own over buying. Research and design: an event schema (page views, element/button clicks, with page, element id, session, user or anonymized id, timestamp, viewport, click coordinates), a collection path (client SDK/hook, batching, a collection endpoint, storage tables), aggregation for the questions I care about (which pages are accessed most, how often I access a page, which buttons are clicked most, trends over time), and heatmap capture + rendering (normalized click coordinates, overlay rendering approach and library options). Flag the specific pieces where building is disproportionate compared to a self-hosted open source tool, and say what you'd take off the shelf and why. Include privacy guardrails: these are employees, so state what we should NOT track, retention limits, and whether IDs should be pseudonymized.

### STYLE
Decision-document style: for every choice, a short options table (option, pros, cons, cost/effort), then one recommendation with reasoning. Cite a source (URL) for every external claim: library maturity, benchmark, best practice. Tag anything you assumed rather than verified with [A]. No code implementation yet; illustrative snippets only where a schema or API shape needs to be concrete.

### TONE
Engineering-plain. Write for a PM who will challenge the reasoning and engineers who will implement it.

### AUDIENCE
Me (PM, owns the plan) and the engineers who will review it. The output also feeds a PRD and TRD later, so keep headings stable and numbered.

### RESULTS
Write `docs/research-graph-tracking.md` in the repo with exactly these sections:
1. Codebase findings (what exists today that these features build on, with file paths)
2. Graph: relation data model options + recommendation
3. Graph: visualization options + recommendation
4. Graph: AI-derived relations (approach, cost, and why it's phase 2, or why not)
5. Tracking: event schema (as a table: field, type, example, why)
6. Tracking: collection and storage design
7. Tracking: aggregation and the 4 core questions it answers
8. Heatmap: capture and rendering approach
9. Privacy and performance guardrails
10. Recommended phased roadmap (Phase 1 / 2 / 3, each with scope and rough effort)
11. Build vs off-the-shelf verdict per component
12. Open questions for me and the engineers (each with an owner)

End with the 5 decisions you need from me before a PRD can be written.

---

## PROMPT 2 — PRD

*Attach or reference `docs/research-graph-tracking.md`. Answer its open decisions first, in this same message.*

### CONTEXT
Attached is the research for KMS Spark's knowledge graph and usage tracking features. My decisions on its open questions: [FILL: paste your answers]. Users are internal employees; the platform owner (me) is also the primary consumer of the tracking dashboards.

### OBJECTIVE
Write the PRD for both features, scoped to the research's Phase 1 unless my decisions say otherwise.

### STYLE / TONE
Structured PRD, plain language, answer-first. Where the research marked something [A] or open, carry it into the PRD as an open question; never resolve it by inventing.

### AUDIENCE
Engineers building it, plus my team leads. Assume they have NOT read the research doc; the PRD must stand alone, referencing the research only for depth.

### RESULTS
`docs/prd-graph-tracking.md` with: problem statement (what we can't see or navigate today), target users and jobs, goals with success metrics (each metric needs a measurement source; note that the tracking feature itself is the source for several, so define how we measure before it exists), user stories with acceptance criteria, scope and explicit non-goals per phase, UX notes (graph view entry points, dashboard views, heatmap access), dependencies, and open questions. Before writing, ask me a maximum of 5 questions whose answers change the PRD; then write it.

---

## PROMPT 3 — TRD (ParagonCorp standard, interview mode)

*Attach the PRD and research doc. This prompt makes Claude interview you; expect a working session, not a one-shot output.*

### CONTEXT
Attached: PRD and research for KMS Spark graph + tracking. We write TRDs to a house standard: Lite tier (single system, no vendor), authored by interview, with provenance tags.

### OBJECTIVE
Produce the TRD by interviewing me section by section. Never invent technical facts: no API shapes, field names, or system behavior I didn't state or a document doesn't show. If I don't know, record `[OPEN — question, owner, needed by]` instead of prose.

### STYLE
Follow this structure exactly, with per-section word caps (prose only): yaml frontmatter (doc_id, doc_type: trd, project, systems, status: draft, owner, engineer_signoff: null, last_verified); Basics table (author, the engineer who signs the Design section, reviewers); Systems & terms glossary (one line per system and acronym, new-hire test); 1 Summary (120w); 2 Background (150w); 3 Goals & non-goals (150w); 4 Requirements (200w, incl. speed, scale, security/privacy); 5 Design (300w + one ASCII diagram + data table + interface list + edge cases); 6 Other options considered (150w, honest reasons); 7 How it ships & how we undo it (200w: rollout, testing, rollback); 8 Risks table; 9 Plan & timeline table; 10 Open questions with owners. Tag every technical claim in Design: `[V: name]` engineer-verified, `[S: doc]` source-confirmed, `[A]` assumed. The doc cannot be Approved while `[A]` tags remain in Design.

### TONE
Restrained. If a section is answered in 2 sentences, stop at 2 sentences. Delete sections that don't apply; never write N/A.

### AUDIENCE
The engineer who signs it, future engineers who inherit it, and me.

### RESULTS
Interview me through sections 1-10 in order (batch related questions, max 4 per round). Then output `docs/trd-graph-tracking.md`, followed by a list of every [A] and [OPEN] tag so I can chase verification. Remind me the doc is a proposal until the named engineer signs the Design section.

---

## PROMPT 4 — Epics & stories

*Attach the approved TRD.*

### CONTEXT
Attached is the approved TRD for KMS Spark graph + tracking. We work in [FILL: 2-week sprints / kanban].

### OBJECTIVE
Break the TRD's Phase 1 (and Phase 2 if the TRD includes it) into epics and user stories ready for the backlog.

### STYLE
Per epic: name, goal, TRD section it traces to, done-when statement. Per story: user story format, acceptance criteria (3-5, testable), technical notes from the TRD, dependency links to other stories, and a T-shirt size estimate marked as AI-estimated for the team to correct.

### AUDIENCE
My team leads and engineers during backlog refinement.

### RESULTS
`docs/epics-graph-tracking.md`: an epic overview table (epic, phase, dependency order), then stories grouped by epic. Expected shape: graph data foundation, graph UI, tracking pipeline, tracking dashboard, heatmap, and (if phased in) AI-derived relations. Sequence them so tracking instrumentation lands early enough to measure the graph feature's own adoption. Flag any story that has no acceptance criterion verifiable by a test.

---

## PROMPT 5 — Executable tasks for Claude Code

*Run in Claude Code inside the repo, with the epics doc and TRD present.*

### CONTEXT
This repo is KMS Spark. `docs/epics-graph-tracking.md` and `docs/trd-graph-tracking.md` define what to build. I execute work by giving Claude Code one task at a time.

### OBJECTIVE
Convert the stories into an ordered task file where every task is small enough for one Claude Code session and independently verifiable.

### STYLE
Per task: ID, story it traces to, files to read first (real paths), the exact change, acceptance criteria, the test(s) to write BEFORE marking done (unit or E2E as fits: tracking endpoint gets contract tests, graph queries get logic tests, UI gets at least one interaction test), and the verification command to run. No task bigger than roughly one PR. Order by dependency; mark which tasks can run in parallel.

### AUDIENCE
Claude Code sessions (each task must be executable without reading this whole file) and me tracking progress.

### RESULTS
Write `docs/tasks-graph-tracking.md` as a checklist. At the top: a rules block stating that a task is done only when its tests pass and the verification command is green, and that any deviation from the TRD's Design section must be reported back to me, not silently implemented. End with the 3 tasks you'd start with and why.

---

## Notes on design decisions (for Levi, not part of the prompts)

**Prompt 1 runs in Claude Code, not chat.** Your graph and tracking design depend on how KMS Spark stores pages and links today. Research done in chat guesses at that; research done in the repo reads it. Section 1 (codebase findings, with file paths) exists to force that grounding.

**The research prompt ends with decisions, not just findings.** "Here are 5 decisions I need from you" is the handoff that makes the PRD prompt work. Without it, the PRD inherits unresolved options and goes vague.

**The TRD prompt is interview-mode on purpose.** It follows your house tech-docs standard: Lite tier (one system, no vendor), section-by-section interview, provenance tags, engineer signoff. A one-shot generated TRD reads fluent and gets rubber-stamped; the interview plus [A]/[OPEN] tags keep invented facts visible.

**Build-your-own tracking, with a pressure valve.** I kept your preference but made the research name components where building is a poor trade (session replay and heatmap rendering are the usual suspects; a self-hosted tool can cover those while your own event pipeline answers the page/click questions). You get the verdict per component in section 11 and can overrule it.

**Tracking ships before or with the graph.** The epics prompt sequences instrumentation early so the graph feature's own adoption is measurable from day 1. Your success metrics in the PRD need this ordering.

**Tests are baked into prompt 5, not left to discipline.** Each task carries its tests and a verification command. That's what keeps a long Claude Code execution honest across sessions.
