# Monthly Workflow

Use this file for Finance Viewer monthly imports and correction-driven learning.

## Workflow A: Monthly Statement Import

### A0. Prepare

1. Confirm the dev server and database with `GET /api/health`.
2. Read `GET /api/meta` for category and source metadata.
3. Read `GET /api/rules` so existing rules can be reused before manual classification.
4. Confirm the target month and input statement file.

### A1. Read Statement Rows

1. Read the bank statement manually in statement order.
2. Identify transaction rows and skip totals, headers, and non-transaction summary rows.
3. Preserve both transaction date and statement month.
4. Interpret inflow/outflow from statement signs and bank-specific quirks; do not infer direction from category alone.
5. Do not use a script to generate the ledger CSV for a real AI first run.

### A2. Normalize And Reuse Rules

For each merchant candidate:

1. Call `GET /api/rules/normalize?text=<raw merchant name>`.
2. Match by `match_key + source_type + direction`.
3. If a matching enabled rule exists, use its category and rule context.
4. If no rule covers the row, classify manually using `category-guide.md` and `search-playbook.md`.

### A3. Classify Uncovered Rows

For every uncovered row:

1. Choose one `category_primary` from `category-guide.md`.
2. Optionally write a short free-text `category_sub`.
3. Assign calibrated `ai_confidence` from `category-guide.md`.
4. Write one human-readable `judgment_reason`.
5. Use web search when the merchant is truncated, ambiguous, unfamiliar, or otherwise below the evidence threshold.

Even uncertain rows need the best current guess with low confidence. Do not leave classification blank just because it needs review.

### A4. Create Rules

Create rules only for distinct recurring patterns that are likely to generalize.

Rule creation constraints:

- `confidence >= 0.6`
- `origin = ai_analysis`
- `enabled = true` unless deliberately staging a disabled rule
- `note` must include merchant identity, what it is, and source type or evidence basis
- Do not create a rule from a one-off ambiguous row
- Do not create broad transfer/payment rules that could misclassify unrelated inflows/outflows

Payload shape:

```json
{
  "match_key": "<normalized key from GET /api/rules/normalize>",
  "source_type": "credit_card",
  "direction": "out",
  "category_value": "飲食",
  "confidence": 0.8,
  "origin": "ai_analysis",
  "note": "Merchant identity + what it is + evidence source."
}
```

### A5. Import Ledger

Ledger CSV columns:

```csv
日期,月份,名稱,金額,轉入,轉出,分類,子類別,AI信心度,判斷理由,備註
```

Use `POST /api/import-ledger` with either:

```json
{ "csvPath": "outputs/<file>.csv", "sourcePath": "<statement file>" }
```

or:

```json
{ "csvContent": "<csv text>", "sourcePath": "<statement file>" }
```

After import, record `stats.rules_applied`.

### A6. Report

Report:

- imported row count
- created rule count
- `stats.rules_applied`
- A6 self-check results
- low-confidence list
- websearch coverage and unresolved ambiguous rows
- whether any incidents such as P10 were reproduced

A6 self-check:

- [ ] Every AI-classified row has a judgment reason.
- [ ] Every created rule has a note.
- [ ] No rule below confidence `0.6` was created.
- [ ] The import response includes `stats.rules_applied`.

## Workflow B: Learn From Human Corrections

Use this after the user reviews rows in the UI.

### B1. Read Corrections

Call:

```http
GET /api/corrections?limit=1000
```

Use the returned summary and rows as evidence. Do not edit correction history.

### B2. Diagnose

Group by:

- `match_key`
- `source_type`
- `direction`
- `field_name`
- `old_value`
- `new_value`
- `rule_id`

Interpret:

- `rule_id` present and repeatedly overridden: patch that rule or lower confidence.
- `rule_id` absent and repeated correction pattern exists: create a missing rule.
- mixed corrections for the same key: avoid broad rules; keep lower confidence or leave to review.

### B3. Update Rules

Use:

- `PATCH /api/rules/:id` for wrong existing rules.
- `POST /api/rules` with `origin = human_correction` for missing rules.

Every change must cite correction evidence in the report.

### B4. Verify

Report changed rules, evidence basis, and expected effect on the next import. Do not claim improvement until the next month import confirms better `rules_applied` or fewer low-confidence rows.
