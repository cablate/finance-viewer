import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'Finance Viewer',
  description: 'Local-first finance review workspace for statement import and classification.',
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
