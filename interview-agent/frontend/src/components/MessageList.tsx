/**
 * 消息列表 — 渲染完整对话历史
 * 空状态时显示引导文案，有消息时逐条渲染 MessageBubble
 */
import type { Message } from '../types'
import MessageBubble from './MessageBubble'

interface MessageListProps {
  messages: Message[]
}

export default function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 px-6 py-20">
        <svg className="w-16 h-16 mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <p className="text-lg font-medium mb-1">开始面试对话</p>
        <p className="text-sm text-center max-w-md">
          向面试助手提问，Agent 将基于候选人的 GitHub 项目自动生成专业回答，并引用具体代码作为佐证。
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  )
}
