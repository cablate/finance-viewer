"use client"

import { AlertTriangle, CheckCircle2, CircleDashed, Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function CoveragePanel({ coverage }) {
  if (!coverage) return null

  if (coverage.status === "empty") {
    return (
      <Alert className="border-muted bg-muted/30">
        <CircleDashed className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>這個範圍沒有可產生報表的交易</AlertTitle>
        <AlertDescription>
          請先匯入並審核交易，或改選有資料的月份，再閱讀損益表。
        </AlertDescription>
      </Alert>
    )
  }

  if (coverage.status === "unmapped") {
    const count = coverage.unmapped_transaction_count || 0
    return (
      <Alert className="border-info/30 bg-info/10 text-info">
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>這份報表有交易尚未對應報表科目</AlertTitle>
        <AlertDescription className="text-info/90">
          {count} 筆交易需要指定報表科目，完成後即可產出完整損益表。
        </AlertDescription>
      </Alert>
    )
  }

  const blockers = coverage.blockers || []
  if (blockers.length > 0) {
    return (
      <Alert className="border-warning/30 bg-warning/10 text-warning">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>這份報表仍是待補狀態</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {blockers.map((blocker) => (
              <li key={`${blocker.kind}:${blocker.count}`}>
                {blocker.label}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    )
  }

  if (coverage.status === "complete") {
    return (
      <Alert className="border-success/30 bg-success/10 text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>這個範圍的損益表資料已完整</AlertTitle>
        <AlertDescription className="text-success/90">
          目前沒有未指定報表科目或尚未審核的交易阻擋這份管理損益表。
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
