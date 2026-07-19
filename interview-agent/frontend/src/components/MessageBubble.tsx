/**
 * 消息气泡 — 渲染单条对话消息
 *
 * 支持 Markdown（含 GFM 表格）、代码高亮（Prism.js）、文件引用链接
 * 用户消息蓝色靠右，AI 消息白色靠左，流式生成时显示闪烁光标
 */
import { type ComponentPropsWithoutRef, useMemo } from 'react'
import type { ReactNode } from 'react'
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

  const containerClass = isUser
    ? 'flex justify-end msg-enter'
    : 'flex gap-3 msg-enter'

  const bubbleClass = isUser
    ? 'max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-blue-600 text-white text-sm leading-relaxed shadow-sm'
    : 'max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm leading-relaxed shadow-sm text-gray-900 dark:text-gray-100'

  const markdownComponents: Components = useMemo(
    () => ({
      code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
        const match = /language-(\w+)/.exec(className ?? '')
        const code = String(children).replace(/\n$/, '')
        // 检测是否为文件引用格式: [repo/path:line]
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

        // 内联代码
        return (
          <code
            className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-mono"
            {...props}
          >
            {children as ReactNode}
          </code>
        )
      },
      a({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 dark:text-blue-400 underline hover:no-underline"
            {...props}
          >
            {children}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <div className={containerClass}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-1">
          AI
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className={`${bubbleClass} ${message.isStreaming ? 'streaming-cursor' : ''}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content || (message.isStreaming ? '' : '...')}
            </ReactMarkdown>
          )}
        </div>

        {/* 文件引用 */}
        {message.files && message.files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.files.map((file, i) => (
              <FileReference key={`${file.path}-${i}`} file={file} />
            ))}
          </div>
        )}

        {/* 时间戳 */}
        <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold shrink-0 mt-1">
          U
        </div>
      )}
    </div>
  )
}
