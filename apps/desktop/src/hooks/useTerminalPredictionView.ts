import { useMemo } from 'react'
import type { AIPredictionSessionState } from '../types'

const EMPTY_AI_PREDICTION_STATE: AIPredictionSessionState = {
  predictions: [],
  index: 0,
  state: 'idle',
  error: '',
  thinking: '',
  streamingContent: '',
}

type UseTerminalPredictionViewArgs = {
  activeSessionId: string
  aiPredictionBySession: Record<string, AIPredictionSessionState>
  commandBuffer: string
  expandedPredictionThinkingSessionId: string
}

export function useTerminalPredictionView({
  activeSessionId,
  aiPredictionBySession,
  commandBuffer,
  expandedPredictionThinkingSessionId,
}: UseTerminalPredictionViewArgs) {
  const activePrediction = useMemo(
    () => (activeSessionId ? (aiPredictionBySession[activeSessionId] ?? EMPTY_AI_PREDICTION_STATE) : EMPTY_AI_PREDICTION_STATE),
    [activeSessionId, aiPredictionBySession],
  )
  const activePredictions = activePrediction.predictions
  const activePredictionIndex = Math.min(activePrediction.index, Math.max(0, activePredictions.length - 1))
  const primaryPrediction = commandBuffer.trim()
    ? ''
    : (activePredictions[activePredictionIndex] ?? activePredictions[0] ?? '')
  const isPredictionThinkingExpanded =
    activePrediction.state === 'loading' || expandedPredictionThinkingSessionId === activeSessionId

  return {
    activePrediction,
    activePredictions,
    activePredictionIndex,
    isPredictionThinkingExpanded,
    primaryPrediction,
  }
}
