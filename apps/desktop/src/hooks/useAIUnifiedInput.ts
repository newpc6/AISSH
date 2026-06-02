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
  const isBatchTaskInput = batchMode && batchSelectedHostCount > 0 && !batchActive
  const aiUnifiedInputPlaceholder = isBatchTaskInput
    ? '批量任务：输入自然语言任务描述（如"更新 apt、检查磁盘空间"），点击右侧发送按钮启动'
    : '直接告诉 AI 你想做什么，例如：解释这段报错、总结日志、生成安装 nginx 的命令，或帮我完成一次服务器操作'
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
