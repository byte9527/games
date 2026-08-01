import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../app/App'
import { gameCatalog } from '../games/catalog'

afterEach(() => {
  window.location.hash = ''
})

describe('game catalog', () => {
  it('从 catalog 数据渲染两张游戏卡片及各自图标', () => {
    window.location.hash = '#/'
    render(<App />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    for (const game of gameCatalog) {
      const link = screen.getByRole('link', { name: new RegExp(game.title) })
      expect(link.querySelector('.game-card__icon')).toHaveTextContent(game.icon)
    }
  })

  it('从合集进入五子棋并返回后保留两张卡片', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
    const gomokuLink = screen.getByRole('link', { name: /五子棋/ })
    expect(screen.getByRole('list', { name: '游戏列表' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '五子棋', level: 2 })).toBeInTheDocument()
    await user.click(gomokuLink)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '五子棋' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/games/gomoku')
    })

    await user.click(screen.getByRole('link', { name: '返回小游戏' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/')
      expect(screen.getByRole('heading', { name: '五子棋', level: 2 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '数独', level: 2 })).toBeInTheDocument()
    })
  })

  it('从合集进入数独并返回后保留两张卡片', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App />)

    const sudokuLink = screen.getByRole('link', { name: /数独/ })
    expect(sudokuLink).toHaveAttribute('href', '#/games/sudoku')
    await user.click(sudokuLink)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '数独', level: 1 })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/games/sudoku')
    })

    await user.click(screen.getByRole('link', { name: '返回小游戏' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '五子棋', level: 2 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '数独', level: 2 })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/')
    })
  })
})
