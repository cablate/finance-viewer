"use client"

// TrendChart：月度支出走勢，用 shadcn ChartContainer + Recharts AreaChart。
// props：
//   data: [{ month, spend, personalSpend, businessSpend }]
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
  spend: { label: "總支出", color: "var(--chart-1)" },
  personalSpend: { label: "個人", color: "var(--chart-2)" },
  businessSpend: { label: "事業", color: "var(--chart-3)" },
}

// Y 軸刻度緊湊顯示（萬 / k），避免長數字擠壓圖面。
// input 為 cents（DB 已 migration），先除 100 還原為元再套用 萬/k 邏輯。
function tickFormat(value) {
  const n = (Number(value) || 0) / 100
  const abs = Math.abs(n)
  if (abs >= 10000) return `${Math.round(n / 10000)}萬`
  if (abs >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

export default function TrendChart({ data = [], ariaLabel = "支出走勢圖" }) {
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
                labelKey="spend"
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
            <linearGradient id="trendSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-spend)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-spend)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="personalSpend"
            stackId="owner"
            stroke="var(--color-personalSpend)"
            fill="var(--color-personalSpend)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="businessSpend"
            stackId="owner"
            stroke="var(--color-businessSpend)"
            fill="var(--color-businessSpend)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="spend"
            stroke="var(--color-spend)"
            fill="url(#trendSpend)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">月份</th>
            <th scope="col">總支出</th>
            <th scope="col">個人支出</th>
            <th scope="col">事業支出</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{formatMonth(d.month)}</th>
              <td>{formatTWD(d.spend)}</td>
              <td>{formatTWD(d.personalSpend)}</td>
              <td>{formatTWD(d.businessSpend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
