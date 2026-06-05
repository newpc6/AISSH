import { useTranslation } from 'react-i18next'

type UseAIUnifiedInputArgs = {
  aiUnifiedPrompt: string
  batchActive: boolean
  batchMode: boolean
  batchSelectedHostCount: number
  batchTask: string
  onRunUnifiedAI: () => void | Promise<void>
  onSetAiUnifiedPrompt: (value: string) => void
  onSetBatchTask: (value: string) => void
  onStartBatchExecution: () => void | Promise<void>
}

export function useAIUnifiedInput({
  aiUnifiedPrompt,
  batchActive,
  batchMode,
  batchSelectedHostCount,
  batchTask,
  onRunUnifiedAI,
  onSetAiUnifiedPrompt,
  onSetBatchTask,
  onStartBatchExecution,
}: UseAIUnifiedInputArgs) {
  const { t } = useTranslation()
  const isBatchTaskInput = batchMode && batchSelectedHostCount > 0 && !batchActive
  const aiUnifiedInputPlaceholder = isBatchTaskInput
    ? t('aiWorkspace.input.batchPlaceholder')
    : t('aiWorkspace.input.defaultPlaceholder')
  const aiUnifiedInputValue = isBatchTaskInput ? batchTask : aiUnifiedPrompt

  const updateAiUnifiedInputValue = (value: string) => {
    if (isBatchTaskInput) {
      onSetBatchTask(value)
      return
    }
    onSetAiUnifiedPrompt(value)
  }

  const submitAiUnifiedInput = () => {
    if (isBatchTaskInput) {
      return onStartBatchExecution()
    }
    return onRunUnifiedAI()
  }

  return {
    aiUnifiedInputPlaceholder,
    aiUnifiedInputValue,
    isBatchTaskInput,
    submitAiUnifiedInput,
    updateAiUnifiedInputValue,
  }
}
