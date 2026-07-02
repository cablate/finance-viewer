---
name: finance-viewer-ops
description: Operate Finance Viewer monthly statement workflows with an external AI: parse bank statements, classify transactions, create rules, use web search, learn from corrections, and report QA without duplicating the project playbook.
---

# Finance Viewer Ops

Use this skill when the user asks to process a bank statement, run a monthly import, classify transactions, improve rules, review low-confidence rows, investigate rule quality, or continue the Finance Viewer Phase 3 workflow.

This skill is an operator layer. The canonical API contract and SOP remain in `prompts/playbook.md`; do not copy or override that contract here.

## Required Reading

Before acting:

1. Read `AGENTS.md` to confirm repository invariants and privacy constraints.
2. Read `prompts/playbook.md` fully enough to follow the current workflow and API contract.
3. Read the relevant references in this skill:
   - `references/bank-quirks.md` for statement parsing pitfalls.
   - `references/search-playbook.md` for merchant lookup tactics.
   - `references/lessons.md` for local operating rules and prior failures.

If any line numbers or structure differ from older notes, trust the current files and keep the goal unchanged.

## Source Of Truth Boundaries

Store merchant knowledge in the database, not in this skill.

- Merchant fact: truncated name, normalized `match_key`, real merchant identity, category, confidence, source, and rationale belong in `classification_rules.note` and transaction `judgment_reason`.
- Workflow knowledge: bank format quirks, search tactics, QA checks, reporting preferences, and operating lessons belong in this skill.
- Human corrections belong in `correction_log`; use workflow B in `prompts/playbook.md` to turn them into rule updates.

Never maintain a parallel merchant dictionary in `references/`. Two sources of truth will drift.

## Monthly Workflow

Follow `prompts/playbook.md` workflow A exactly.

1. Start with health and metadata checks.
2. Read the month statement manually and preserve statement order.
3. Normalize each candidate merchant through `GET /api/rules/normalize`.
4. Reuse existing rules before classifying manually.
5. For uncovered rows, assign category, confidence, and one human-readable judgment reason per row.
6. Use web search when the merchant is truncated, ambiguous, unfamiliar, or confidence would otherwise be low.
7. Create rules only for distinct recurring patterns with calibrated confidence `>= 0.6`; every rule needs a `note`.
8. Import the ledger CSV.
9. Record `stats.rules_applied` after each month and compare it with previous months.
10. Report the A6 checklist, low-confidence rows, websearch coverage, and unresolved items.

Do not generate ledger CSVs by script. The operator must personally inspect the statement rows and write row-level judgment reasons.

## Learning Workflow

After the user reviews rows in the UI:

1. Run `prompts/playbook.md` workflow B.
2. Read `GET /api/corrections?limit=1000`.
3. Group corrections by `match_key`, source type, direction, old value, and new value.
4. Patch wrong rules or create missing rules with `origin=human_correction`.
5. Report which rules changed and what evidence from `correction_log` justified the change.

Do not edit `correction_log`; it is append-only evidence.

## QA Gates

Before saying a monthly run is complete, verify by DB aggregates or API summaries without printing private transaction details:

- Imported row count matches the statement-derived ledger row count.
- Every AI-classified row has a non-empty judgment reason.
- Every created rule has a non-empty note.
- No created rule has confidence below `0.6`.
- Low-confidence rows are listed for UI review.
- `stats.rules_applied` is recorded for the month.
- `outputs/`, `uploads/`, `data/`, screenshots, and root statement CSVs are not staged.

For Phase 3 redo specifically, `2026-01` through `2026-06` must be run in order unless the user explicitly changes the plan. Running only one month is a valid checkpoint, not full Phase 3 completion.

## Self-Update Protocol

At the end of a monthly run or incident review, update only workflow-level references:

- Add bank parsing pitfalls to `references/bank-quirks.md`.
- Add effective or ineffective search tactics to `references/search-playbook.md`.
- Add operational lessons, QA failures, and user reporting preferences to `references/lessons.md`.

Do not add private transaction details or merchant classification facts to this skill. Put those in DB rules and notes through the app APIs.
