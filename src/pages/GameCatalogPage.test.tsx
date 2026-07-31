import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../app/App'

afterEach(() => {
  window.location.hash = ''
})

describe('game catalog', () => {
  it('opens gomoku from the catalog', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /五子棋/ }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '五子棋' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/games/gomoku')
    })
  })
})
