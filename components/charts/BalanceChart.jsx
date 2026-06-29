"use client"

// BalanceChart：月度餘額走勢，用 shadcn ChartContainer + Recharts AreaChart。
// props：
//   data: [{ month, balance }]
//   ariaLabel: 圖表 aria-label
// 無資料時顯示 Empty；附 visually-hidden 資料表。

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { formatMonth, formatTWD } from "@/lib/format"

const config = {
  balance: { label: "餘額", color: "var(--chart-1)" },
}

// input 為 cents（DB 已 migration），先除 100 還原為元再套用 萬/k 邏輯。
function tickFormat(value) {
  const n = (Number(value) || 0) / 100
  const abs = Math.abs(n)
  if (abs >= 10000) return `${Math.round(n / 10000)}萬`
  if (abs >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

export default function BalanceChart({ data = [], ariaLabel = "餘額走勢圖" }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>無資料</EmptyTitle>
          <EmptyDescription>目前沒有可顯示的月份資料</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div role="figure" aria-label={ariaLabel}>
      <ChartContainer config={config} className="aspect-video w-full max-h-[320px]">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={formatMonth}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={tickFormat}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelKey="balance"
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.month
                    ? formatMonth(payload[0].payload.month)
                    : ""
                }
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {config[name]?.label ?? name}
                    </span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatTWD(value)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <defs>
            <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--color-balance)"
            fill="url(#balFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">月份</th>
            <th scope="col">餘額</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{formatMonth(d.month)}</th>
              <td>{formatTWD(d.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
