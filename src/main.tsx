import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { createCaughtErrorReporter } from './app/caughtErrorReporter'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing #root element')
}

const reportCaughtError = createCaughtErrorReporter(
  import.meta.env.DEV,
  (error, errorInfo) => console.error(error, errorInfo),
)

createRoot(root, { onCaughtError: reportCaughtError }).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
