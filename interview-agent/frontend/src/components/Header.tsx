import { Database, Folder, MoreHorizontal, PanelLeftOpen, RotateCcw } from 'lucide-react'

interface HeaderProps {
  title: string
  contextCount: number
  contextOpen: boolean
  onOpenMenu: () => void
  onToggleContext: () => void
  onClear: () => void
}

export default function Header({
  title,
  contextCount,
  contextOpen,
  onOpenMenu,
  onToggleContext,
  onClear,
}: HeaderProps) {
  return (
    <header className="workspace-header">
      <div className="workspace-title-wrap">
        <button
          type="button"
          className="icon-button mobile-only"
          aria-label="打开项目栏"
          title="打开项目栏"
          onClick={onOpenMenu}
        >
          <PanelLeftOpen size={18} />
        </button>
        <Folder size={17} className="header-folder" aria-hidden="true" />
        <h1>{title}</h1>
        <MoreHorizontal size={18} className="header-more" aria-hidden="true" />
      </div>

      <div className="header-actions">
        <button
          type="button"
          className={`context-button ${contextOpen ? 'active' : ''}`}
          onClick={onToggleContext}
        >
          <Database size={16} />
          <span>检索上下文</span>
          <span className="context-count">{contextCount}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="清空对话"
          title="清空对话"
          onClick={onClear}
        >
          <RotateCcw size={17} />
        </button>
      </div>
    </header>
  )
}
