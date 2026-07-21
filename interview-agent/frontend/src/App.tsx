import { useCallback, useState } from 'react'
import ChatArea from './components/ChatArea'
import ContextPanel from './components/ContextPanel'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import config from './config'
import { useChat } from './hooks/useChat'
import { useProjects } from './hooks/useProjects'
import type { Project } from './types'

export default function App() {
  const { messages, isStreaming, error, send, clear, retry } = useChat()
  const { projects, loading: projectsLoading } = useProjects()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string>()

  const latestContext = messages.at(-1)?.context ?? []

  const handleProjectSelect = useCallback((project: Project) => {
    setSelectedProject(project.name)
    setSidebarOpen(false)
  }, [])

  const handleNewConversation = useCallback(() => {
    clear()
    setContextOpen(false)
    setSidebarOpen(false)
  }, [clear])

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="关闭项目栏"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        projects={projects}
        loading={projectsLoading}
        selectedProject={selectedProject}
        candidateName={config.ui.candidate_name}
        candidateTitle={config.ui.candidate_title}
        contextCount={latestContext.length}
        onClose={() => setSidebarOpen(false)}
        onNewConversation={handleNewConversation}
        onProjectSelect={handleProjectSelect}
        onSelectAll={() => {
          setSelectedProject(undefined)
          setSidebarOpen(false)
        }}
        onOpenContext={() => {
          setContextOpen(true)
          setSidebarOpen(false)
        }}
      />

      <main className="workspace">
        <Header
          title={selectedProject ?? '全部项目'}
          contextCount={latestContext.length}
          contextOpen={contextOpen}
          onOpenMenu={() => setSidebarOpen(true)}
          onToggleContext={() => setContextOpen((open) => !open)}
          onClear={handleNewConversation}
        />

        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onSend={(question) => send(question, selectedProject)}
          onRetry={retry}
          error={error}
          candidateName={config.ui.candidate_name}
          selectedProject={selectedProject}
          onClearProject={() => setSelectedProject(undefined)}
          onOpenProjects={() => setSidebarOpen(true)}
        />

        <ContextPanel
          chunks={latestContext}
          isOpen={contextOpen}
          onToggle={() => setContextOpen(false)}
        />
      </main>
    </div>
  )
}
