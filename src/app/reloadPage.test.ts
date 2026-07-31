import { reloadPage } from './reloadPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reloadPage', () => {
  it('以目标对象作为接收者调用 reload', () => {
    const target = {
      reloaded: false,
      reload() {
        this.reloaded = true
      },
    }

    reloadPage(target)

    expect(target.reloaded).toBe(true)
  })

  it('无参数时使用 window.location 作为默认目标', () => {
    const target = {
      reloaded: false,
      reload() {
        this.reloaded = true
      },
    }
    vi.stubGlobal('window', { location: target })

    reloadPage()

    expect(target.reloaded).toBe(true)
  })
})
