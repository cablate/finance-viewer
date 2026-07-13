import ConfirmationQueue from "@/components/finance/ConfirmationQueue"

export default function ConfirmationsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">待你確認</h2>
        <p className="mt-1 text-sm text-muted-foreground">這些操作會改變財務分析採用的資料範圍。</p>
      </div>
      <ConfirmationQueue />
    </div>
  )
}
