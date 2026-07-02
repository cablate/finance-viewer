# Operator Contract

This file is the Finance Viewer operator contract for AI-run statement work. It is self-contained by design. Do not require `AGENTS.md` or `prompts/playbook.md` before running statement operations.

## Role Boundary

Finance Viewer does not contain an LLM. The app provides SQLite storage, REST APIs, and a web UI. The external AI operator performs parsing, classification, web search, rule maintenance, QA, and reporting.

## Privacy And Git Rules

- Treat bank statements, imported ledgers, database files, screenshots, logs, and exported outputs as private.
- Do not commit `data/`, `uploads/`, `outputs/`, root statement CSVs, screenshots, logs, or `AUDIT-*.md`.
- Before any commit, run `git status --short` and verify only intended non-private files are staged.
- Use DB aggregate checks in chat. Do not print private transaction details unless the user explicitly asks.

## Hard Constraints

- Do not generate ledger CSVs by script for a real AI first run.
- Personally inspect statement rows month by month.
- Every AI-classified row must have a non-empty human-readable judgment reason.
- Every rule must have a non-empty note.
- Do not create rules with `confidence < 0.6`.
- Do not edit `correction_log`; it is append-only evidence.
- Do not maintain a merchant dictionary in this skill.

## Source Of Truth

- Merchant facts belong in the database:
  - `classification_rules.match_key`
  - `classification_rules.category_value`
  - `classification_rules.confidence`
  - `classification_rules.note`
  - transaction `judgment_reason`
- Workflow knowledge belongs in this skill:
  - parsing quirks
  - search tactics
  - QA gates
  - reporting preferences
  - prior operational failures
- User corrections belong in `correction_log` and become rule changes only through workflow B.

## Completion Language

Report checkpoints precisely.

- One completed month is not full Phase 3 completion.
- Phase 3 redo requires `2026-01` through `2026-06` in order unless the user changes scope.
- If P10 or another incident is not reproduced, say it remains open.
- If runtime conditions force a different verification path, state the deviation and what remained true.
