// 前後端共用常數。純資料、無副作用，client component 可直接 import。

// 人工可編輯欄位白名單（金額/日期/來源完全不在內 →「不改金額」硬保證）。
// 同時套用於 PATCH 與 batch，是 SQL injection 防線（動態欄位名只來自此陣列）。
const EDITABLE_FIELDS = ['owner_primary', 'category_primary', 'necessity', 'memo'];

// breakdown 維度 → 欄位對應
const DIMENSION_MAP = {
  category: 'category_primary',
  owner: 'owner_primary',
  necessity: 'necessity',
  source: 'source_type',
  flow: 'flow_type',
};

// 表單選項（combobox/批次 UI 用）。值域規則在此體現（DB 端 CHECK 留待階段 2b 補）。
const OWNER_OPTIONS = ['個人', '事業', '事業候選', '移轉不算', '待確認'];
const NECESSITY_OPTIONS = ['必要', '事業必要', '可節省', '可優化', '需確認', '不列入'];

module.exports = {
  EDITABLE_FIELDS,
  DIMENSION_MAP,
  OWNER_OPTIONS,
  NECESSITY_OPTIONS,
};
