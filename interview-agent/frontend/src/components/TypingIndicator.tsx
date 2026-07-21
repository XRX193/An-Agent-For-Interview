import { SearchCode } from 'lucide-react'

export default function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status">
      <SearchCode size={17} />
      <span>正在检索项目</span>
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
