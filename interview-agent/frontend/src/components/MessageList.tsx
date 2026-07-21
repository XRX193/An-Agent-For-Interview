import { ArrowUpRight, Braces, GitBranch, Layers3 } from 'lucide-react'
import type { Message } from '../types'
import MessageBubble from './MessageBubble'

interface MessageListProps {
  messages: Message[]
  candidateName: string
  onSend: (question: string) => void
}

const prompts = [
  { icon: GitBranch, label: '介绍一个最有代表性的项目' },
  { icon: Layers3, label: '项目架构中最关键的设计是什么？' },
  { icon: Braces, label: '结合代码讲一次技术难点' },
]

export default function MessageList({ messages, candidateName, onSend }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-mark">IA</div>
        <p className="empty-eyebrow">{candidateName} · 项目面试台</p>
        <h2>从一个真实项目开始</h2>
        <div className="prompt-list">
          {prompts.map(({ icon: Icon, label }) => (
            <button type="button" key={label} onClick={() => onSend(label)}>
              <Icon size={17} />
              <span>{label}</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  )
}
