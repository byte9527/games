import { render, screen } from '@testing-library/react'
import { App } from './App'

const swMocks = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [swMocks.needRefresh, swMocks.setNeedRefresh],
    updateServiceWorker: swMocks.updateServiceWorker,
  }),
}))

beforeEach(() => {
  swMocks.needRefresh = false
  window.localStorage.clear()
})

afterEach(() => {
  window.location.hash = ''
})

describe('App', () => {
  it('renders the game collection heading', () => {
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
  })

  it('falls back to the catalog for an unknown hash', () => {
    window.location.hash = '#/missing'
    render(<App />)

    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
  })

  it('在现有 hash 路由外壳中提供安装和更新入口', () => {
    swMocks.needRefresh = true
    window.location.hash = '#/'

    render(<App />)

    expect(screen.getByRole('button', { name: '如何安装' })).toBeInTheDocument()
    expect(screen.getByText('新版本已经准备好。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
  })
})
