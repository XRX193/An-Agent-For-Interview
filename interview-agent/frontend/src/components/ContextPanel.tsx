import { Code2, Database, FileCode2, GitCommitHorizontal, Layers3, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Chunk } from '../types'

interface ContextPanelProps {
  chunks: Chunk[]
  isOpen: boolean
  onToggle: () => void
}

export default function ContextPanel({ chunks, isOpen, onToggle }: ContextPanelProps) {
  if (!isOpen) return null

  return (
    <aside className="context-panel" aria-label="检索上下文">
      <div className="context-header">
        <div>
          <Database size={17} />
          <h2>检索上下文</h2>
          <span>{chunks.length}</span>
        </div>
        <button type="button" className="icon-button" onClick={onToggle} aria-label="关闭上下文" title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="context-body">
        {chunks.length === 0 ? (
          <div className="context-empty">
            <Database size={24} />
            <p>暂无检索结果</p>
          </div>
        ) : (
          chunks.map((chunk) => {
            const LevelIcon = levelIcon(chunk.level)
            return (
              <article key={chunk.id} className="context-item">
                <div className="context-item-head">
                  <LevelIcon size={14} />
                  <span className="context-level">{levelLabel(chunk.level)}</span>
                  {chunk.score !== undefined && (
                    <span className="context-score">{Math.round(chunk.score * 100)}%</span>
                  )}
                </div>
                <p className="context-path">{chunk.repo}/{chunk.path}</p>
                <pre>{chunk.content.length > 320 ? `${chunk.content.slice(0, 320)}...` : chunk.content}</pre>
              </article>
            )
          })
        )}
      </div>
    </aside>
  )
}

function levelLabel(level: string): string {
  const labels: Record<string, string> = {
    project: '项目',
    architecture: '架构',
    code: '代码',
    history: '历史',
  }
  return labels[level] ?? level
}

function levelIcon(level: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    project: FileCode2,
    architecture: Layers3,
    code: Code2,
    history: GitCommitHorizontal,
  }
  return icons[level] ?? FileCode2
}
