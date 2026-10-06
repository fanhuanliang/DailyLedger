# Efficient Claude review strategy

Effective October 5, 2026. Owner requested more efficient review prompting and avoidance of unnecessary repeated testing. This changes collaboration process, not product requirements.

## Why this changed

Large historical review sessions carry unnecessary context. Use fresh, scoped reviews.

## Session scope

- Start a fresh read-only CLI session for each coherent, independently reviewable feature or documentation step. Never resume the oversized historical session `c3e1f5d8-1c36-4b73-9949-ca3d7cda4a8f` for new reviews. Preserve it as history.
- Reuse the new session only for findings and fixes within its current step. If context grows substantially (roughly 100,000 input tokens is a warning, not a provider limit), replace it with a fresh scoped session and carry forward all unresolved findings and necessary decisions in a short handoff. Never discard findings to obtain approval.
- Record scope, baseline, reviewed files/diff identity, session ID, disposition, and limitations in doc/collaboration.md. Approval must match the final changes, including in a replacement session.
- On quota/authentication/permission failure, record BLOCKED and stop retrying. Do not invoke Claude just to check availability or review unchanged bookkeeping. No quota bypass or unsolicited model/effort/settings changes.

## Prepare one compact review packet

Aim for 400-800 words of instruction; the actual scoped diff is additional and must remain complete. Include:

1. Role and scope: Codex owns edits; Claude is read-only. State the feature and baseline commit, exact included paths, and unrelated work excluded from review.
2. Snapshot identity: distinguish committed base from pending changes. Include relevant untracked files explicitly; ordinary `git diff` omits them. Freeze included files during review. A later code change invalidates approval for that change.
3. Requirements: cite relevant spec sections/ACs and owner decisions, with brief necessary excerpts. AGENTS.md/CLAUDE.md remain applicable; do not paste the entire spec, journal, or historical conversation into the prompt.
4. Evidence: focused Red failure reason and Green result, relevant regression/type/build/manual outcomes, and known failures or unverified checks. Supply commands, counts, and short summaries rather than full successful logs. Keep existing stage-level full checks.
5. Review focus: list the few real risks for this change (for example cents/rounding, revision conflicts, atomic writes, historical preservation, input validation). Ask for one consolidated disposition.

Use bounded file reads and targeted searches. Expand to supporting files or additional spec sections when a concrete dependency or concern requires them; the size target must never hide relevant changes or prevent necessary investigation. Do not ask for a review of the entire application on every step or send original financial documents, tokens, databases, or unrelated context.

## Prompt template

```text
Read-only independent review of DailyLedger [step]. Codex owns all edits.
Follow AGENTS.md, CLAUDE.md, and doc/review-strategy.md. Do not edit,
commit, deploy, access real household data, or bypass permissions.

Base: [commit]. Snapshot: [diff identity / explicit included paths].
Included untracked files: [paths or none]. Excluded pending work: [paths].
Behavior: [brief change]. Requirements: [spec sections/ACs].
Owner decisions / unresolved prior findings: [concise list or none].
Evidence: [Red reason; Green; affected regression/types/build/manual checks].
Known failures / limitations: [including unrelated next-stage Red tests].
Focus: [specific risks]. Inspect the scoped diff and necessary source/spec
independently. Run targeted checks if needed to resolve concrete doubts;
do not automatically rerun all supplied checks or historical tests.

Return APPROVED, CHANGES REQUIRED, or BLOCKED; identify reviewed scope.
For findings: severity, file/line, impact, concrete fix. Separate optional
suggestions. Distinguish checks you ran from coder-supplied evidence and
state limitations. Keep the report concise; investigate as deeply as needed.
```

## Testing and re-review

- Coder retains genuine Red -> Green -> Refactor for application behavior/fixes and records real evidence. Do not add artificial tests for this documentation change.
- Coder runs the focused test and affected regression checks after a fix. Reviewer inspects the fix, retained regression, and impacted dependencies; repeat broader checks only for new changes, failures, or unresolved risks.
- Reviewer independently verifies code and test relevance. It is acceptable to rely on clearly attributed coder execution evidence when there is no specific reason to rerun it; never claim those checks were independently executed.
- Run full suites and type checks before declaring a stage complete, with builds and desktop/mobile/deployment checks when required. Tests for unimplemented later stages must stay visible and clearly separated; do not call a failing whole working tree Green.
- One consolidated review per coherent step, then focused re-review of fixes. Avoid trivial review calls for unchanged bookkeeping. Do not replace required integration, financial/data-integrity, or backup/restore checks with mocks.

## Quality gate and current handoff

Independent approval is still required before committing completed steps. Known actionable defects block approval; unavailable required verification means BLOCKED. Agent conflicts or material suspected bias go to the owner for the final decision. No promise of a bug-free app.

The recurring/reminder step and early-year calendar fix remain unapproved; next-stage report tests remain intentionally Red. The October 5 investigation also reproduced malformed `cadence: ["monthly"]` being accepted with HTTP 201; server validation must reject it with 400. Track this as an unresolved defect, reproduce it with a failing regression before any fix, and include it in the next scoped review. This process update does not approve or change application code.
