import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { createGame, placeStone, resetGame, undoLastMove } from './core/game'
import { type GameState, type Position } from './core/types'
import { type GomokuStoragePort } from './storage/storage'

interface GomokuGameController {
  game: GameState
  notice: string | null
  play(position: Position): void
  undo(): void
  restart(): void
  dismissNotice(): void
}

interface ControllerState {
  readonly game: GameState
  readonly notice: string | null
}

const STORAGE_UNAVAILABLE_NOTICE = '自动保存不可用，本局仍可继续。'

function loadControllerState(storage: GomokuStoragePort): ControllerState {
  const loadResult = storage.load()
  switch (loadResult.kind) {
    case 'loaded':
      return { game: loadResult.state, notice: null }
    case 'empty':
      return { game: createGame(), notice: null }
    case 'invalid':
      return { game: createGame(), notice: '旧对局无法恢复，已开始新棋局。' }
    case 'unavailable':
      return { game: createGame(), notice: STORAGE_UNAVAILABLE_NOTICE }
  }
}

export function useGomokuGame(storage: GomokuStoragePort): GomokuGameController {
  const [state, setState] = useState<ControllerState>(() => ({
    game: createGame(),
    notice: null,
  }))
  const gameRef = useRef(state.game)
  const storageRef = useRef(storage)
  const initialStorageRef = useRef(storage)
  const initializedRef = useRef(false)

  useLayoutEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const loadedState = loadControllerState(initialStorageRef.current)
    gameRef.current = loadedState.game
    setState(loadedState)
  }, [])

  useLayoutEffect(() => {
    storageRef.current = storage
  }, [storage])

  const updateGame = useCallback((nextGame: GameState): void => {
    gameRef.current = nextGame
    setState((current) => ({ ...current, game: nextGame }))
  }, [])

  const showStorageUnavailableNotice = useCallback((): void => {
    setState((current) => ({ ...current, notice: STORAGE_UNAVAILABLE_NOTICE }))
  }, [])

  const play = useCallback((position: Position): void => {
    const result = placeStone(gameRef.current, position)
    if (!result.ok) return

    updateGame(result.state)

    const saveResult = storageRef.current.save(result.state)
    if (!saveResult.ok) showStorageUnavailableNotice()
  }, [showStorageUnavailableNotice, updateGame])

  const undo = useCallback((): void => {
    const nextGame = undoLastMove(gameRef.current)
    if (nextGame === gameRef.current) return

    updateGame(nextGame)
    const saveResult = storageRef.current.save(nextGame)
    if (!saveResult.ok) showStorageUnavailableNotice()
  }, [showStorageUnavailableNotice, updateGame])

  const restart = useCallback((): void => {
    const nextGame = resetGame()
    updateGame(nextGame)

    const clearResult = storageRef.current.clear()
    if (!clearResult.ok) showStorageUnavailableNotice()
  }, [showStorageUnavailableNotice, updateGame])

  const dismissNotice = useCallback((): void => {
    setState((current) => ({ ...current, notice: null }))
  }, [])

  return {
    game: state.game,
    notice: state.notice,
    play,
    undo,
    restart,
    dismissNotice,
  }
}
