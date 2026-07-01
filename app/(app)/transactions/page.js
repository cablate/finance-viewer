// /transactions：交易明細（行內編輯 + 批次修正）。
// 篩選由 search params 驅動：month / scope / search / sort / direction / page / view / category。
import TransactionTable from "@/components/TransactionTable"

export default function Page() {
  return <TransactionTable />
}
