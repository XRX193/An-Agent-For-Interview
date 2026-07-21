import { Folder } from 'lucide-react'
import type { Project } from '../types'

interface ProjectListProps {
  projects: Project[]
  loading: boolean
  onSelect?: (project: Project) => void
  selectedName?: string
  emptyLabel?: string
}

export default function ProjectList({
  projects,
  loading,
  onSelect,
  selectedName,
  emptyLabel = '暂无已索引项目',
}: ProjectListProps) {
  if (loading) {
    return (
      <div className="project-skeletons" aria-label="正在加载项目">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="project-skeleton" />
        ))}
      </div>
    )
  }

  if (projects.length === 0) {
    return <p className="project-empty">{emptyLabel}</p>
  }

  return (
    <div className="project-list">
      {projects.map((project) => (
        <button
          type="button"
          key={project.name}
          onClick={() => onSelect?.(project)}
          className={`project-item ${project.name === selectedName ? 'active' : ''}`}
          title={project.description || project.name}
        >
          <Folder size={16} />
          <span className="project-name">{project.name}</span>
          <span
            className="language-swatch"
            style={{ backgroundColor: langColor(project.language) }}
            title={project.language || '未知语言'}
          />
        </button>
      ))}
    </div>
  )
}

function langColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#5f8fc9',
    JavaScript: '#d5bc55',
    Python: '#75a780',
    Java: '#c88765',
    'C#': '#8e77b7',
    Go: '#5babb8',
    Rust: '#b68d6e',
    Vue: '#61a986',
    CSS: '#8d75ba',
    HTML: '#c9775f',
  }

  return colors[lang] ?? '#777a7d'
}
