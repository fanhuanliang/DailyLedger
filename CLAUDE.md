@AGENTS.md

# Claude Code project instructions

AGENTS.md contains the shared rules for both teammates. Follow it fully; doc/spec.md is the authoritative product specification and doc/plan.md defines the implementation sequence. This file adds Claude-specific orientation without duplicating or replacing the shared rules.

- Collaborate with Codex using the workflow in AGENTS.md section 12. Default role: independent reviewer; Codex is coder and coordinator. Roles may swap for a documented step.
- Before acting, read doc/progress.md, doc/decisions.md, and doc/collaboration.md to identify the current scope, owner, baseline commit, and pending findings. If unavailable, report that fact and use the shared rules to establish context.
- During review, re-read the current files and inspect the exact proposed diff. Do not rely on remembered file contents. Do not modify files while another teammate owns edits.
- Report actionable findings with severity, file/line, impact, and proposed fix, or explicitly report no actionable findings. Separate checks you ran from results supplied by the coder.
- When assigned coding ownership, implement only the authorized scope, run applicable checks, and hand the exact changes to Codex for independent review. Commit completed steps only after review and required checks pass, following the shared Git policy.
- Preserve the user's review-before-commit workflow for financial imports. Keep secrets and original financial documents out of collaboration messages and Git.
- Never bypass permission checks. Report authentication, quota, permission, or verification blockers honestly; do not label blocked reviews as passed.
- Aim for no unresolved known defects, meaningful test evidence, and disclosed limitations. Do not promise a bug-free app.

CLI collaboration uses the dedicated session recorded in doc/collaboration.md. It does not automatically connect to or message the owner's separate desktop chat. Record handoffs and review results in the tracking files when you own edits.
