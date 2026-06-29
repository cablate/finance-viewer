import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: '理財工作台 | Cathay 2026',
  description: 'AI 初分、人工終審 — 國泰 2026 帳單分類審核',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <TooltipProvider delayDuration={200}>
          {children}
        </TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
