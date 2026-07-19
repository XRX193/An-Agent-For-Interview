import type { ReactNode } from 'react'
import MessageList from './MessageList'
import InputBar from './InputBar'
import TypingIndicator from './TypingIndicator'
import type { Message } from '../types'

interface ChatAreaProps {
  messages: Message[]
  isStreaming: boolean
  onSend: (question: string) => void
  onRetry?: () => void
  error: string | null
  children?: ReactNode
}

export default function ChatArea({
  messages,
  isStreaming,
  onSend,
  onRetry,
  error,
  children,
}: ChatAreaProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-gray-950">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        {children}
        <MessageList messages={messages} />
        {isStreaming && (
          <div className="px-4 py-2">
            <TypingIndicator />
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          <span>{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-3 underline hover:no-underline"
            >
              重试
            </button>
          )}
        </div>
      )}

      {/* 输入区域 */}
      <InputBar onSend={onSend} disabled={isStreaming} />
    </div>
  )
}
