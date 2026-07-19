/**
 * 项目列表 — 侧边栏已索引项目展示
 *
 * 显示项目名、描述、语言色点、Star 数、技术栈标签
 * 支持选中高亮（蓝色左边框），用于 @项目名 限定检索
 */
import type { Project } from '../types'

interface ProjectListProps {
  projects: Project[]
  loading: boolean
  onSelect?: (project: Project) => void
  selectedName?: string
}

export default function ProjectList({ projects, loading, onSelect, selectedName }: ProjectListProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
        暂无已索引的项目
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {projects.map((project) => (
        <ProjectCard
          key={project.name}
          project={project}
          isSelected={project.name === selectedName}
          onClick={() => onSelect?.(project)}
        />
      ))}
    </div>
  )
}

// ---------- ProjectCard ----------

interface ProjectCardProps {
  project: Project
  isSelected?: boolean
  onClick?: () => void
}

function ProjectCard({ project, isSelected, onClick }: ProjectCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* 语言色点 */}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: langColor(project.language) }}
        />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {project.name}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto shrink-0">
          ⭐ {project.stars}
        </span>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5">
        {project.description || '暂无描述'}
      </p>

      {project.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.topics.slice(0, 4).map((topic) => (
            <span
              key={topic}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              {topic}
            </span>
          ))}
          {project.topics.length > 4 && (
            <span className="text-[10px] text-gray-400">+{project.topics.length - 4}</span>
          )}
        </div>
      )}
    </button>
  )
}

/** 简单语言色码映射 */
function langColor(lang: string): string {
  const map: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f7df1e',
    Python: '#3776ab',
    Java: '#b07219',
    'C#': '#178600',
    Go: '#00add8',
    Rust: '#dea584',
    Vue: '#42b883',
    CSS: '#563d7c',
    HTML: '#e34c26',
  }
  return map[lang] ?? '#8b8b8b'
}
