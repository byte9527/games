import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the game collection heading', () => {
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
  })
})
