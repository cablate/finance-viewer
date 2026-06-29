"use client"

import { Component, Fragment } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

// ErrorBoundary：class 元件，catch render / child 錯誤後顯示 shadcn Alert 含重試鈕。
// 重試會 increment retryKey，讓 children 重新 mount 並重新觸發底層 useApi fetch。
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, retryKey: 0 }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // 開發排查用；不阻擋 UI
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info)
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }))
  }

  render() {
    const { hasError, error, retryKey } = this.state
    if (hasError) {
      const message =
        error && error.message
          ? error.message
          : "載入時發生未預期的錯誤"
      return (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>發生錯誤</AlertTitle>
          <AlertDescription>
            <p className="text-sm">{message}</p>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={this.handleRetry}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                重試
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )
    }
    return <Fragment key={retryKey}>{this.props.children}</Fragment>
  }
}
