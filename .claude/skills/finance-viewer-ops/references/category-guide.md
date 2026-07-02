# Category Guide

Use current app metadata from `GET /api/meta` when available. If metadata is unavailable, use this guide as the operator baseline.

## Category Set

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

## Boundary Rules

- Restaurant, cafe, drinks, delivery, groceries eaten soon: `飲食`.
- MRT, taxi, rideshare, parking, fuel, transport tickets: `交通`.
- General retail, ecommerce, clothing, personal items, 3C accessories: `購物`.
- Home supplies, furniture, appliances, utilities, household maintenance: `居家`.
- Clinic, pharmacy, supplements, insurance-like health spending: `醫療保健`.
- Movies, games, events, leisure venues: `娛樂`.
- Recurring digital services, cloud, SaaS, streaming, app subscriptions: `訂閱軟體`.
- Books, courses, workshops, professional learning: `學習成長`.
- Brokerage, fund, crypto, securities-related transfers or fees: `投資`.
- Tax payments, government tax, filing-related charges: `稅務`.
- Foreign transaction fees, card fees, bank fees: `金融手續費`.
- Card payment, repayment, internal transfer, account movement: `轉帳/還款/內部移動`.
- Work tools, business software, client/project expenses, reimbursable work spend: `事業支出`.
- Refunds, adjustments, rebates, interest income, unexplained income-side items: `其他收入/調整`.

When a merchant could fit multiple categories, prefer the user's financial decision value:

1. Is it a repayment, transfer, refund, or income-side adjustment? Use transfer/income categories.
2. Is it clearly business/work-related? Use `事業支出`.
3. Is it a recurring digital service? Use `訂閱軟體`.
4. Is it food or daily consumable? Use `飲食`.
5. Is evidence weak? Use the best category with low confidence and do not create a rule below `0.6`.

## Confidence Calibration

| Confidence | Use when |
|---|---|
| 0.9-1.0 | Merchant and category are obvious from statement or official evidence. |
| 0.7-0.85 | Web search or strong contextual evidence supports one category. |
| 0.5-0.65 | Reasonable but not definitive inference; good enough to review but weak for broad rules. |
| 0.2-0.45 | Ambiguous, truncated, or low evidence; best guess only, review needed. |

Do not create a rule with confidence below `0.6`.

## Judgment Reason

Every AI-classified transaction must have one short human-readable reason.

Good reasons include:

- what the merchant appears to be
- what evidence was used
- why the category follows
- uncertainty when confidence is low

Examples:

- `官方/搜尋結果顯示為餐飲店，消費型態符合外食，因此歸為飲食。`
- `名稱只剩截斷片段，未查到明確商家；依描述暫歸購物，低信心待審。`
- `國外交易手續費屬信用卡費用，歸為金融手續費。`

Avoid empty, templated, or repeated generic reasons.
