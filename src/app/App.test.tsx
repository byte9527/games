import { render, screen } from '@testing-library/react'
import { App } from './App'

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
})
