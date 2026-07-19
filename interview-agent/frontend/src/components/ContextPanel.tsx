/**
 * 检索上下文面板 — 浮动侧面板展示代码检索结果
 *
 * 显示每个 Chunk 的层级标签（项目/架构/代码/历史）、仓库路径、
 * 相关性分数、代码预览（最多 300 字符）
 */
import type { Chunk } from '../types'

interface ContextPanelProps {
  chunks: Chunk[]
  isOpen: boolean
  onToggle: () => void
}

export default function ContextPanel({ chunks, isOpen, onToggle }: ContextPanelProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-4 top-4 z-10 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        检索上下文 ({chunks.length})
      </button>
    )
  }

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg flex flex-col overflow-hidden">
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          检索上下文
        </h3>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 面板内容 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {chunks.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">
            发送问题后，这里将显示检索到的相关代码片段
          </p>
        ) : (
          chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase text-gray-400 font-medium">
                    {levelLabel(chunk.level)}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    {chunk.repo}/{chunk.path}
                  </span>
                  {chunk.score !== undefined && (
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {(chunk.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {chunk.content.length > 300
                  ? chunk.content.slice(0, 300) + '...'
                  : chunk.content}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function levelLabel(level: string): string {
  const map: Record<string, string> = {
    project: '项目',
    architecture: '架构',
    code: '代码',
    history: '历史',
  }
  return map[level] ?? level
}
