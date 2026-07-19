import { useCallback, useState } from 'react'
import Header from './components/Header'
import ChatArea from './components/ChatArea'
import ProjectList from './components/ProjectList'
import ContextPanel from './components/ContextPanel'
import { useChat } from './hooks/useChat'
import { useProjects } from './hooks/useProjects'
import type { Project } from './types'

export default function App() {
  const { messages, isStreaming, error, send, clear, retry } = useChat()
  const { projects, loading: projectsLoading } = useProjects()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>()

  // 选中项目后自动添加 @ 限定
  const handleProjectSelect = useCallback(
    (project: Project) => {
      setSelectedProject(project.name)
      setSidebarOpen(false)
    },
    [],
  )

  return (
    <div className="flex h-screen w-full bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* -------- 左侧项目侧边栏 -------- */}
      {sidebarOpen && (
        <aside className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold">已索引项目</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ProjectList
              projects={projects}
              loading={projectsLoading}
              selectedName={selectedProject}
              onSelect={handleProjectSelect}
            />
          </div>
        </aside>
      )}

      {/* -------- 主区域 -------- */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <Header
          candidateName="向荣鑫"
          onClear={clear}
        />

        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onSend={send}
          onRetry={retry}
          error={error}
        >
          {/* 工具栏 */}
          <div className="flex items-center gap-2 px-4 py-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                sidebarOpen
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              项目列表
            </button>
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                contextOpen
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              检索上下文
            </button>
            {selectedProject && (
              <span className="ml-auto text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                @{selectedProject}
              </span>
            )}
          </div>
        </ChatArea>

        {/* 上下文面板（浮动） */}
        <ContextPanel
          chunks={
            messages.length > 0 && messages[messages.length - 1]?.context
              ? messages[messages.length - 1].context!
              : []
          }
          isOpen={contextOpen}
          onToggle={() => setContextOpen(!contextOpen)}
        />
      </main>
    </div>
  )
}
