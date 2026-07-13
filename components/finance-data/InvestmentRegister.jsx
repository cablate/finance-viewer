'use client';

import { BadgeDollarSign, Clock3, LineChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function money(value, currency = 'TWD') {
  if (value == null) return '尚無估值';
  const exponent = currency === 'JPY' ? 0 : 2; const scale = 10n ** BigInt(exponent); const minor = BigInt(value);
  const whole = minor / scale; const fraction = (minor < 0n ? -(minor % scale) : minor % scale).toString().padStart(exponent, '0');
  const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent });
  if (exponent === 0) return formatter.format(whole);
  const displayWhole = minor < 0n && whole === 0n ? -0 : whole;
  return formatter.formatToParts(displayWhole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}

const STATUS = { current: '估值可用', stale: '報價過期', missing_quote: '缺報價', missing_fx: '缺匯率', currency_mismatch: '幣別衝突' };

export default function InvestmentRegister({ inventory }) {
  const positions = inventory.investments || []; const readiness = inventory.readiness?.investment_value;
  return <div className="space-y-8">
    <section className="grid gap-4 border-b pb-6 md:grid-cols-[minmax(0,1.4fr)_minmax(14rem,0.8fr)]"><div><div className="flex flex-wrap items-center gap-2"><LineChart className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">投資估值準備度</h2><Badge variant={readiness?.status === 'complete' ? 'default' : 'outline'}>{readiness?.status === 'complete' ? '可分析' : '資料不完整'}</Badge></div><p className="mt-2 text-sm text-muted-foreground">持倉、來源報告價值與工具推導估值分開呈現；缺報價或匯率時不湊總額。</p></div><div className="text-sm"><p className="font-medium">仍需處理 {readiness?.gaps?.length || 0} 個缺口</p><p className="mt-1 text-muted-foreground">{readiness?.gaps?.[0]?.gap || '目前沒有阻擋估值的缺口。'}</p></div></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">最新持倉與估值</h2><span className="text-sm tabular-nums text-muted-foreground">{positions.length}</span></div>
      {positions.length ? <div className="divide-y rounded-md border">{positions.map((position) => <article key={position.holding_key} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium">{position.instrument_name}</h3><Badge variant={position.valuation_status === 'current' ? 'default' : 'outline'}>{STATUS[position.valuation_status] || position.valuation_status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{position.symbol || '無代號'} · {position.quantity_decimal} 單位 · 持倉日 {position.as_of_date}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" aria-hidden="true" />報價 {position.quote?.as_of_date || '未提供'} · FX {position.fx?.as_of_date || (position.quote_currency === position.base_currency ? '不需要' : '未提供')}</p></div><div className="sm:text-right"><p className="font-mono text-base font-semibold tabular-nums">{money(position.base_value_minor, position.base_currency)}</p><p className="text-xs text-muted-foreground">來源報告 {money(position.reported_market_value_minor, position.currency)}</p></div></article>)}</div> : <div className="rounded-md border border-dashed px-5 py-10 text-center"><p className="font-medium">尚無持倉 snapshot</p><p className="mt-1 text-sm text-muted-foreground">先建立投資帳戶，再由 AI 依券商來源走 preview／commit 匯入持倉與報價。</p></div>}
    </section>
  </div>;
}
