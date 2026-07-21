import { Check, Copy, Sparkles } from 'lucide-react'
import { type ComponentPropsWithoutRef, type ReactNode, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../types'
import CodeBlock from './CodeBlock'
import FileReference from './FileReference'

interface MessageBubbleProps {
  message: Message
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const markdownComponents: Components = useMemo(
    () => ({
      code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
        const match = /language-(\w+)/.exec(className ?? '')
        const code = String(children).replace(/\n$/, '')
        const fileRefMatch = code.match(/^\[(.+?):(\d+)\]$/)

        if (match) {
          return (
            <CodeBlock
              language={match[1]}
              code={code}
              fileRef={
                fileRefMatch
                  ? {
                      repo: fileRefMatch[1].split('/')[0],
                      path: fileRefMatch[1],
                      line: parseInt(fileRefMatch[2]),
                      url: `https://github.com/${fileRefMatch[1]}#L${fileRefMatch[2]}`,
                    }
                  : undefined
              }
            />
          )
        }

        return (
          <code className="inline-code" {...props}>
            {children as ReactNode}
          </code>
        )
      },
      a({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <article className={`message-row ${isUser ? 'user-message' : 'assistant-message'} msg-enter`}>
      {!isUser && (
        <div className="assistant-label">
          <span className="assistant-icon"><Sparkles size={14} /></span>
          <span>项目智能体</span>
        </div>
      )}

      <div className={isUser ? 'user-bubble' : 'assistant-content'}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className={`markdown ${message.isStreaming ? 'streaming-cursor' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content || (message.isStreaming ? '' : '...')}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {message.files && message.files.length > 0 && (
        <div className="file-reference-list">
          {message.files.map((file, index) => (
            <FileReference key={`${file.path}-${index}`} file={file} />
          ))}
        </div>
      )}

      <div className="message-meta">
        <time dateTime={new Date(message.timestamp).toISOString()}>
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
        {message.content && (
          <button type="button" onClick={copyMessage} aria-label="复制消息" title="复制消息">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </article>
  )
}
