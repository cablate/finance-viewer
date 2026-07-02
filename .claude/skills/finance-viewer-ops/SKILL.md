---
name: finance-viewer-ops
description: "Use Finance Viewer as an external AI operator: read bank statements, classify transactions, create and improve classification rules, import monthly ledgers, use web search for ambiguous merchants, learn from correction_log, and report QA. Use for monthly imports, Phase 3 redo work, low-confidence review, rule evolution, bank statement classification, and Finance Viewer operations."
---

# Finance Viewer Ops

This skill teaches any AI operator how to use Finance Viewer. It is self-contained: do not require project docs such as `AGENTS.md` or `prompts/playbook.md` before operating the tool.

Finance Viewer is not an AI app. It is a local finance workspace with:

- SQLite storage for transactions, rules, and corrections.
- REST APIs for importing ledgers, reading transactions, creating rules, and reading correction history.
- A web UI for the user to review low-confidence classifications and correct mistakes.
- An external AI operator, which is you, responsible for reading statements, classifying rows, creating rules, and reporting quality.

## Mental Model

The tool has two learning loops.

Loop A: AI first pass

1. Read a monthly bank statement.
2. Normalize merchant names with `/api/rules/normalize`.
3. Reuse existing classification rules when available.
4. Classify uncovered rows with category, confidence, and a human-readable reason.
5. Create high-confidence reusable rules.
6. Import the ledger.
7. Report aggregate QA and low-confidence rows for human review.

Loop B: Human correction learning

1. The user reviews rows in the UI.
2. Corrections are appended to `correction_log`.
3. You read `correction_log`.
4. You patch wrong rules or create missing rules.
5. The next monthly import should use more rules and need less review.

## Hard Rules

- Do not generate ledger CSVs by script for a real AI first run. Personally inspect statement rows.
- Do not commit or print private financial details unless the user explicitly asks.
- Do not commit `data/`, `uploads/`, `outputs/`, root statement CSVs, screenshots, logs, or `AUDIT-*.md`.
- Every AI-classified transaction must have one non-empty `judgment_reason`.
- Every created rule must have one non-empty `note`.
- Do not create a rule with `confidence < 0.6`.
- Do not edit `correction_log`; it is append-only evidence.
- Do not store merchant dictionaries in this skill. Merchant facts belong in DB rules and notes.
- Use aggregate DB/API checks for acceptance. Avoid exposing transaction details in chat.

## Server And API

Default local server: `http://localhost:3127`. If another port is active, use that active server.

Core endpoints:

- `GET /api/health`: check server and DB, returns `{ok, transactions, corrections}`.
- `GET /api/meta`: read categories, source metadata, and review counts.
- `GET /api/rules`: list existing classification rules.
- `GET /api/rules/normalize?text=<merchant>`: normalize raw merchant text into `match_key`.
- `POST /api/rules`: create a classification rule.
- `PATCH /api/rules/:id`: update a rule.
- `GET /api/transactions?...`: list transactions.
- `PATCH /api/transactions/:id`: correct one transaction.
- `POST /api/transactions/batch`: batch correct transactions, max 500.
- `GET /api/corrections?limit=1000`: read correction evidence.
- `POST /api/import-ledger`: import ledger CSV by `csvPath` or `csvContent`.

Only these transaction fields are operator-editable:

- `category_primary`
- `memo`

Do not change transaction date, amount, name, source, or balance through correction APIs.

## Rule Model

A rule condition is:

- `match_key`
- `source_type`
- `direction`: `in` or `out`

A rule output is:

- `category_value`

Rule metadata:

- `confidence`: 0 to 1
- `origin`: `ai_analysis`, `human_correction`, or `bootstrap`
- `enabled`
- `note`
- `applied_count`
- `overridden_count`

Create rules only when the merchant pattern is reusable. A rule note should state the merchant identity, what it is, and the evidence/source type in one short sentence.

## Categories

Use `GET /api/meta` as the current category source when available. Baseline categories:

- 飲食
- 交通
- 購物
- 居家
- 醫療保健
- 娛樂
- 訂閱軟體
- 學習成長
- 投資
- 稅務
- 金融手續費
- 轉帳/還款/內部移動
- 事業支出
- 其他收入/調整

Boundary rules:

- Food, cafes, delivery, groceries for eating soon: `飲食`.
- Transit, taxi, rideshare, parking, fuel: `交通`.
- Retail, ecommerce, clothing, personal goods, 3C accessories: `購物`.
- Home supplies, furniture, utilities, household maintenance: `居家`.
- Clinics, pharmacies, health products: `醫療保健`.
- Movies, games, events, leisure venues: `娛樂`.
- Recurring digital services, cloud, SaaS, streaming, app subscriptions: `訂閱軟體`.
- Books, courses, workshops, professional learning: `學習成長`.
- Brokerage, funds, securities, crypto, investment-related transfers: `投資`.
- Tax payments and filing-related charges: `稅務`.
- Foreign transaction fees, card fees, bank fees: `金融手續費`.
- Card payments, repayments, internal transfers, account movement: `轉帳/還款/內部移動`.
- Work tools, business software, client/project expenses: `事業支出`.
- Refunds, rebates, adjustments, interest income, unexplained income-side items: `其他收入/調整`.

When uncertain, make the best current guess with lower confidence. Do not leave the row blank.

## Confidence Calibration

- `0.9-1.0`: obvious merchant/category or official evidence.
- `0.7-0.85`: web search or strong contextual evidence supports one category.
- `0.5-0.65`: plausible but not definitive; review is useful.
- `0.2-0.45`: ambiguous, truncated, or weak evidence; best guess only.

Rule threshold: only create rules at `confidence >= 0.6`.

## Web Search

Use web search when:

- the merchant name is truncated;
- the merchant is unfamiliar;
- the same normalized key could map to multiple categories;
- confidence would be below `0.6` without more evidence;
- a rule note needs source-backed merchant identity.

Good query patterns:

- `<merchant fragment> 台灣`
- `<merchant fragment> 店家`
- `<merchant fragment> 公司`
- `<merchant fragment> 信用卡 消費`
- `<merchant fragment> 發票`
- `<merchant fragment> 地址`

Evidence quality:

- Official site, registry, store locator, or clearly matching payment descriptor: high confidence.
- Multiple consistent third-party sources: medium to high confidence.
- One weak directory hit or fuzzy match: medium or low confidence.
- No useful result: low-confidence best guess; do not create a rule below `0.6`.

## Monthly Import Workflow

### 1. Prepare

1. Call `GET /api/health`.
2. Call `GET /api/meta`.
3. Call `GET /api/rules`.
4. Confirm target statement month and input file.

### 2. Read Statement

Read the bank statement manually in statement order.

For each row, determine:

- transaction date;
- statement month;
- source type;
- merchant/name;
- amount;
- inflow/outflow;
- raw information worth preserving;
- whether the row is a real transaction or a header/total/summary row.

Preserve statement order. A statement month may contain previous-month or delayed transactions.

### 3. Normalize And Reuse Rules

For each transaction merchant:

1. Call `GET /api/rules/normalize?text=<raw merchant name>`.
2. Match existing rules by `match_key + source_type + direction`.
3. If a matching enabled rule exists, use that category.
4. If not covered, classify manually.

### 4. Classify Uncovered Rows

For every uncovered row, write:

- `category_primary`
- optional `category_sub`
- `ai_confidence`
- `judgment_reason`

The judgment reason must be specific enough for a human to understand why the category was chosen.

Good examples:

- `搜尋結果顯示為餐飲店，消費型態符合外食，因此歸為飲食。`
- `名稱只剩截斷片段，未查到明確商家；依描述暫歸購物，低信心待審。`
- `國外交易手續費屬信用卡費用，歸為金融手續費。`

Avoid generic repeated reasons such as `AI 初分`.

### 5. Create Rules

For distinct reusable patterns with confidence `>= 0.6`, create rules before import.

Example:

```json
{
  "match_key": "<normalized key>",
  "source_type": "credit_card",
  "direction": "out",
  "category_value": "飲食",
  "confidence": 0.8,
  "origin": "ai_analysis",
  "note": "商家全名 + 是什麼 + 來源/證據。"
}
```

Do not create rules for one-off ambiguous rows.

### 6. Import Ledger

Ledger CSV shape:

```csv
日期,月份,名稱,金額,轉入,轉出,分類,子類別,AI信心度,判斷理由,備註
```

Import with:

```json
{ "csvPath": "outputs/<file>.csv", "sourcePath": "<statement file>" }
```

or:

```json
{ "csvContent": "<csv text>", "sourcePath": "<statement file>" }
```

After import, record `stats.rules_applied`.

### 7. Report

Report:

- imported row count;
- created rule count;
- `stats.rules_applied`;
- A6 self-check results;
- low-confidence rows;
- websearch coverage;
- unresolved ambiguity;
- whether incidents such as P10 were reproduced.

A6 self-check:

- [ ] Every AI-classified row has a judgment reason.
- [ ] Every created rule has a note.
- [ ] No rule below confidence `0.6` was created.
- [ ] The import response includes `stats.rules_applied`.

## Learning From Human Corrections

After the user reviews rows in the UI:

1. Call `GET /api/corrections?limit=1000`.
2. Group corrections by `match_key`, `source_type`, `direction`, `field_name`, `old_value`, `new_value`, and `rule_id`.
3. If a rule was repeatedly overridden, patch it or lower confidence.
4. If repeated corrections share a `match_key` but no rule exists, create a rule with `origin = human_correction`.
5. If corrections conflict, avoid broad rules and leave the pattern for review.
6. Report changed rules and cite correction evidence by aggregate pattern, not private transaction details.

Do not claim the model improved until the next import shows higher `rules_applied` or fewer low-confidence rows.

## QA By Aggregates

Use aggregate checks such as:

```sql
select statement_month, count(*) from transactions group by statement_month order by statement_month;
select classification_source, count(*) from transactions group by classification_source;
select count(*) from transactions where judgment_reason is null or trim(judgment_reason) = '';
select count(distinct judgment_reason) from transactions;
select count(*) from classification_rules where note is null or trim(note) = '';
select count(*) from classification_rules where confidence < 0.6;
select sum(applied_count) from classification_rules;
select count(*) from correction_log;
```

Do not print transaction-level details unless the user asks.

## Phase 3 Redo Standard

For Phase 3 redo, process `2026-01` through `2026-06` in order unless the user changes scope.

After each month:

- import exactly that month;
- record `stats.rules_applied`;
- check that rule application trends upward or explain why not;
- list low-confidence rows for UI review;
- do not call one completed month full Phase 3 completion.

P10 special-character rule creation:

- Try to reproduce by creating a rule whose `match_key` includes special-character-normalized merchant text.
- If reproduced, diagnose the real server/API cause before changing validation logic.
- If not reproduced, report that it remains unreproduced or closed by evidence, depending on user instruction.

## Optional References

The skill folder may include supporting references for deeper context:

- `references/operator-contract.md`
- `references/monthly-workflow.md`
- `references/api-contract.md`
- `references/category-guide.md`
- `references/bank-quirks.md`
- `references/search-playbook.md`
- `references/lessons.md`

These files clarify details, but the core operating contract is in this `SKILL.md`.

## Self-Update Protocol

After a monthly run or incident review, update only workflow-level references:

- parsing quirks;
- search tactics;
- QA failures;
- user reporting preferences;
- operational lessons.

Do not add private transaction details or merchant classification dictionaries to the skill. Store merchant facts in Finance Viewer rules and notes through the API.
