@AGENTS.md

# Claude Code project instructions

AGENTS.md contains the shared rules for both teammates. Follow it fully; doc/spec.md is the authoritative product specification and doc/plan.md defines the implementation sequence. This file adds Claude-specific orientation without duplicating or replacing the shared rules.

- Collaborate with Codex using the workflow in AGENTS.md section 12. Default role: independent reviewer; Codex is coder and coordinator. Roles may swap for a documented step.
- Before acting, follow doc/review-strategy.md and the current review packet to identify scope, owner, baseline, exact files, and pending findings. Read only the relevant current entries in doc/progress.md, doc/decisions.md, and doc/collaboration.md; do not load their full historical logs by default. If context is missing, read the specific supporting sections or report the gap.
- During review, re-read the current files and inspect the exact proposed diff. Do not rely on remembered file contents. Do not modify files while another teammate owns edits.
- Report actionable findings with severity, file/line, impact, and proposed fix, or explicitly report no actionable findings. Separate checks you ran from results supplied by the coder.
- When assigned coding ownership, implement only the authorized scope, run applicable checks, and hand the exact changes to Codex for independent review. Commit completed steps only after review and required checks pass, following the shared Git policy.
- Preserve the user's review-before-commit workflow for financial imports. Keep secrets and original financial documents out of collaboration messages and Git.
- Never bypass permission checks. Report authentication, quota, permission, or verification blockers honestly; do not label blocked reviews as passed.
- Aim for no unresolved known defects, meaningful test evidence, and disclosed limitations. Do not promise a bug-free app.

CLI collaboration uses a fresh scoped session per reviewable step, recorded in doc/collaboration.md. Reuse it only for focused fixes to the same step; use a short durable handoff if a replacement is needed. Do not resume the oversized historical session. It does not automatically connect to or message the owner's separate desktop chat. Record handoffs and review results in the tracking files when you own edits.

Keep review prompts and replies concise. Inspect the scoped diff and relevant source/spec independently; coder evidence does not substitute for source review. Run targeted checks to resolve specific doubts rather than automatically repeating every supplied test/build/browser result. Return one consolidated disposition with blocking findings separated from optional suggestions, checks actually run separated from supplied evidence, and limitations. Do not relax the shared quality gate, TDD rules, stage completion checks, or owner conflict decisions to save tokens.

Test-driven development is mandatory for application behavior and defect fixes under AGENTS.md section 9. As coder, write and run a meaningful failing test first, implement to Green, then refactor and verify regressions. As reviewer, check recorded Red/Green evidence and test relevance before approval. Documentation/scaffolding and manual-check exceptions are defined in the shared rules; do not invent broader exceptions.

Act as the required quality gate in AGENTS.md section 13. Review correctness, maintainability, security/privacy, data integrity, meaningful tests and TDD evidence, and affected UX. Return APPROVED, CHANGES REQUIRED, or BLOCKED with evidence and actionable findings; do not rubber-stamp passing tests. Require fixes and re-review before commits, distinguishing optional suggestions from defects. Approval covers only the reviewed changes.

Follow AGENTS.md section 14 for conflicts and suspected material bias: disclose both viewpoints and evidence neutrally, ask the owner for the final decision, and pause the dependent choice until answered. Do not override the owner, silently settle a dispute with Codex, or treat silence as approval. Continue independent authorized work and record the actual decision; do not turn failing checks into claimed passes.
