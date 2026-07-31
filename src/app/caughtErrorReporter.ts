import type { Component } from 'react'

type CaughtErrorInfo = {
  componentStack?: string
  errorBoundary?: Component<unknown>
}

type CaughtErrorLogger = (error: unknown, errorInfo: CaughtErrorInfo) => void

export function createCaughtErrorReporter(
  isDevelopment: boolean,
  logger: CaughtErrorLogger,
) {
  return (error: unknown, errorInfo: CaughtErrorInfo) => {
    if (isDevelopment) {
      logger(error, errorInfo)
    }
  }
}
