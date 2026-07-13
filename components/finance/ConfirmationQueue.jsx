"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, RefreshCw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

const ACTION_LABELS = {
  declare_scope_complete: "確認資料範圍完整",
}

function ProposalDetails({ proposal }) {
  const payload = proposal.payload || {}
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs text-muted-foreground">範圍</dt>
        <dd className="mt-0.5 font-medium">{payload.scope_kind || proposal.resource_type}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">資料截至</dt>
        <dd className="mt-0.5 font-medium tabular-nums">{payload.as_of_date || "未指定"}</dd>
      </div>
      {payload.included_note ? (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">納入內容</dt>
          <dd className="mt-0.5 break-words">{payload.included_note}</dd>
        </div>
      ) : null}
      {payload.excluded_note ? (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">排除內容</dt>
          <dd className="mt-0.5 break-words">{payload.excluded_note}</dd>
        </div>
      ) : null}
    </dl>
  )
}

export default function ConfirmationQueue() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [workingKey, setWorkingKey] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/finance/human-confirmations?status=pending", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || "無法讀取確認項目")
      setItems(data.confirmations || [])
    } catch (loadError) {
      setError(loadError.message || "無法讀取確認項目")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function confirm(proposalKey) {
    setWorkingKey(proposalKey)
    try {
      const sessionResponse = await fetch("/api/finance/human-confirmations/browser-session", { cache: "no-store", credentials: "same-origin" })
      const session = await sessionResponse.json()
      if (!sessionResponse.ok) throw new Error("無法建立確認工作階段")
      const response = await fetch(`/api/finance/human-confirmations/${proposalKey}/confirm`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser_nonce: session.browser_nonce }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error?.message || "確認失敗")
      setItems((current) => current.filter((item) => item.proposal_key !== proposalKey))
      toast.success("資料範圍已確認")
    } catch (confirmError) {
      toast.error(confirmError.message || "確認失敗")
    } finally {
      setWorkingKey("")
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
  }

  if (error) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={load}><RefreshCw aria-hidden="true" />重新整理</Button>
      </div>
    )
  }

  if (!items.length) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Check aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>目前沒有待確認項目</EmptyTitle>
          <EmptyDescription>AI 準備需要由你決定的資料範圍後，項目會出現在這裡。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="divide-y border">
      {items.map((proposal) => (
        <section key={proposal.proposal_key} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{ACTION_LABELS[proposal.action_kind] || proposal.action_kind}</h2>
            </div>
            <ProposalDetails proposal={proposal} />
            <p className="text-xs text-muted-foreground">確認期限：{new Date(proposal.expires_at).toLocaleString("zh-TW")}</p>
          </div>
          <Button disabled={workingKey === proposal.proposal_key} onClick={() => confirm(proposal.proposal_key)}>
            <ShieldCheck aria-hidden="true" />{workingKey === proposal.proposal_key ? "確認中" : "確認並套用"}
          </Button>
        </section>
      ))}
    </div>
  )
}
