---
name: finance-viewer-ops
description: "Operate Finance Viewer as the external AI: process bank statements, classify and import monthly ledgers, create or repair classification rules, use web search for ambiguous merchants, learn from correction_log, and report aggregate QA. Use for monthly statement imports, rule evolution, low-confidence review support, Phase 3-style validation, and Finance Viewer operations."
---

# Finance Viewer Ops

This skill is the operator entrypoint for using Finance Viewer. Keep the source of truth in the project playbook:

- Main contract and SOP: `prompts/playbook.md`
- Flow A monthly import: `prompts/playbook.md` sections "流程 A" and "附錄一～三"
- Flow B correction learning: `prompts/playbook.md` section "流程 B"
- API/data/rule contract: `prompts/playbook.md` "關鍵 API 速查" and "附錄一～三"

Do not duplicate API tables, category lists, ledger schemas, or workflow steps here. If the playbook and this skill disagree, follow `prompts/playbook.md` and then fix this skill.

## Operating Model

Finance Viewer is not an AI app. It stores data, exposes local REST APIs, and provides the review UI. The external AI operator reads statements, classifies rows, builds rules, imports ledgers, studies correction history, and reports QA.

Use the tool in two loops:

- Flow A: new monthly statement import.
- Flow B: learn from user corrections in `correction_log`.

Before operating on statements or rules, read the relevant playbook section. Do not use `AGENTS.md` for data operations; it is for code modification work.

## Hard Rules

- Do not generate ledger CSVs by script for a real AI first run; inspect statement rows yourself.
- Do not print or commit private financial details unless the user explicitly asks.
- Do not commit `data/`, `uploads/`, `outputs/`, root statement CSVs, screenshots, logs, or `AUDIT-*.md`.
- Every AI-classified transaction needs a non-empty human-readable `judgment_reason`.
- Every created rule needs a non-empty `note`.
- Do not create rules with `confidence < 0.6`.
- Do not edit `correction_log`; treat it as append-only evidence.
- Do not store merchant dictionaries in this skill. Merchant facts belong in Finance Viewer rules and notes.
- Use aggregate DB/API checks for acceptance whenever possible.

## Reference Routing

Read only the files needed for the current task:

- `references/bank-quirks.md`: bank statement format behavior that DB rules cannot learn.
- `references/search-playbook.md`: web search tactics and confidence calibration support.
- `references/lessons.md`: operating failures, QA habits, and user reporting preferences.
- `references/api-contract.md`: thin route to the playbook API contract.
- `references/category-guide.md`: thin route to the playbook category and confidence rules.
- `references/monthly-workflow.md`: thin route to Flow A and Flow B in the playbook.
- `references/operator-contract.md`: thin route to the playbook role, privacy, and completion contract.

## Self-Update Protocol

Update only workflow-level experience in this skill:

- parsing quirks;
- search tactics;
- QA failures;
- user reporting preferences;
- operational lessons.

Do not add private transaction details or merchant classification dictionaries. Store merchant/category facts in `classification_rules.note`, transaction `judgment_reason`, and `correction_log` through the app APIs.
