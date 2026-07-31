import { Component, type ReactNode } from 'react'
import { reloadPage } from './reloadPage'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main>
          <h1>页面暂时无法显示</h1>
          <p>当前页面遇到了不可预期的问题，请重新加载。</p>
          <button type="button" onClick={() => reloadPage()}>
            重新加载
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
