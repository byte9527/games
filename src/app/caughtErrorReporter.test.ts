import { createCaughtErrorReporter } from './caughtErrorReporter'

const errorInfo = {
  componentStack: '\n    at BrokenChild',
}

describe('createCaughtErrorReporter', () => {
  it('开发环境对每个捕获错误精确记录一次', () => {
    const logger = vi.fn()
    const reportCaughtError = createCaughtErrorReporter(true, logger)
    const error = new Error('render failed')

    reportCaughtError(error, errorInfo)

    expect(logger).toHaveBeenCalledOnce()
    expect(logger).toHaveBeenCalledWith(error, errorInfo)
  })

  it('生产环境不记录捕获错误', () => {
    const logger = vi.fn()
    const reportCaughtError = createCaughtErrorReporter(false, logger)

    reportCaughtError(new Error('first render failed'), errorInfo)
    reportCaughtError(new Error('second render failed'), errorInfo)

    expect(logger).not.toHaveBeenCalled()
  })
})
