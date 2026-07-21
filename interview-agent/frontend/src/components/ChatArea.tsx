import { AlertCircle } from 'lucide-react'
import type { Message } from '../types'
import InputBar from './InputBar'
import MessageList from './MessageList'
import TypingIndicator from './TypingIndicator'

interface ChatAreaProps {
  messages: Message[]
  isStreaming: boolean
  onSend: (question: string) => void
  onRetry?: () => void
  error: string | null
  candidateName: string
  selectedProject?: string
  onClearProject: () => void
  onOpenProjects: () => void
}

export default function ChatArea({
  messages,
  isStreaming,
  onSend,
  onRetry,
  error,
  candidateName,
  selectedProject,
  onClearProject,
  onOpenProjects,
}: ChatAreaProps) {
  return (
    <section className="chat-area" aria-label="面试对话">
      <div className="message-scroller">
        <MessageList messages={messages} onSend={onSend} candidateName={candidateName} />
        {isStreaming && <TypingIndicator />}
      </div>

      <div className="composer-dock">
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                重试
              </button>
            )}
          </div>
        )}
        <InputBar
          onSend={onSend}
          disabled={isStreaming}
          selectedProject={selectedProject}
          onClearProject={onClearProject}
          onOpenProjects={onOpenProjects}
        />
      </div>
    </section>
  )
}
