import { useMemo, useState } from 'react'
import {
  ChevronDown,
  CircleCheck,
  Database,
  FolderKanban,
  PanelLeftClose,
  Search,
  SquarePen,
  X,
} from 'lucide-react'
import type { Project } from '../types'
import ProjectList from './ProjectList'

interface SidebarProps {
  open: boolean
  projects: Project[]
  loading: boolean
  selectedProject?: string
  candidateName: string
  candidateTitle: string
  contextCount: number
  onClose: () => void
  onNewConversation: () => void
  onProjectSelect: (project: Project) => void
  onSelectAll: () => void
  onOpenContext: () => void
}

export default function Sidebar({
  open,
  projects,
  loading,
  selectedProject,
  candidateName,
  candidateTitle,
  contextCount,
  onClose,
  onNewConversation,
  onProjectSelect,
  onSelectAll,
  onOpenContext,
}: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('zh-CN')
    if (!term) return projects

    return projects.filter((project) =>
      [project.name, project.description, project.language, ...project.topics]
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(term),
    )
  }, [projects, query])

  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="项目导航">
      <div className="sidebar-brand-row">
        <div className="brand-button" title="当前工作区">
          <span>Interview Agent</span>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-brand-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={searchOpen ? '关闭搜索' : '搜索项目'}
            title={searchOpen ? '关闭搜索' : '搜索项目'}
            onClick={() => {
              setSearchOpen((value) => !value)
              if (searchOpen) setQuery('')
            }}
          >
            {searchOpen ? <X size={17} /> : <Search size={17} />}
          </button>
          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="关闭项目栏"
            title="关闭项目栏"
            onClick={onClose}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="sidebar-search-wrap">
          <Search size={15} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目"
            aria-label="搜索项目"
          />
        </div>
      )}

      <nav className="sidebar-nav" aria-label="快捷操作">
        <button type="button" className="sidebar-nav-item" onClick={onNewConversation}>
          <SquarePen size={17} />
          <span>新建面试</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-item ${selectedProject === undefined ? 'active' : ''}`}
          onClick={onSelectAll}
        >
          <FolderKanban size={17} />
          <span>全部项目</span>
          <span className="nav-count">{projects.length}</span>
        </button>
        <button type="button" className="sidebar-nav-item" onClick={onOpenContext}>
          <Database size={17} />
          <span>检索上下文</span>
          <span className="nav-count">{contextCount}</span>
        </button>
      </nav>

      <section className="project-section" aria-labelledby="project-heading">
        <div className="section-label" id="project-heading">
          最近项目
        </div>
        <ProjectList
          projects={filteredProjects}
          loading={loading}
          selectedName={selectedProject}
          onSelect={onProjectSelect}
          emptyLabel={query ? '没有匹配的项目' : undefined}
        />
      </section>

      <footer className="sidebar-footer">
        <div className="candidate-avatar" aria-hidden="true">
          {candidateName.charAt(0)}
        </div>
        <div className="candidate-meta">
          <strong>{candidateName}</strong>
          <span>{candidateTitle}</span>
        </div>
        <CircleCheck size={17} className="online-icon" aria-label="服务就绪" />
      </footer>
    </aside>
  )
}
