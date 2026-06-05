import { useRef, useState } from 'react'
import type { AIAgentPlanStep, SessionAgentState } from '../types'

export const DEFAULT_SESSION_AGENT_STATE: SessionAgentState = {
  mode: 'review',
  state: 'idle',
  message: '',
  goal: '',
  running: false,
  pendingStepId: '',
}

export function useSessionAgentState() {
  const [agentStateBySession, setAgentStateBySession] = useState<Record<string, SessionAgentState>>({})
  const [agentStepsBySession, setAgentStepsBySession] = useState<Record<string, AIAgentPlanStep[]>>({})
  const agentStateBySessionRef = useRef<Record<string, SessionAgentState>>({})
  const agentStepsBySessionRef = useRef<Record<string, AIAgentPlanStep[]>>({})

  const getSessionAgentState = (sessionId: string) =>
    agentStateBySessionRef.current[sessionId] ?? DEFAULT_SESSION_AGENT_STATE

  const updateSessionAgentState = (
    sessionId: string,
    updater: Partial<SessionAgentState> | ((current: SessionAgentState) => SessionAgentState),
  ) => {
    if (!sessionId) {
      return
    }
    const current = agentStateBySessionRef.current
    const previous = current[sessionId] ?? DEFAULT_SESSION_AGENT_STATE
    const nextState =
      typeof updater === 'function'
        ? updater(previous)
        : { ...previous, ...updater }
    const next = { ...current, [sessionId]: nextState }
    agentStateBySessionRef.current = next
    setAgentStateBySession(next)
  }

  const getAgentStepsForSession = (sessionId: string) =>
    agentStepsBySessionRef.current[sessionId] ?? []

  const setAgentStepsForSession = (
    sessionId: string,
    updater: AIAgentPlanStep[] | ((current: AIAgentPlanStep[]) => AIAgentPlanStep[]),
  ) => {
    if (!sessionId) {
      return
    }
    const current = agentStepsBySessionRef.current
    const previous = current[sessionId] ?? []
    const nextSteps = typeof updater === 'function' ? updater(previous) : updater
    const next = { ...current, [sessionId]: nextSteps }
    agentStepsBySessionRef.current = next
    setAgentStepsBySession(next)
  }

  const findAgentStepById = (stepId: string) => {
    for (const [sessionId, steps] of Object.entries(agentStepsBySessionRef.current)) {
      const step = steps.find((item) => item.id === stepId)
      if (step) {
        return { sessionId, step }
      }
    }
    return null
  }

  return {
    agentStateBySession,
    agentStateBySessionRef,
    agentStepsBySession,
    agentStepsBySessionRef,
    findAgentStepById,
    getAgentStepsForSession,
    getSessionAgentState,
    setAgentStepsForSession,
    updateSessionAgentState,
  }
}
