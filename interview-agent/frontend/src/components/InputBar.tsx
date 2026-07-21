import { ArrowUp, Folder, LoaderCircle, Plus, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'

interface InputBarProps {
  onSend: (question: string) => void
  disabled?: boolean
  selectedProject?: string
  onClearProject: () => void
  onOpenProjects: () => void
}

export default function InputBar({
  onSend,
  disabled,
  selectedProject,
  onClearProject,
  onOpenProjects,
}: InputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    const question = value.trim()
    if (!question || disabled) return

    onSend(question)
    setValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    const element = inputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`
  }

  return (
    <div className="composer">
      {selectedProject && (
        <div className="scope-row">
          <span className="scope-chip">
            <Folder size={13} />
            <span>{selectedProject}</span>
            <button type="button" onClick={onClearProject} aria-label="取消项目限定" title="取消项目限定">
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        rows={1}
        placeholder={disabled ? '正在整理回答...' : '向项目智能体提问'}
        aria-label="面试问题"
      />

      <div className="composer-toolbar">
        <button
          type="button"
          className="composer-tool"
          aria-label="选择项目"
          title="选择项目"
          onClick={onOpenProjects}
        >
          <Plus size={19} />
        </button>
        <div className="composer-status">
          <span className="status-dot" />
          <span>{selectedProject ? '单项目检索' : '全部项目检索'}</span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="send-button"
          aria-label="发送问题"
          title="发送问题"
        >
          {disabled ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={19} />}
        </button>
      </div>
    </div>
  )
}
