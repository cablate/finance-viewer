"use client"

// AIBanner — 永久置頂的「AI 待審」提示：顯示 AI 沒把握（uncertain/pending）的筆數，
// 一鍵跳審查佇列。沒有待審時不顯示。這是「人類-AI 協作」的 always-on 提醒。
import { useRouter, useSearchParams } from "next/navigation"
import { Sparkles, ArrowRight } from "lucide-react"
import { useReviewQueue } from "@/lib/hooks"
import { Button } from "@/components/ui/button"

export default function AIBanner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data } = useReviewQueue()
  const total = (Number(data?.uncertain_count) || 0) + (Number(data?.unreviewed_count) || 0)
  if (total === 0) return null

  function goToReview() {
    const next = new URLSearchParams(searchParams)
    next.set("mode", "review")
    router.push(`/?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-2 border-b bg-warning/5 px-4 py-2 text-sm">
      <Sparkles className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span className="text-muted-foreground">
        AI 待審 <strong className="text-foreground">{total}</strong> 筆（待確認／待分析）
      </span>
      <Button
        type="button"
        size="sm"
        variant="link"
        className="ml-auto h-auto p-0"
        onClick={goToReview}
      >
        前往審查
        <ArrowRight className="size-3" />
      </Button>
    </div>
  )
}
