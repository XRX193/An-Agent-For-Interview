import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../types'
import { fetchProjects } from '../lib/api'

/**
 * 项目列表 Hook
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** 按名称搜索项目 */
  const search = useCallback(
    (query: string) => {
      if (!query.trim()) return projects
      const q = query.toLowerCase()
      return projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.topics.some((t) => t.toLowerCase().includes(q)),
      )
    },
    [projects],
  )

  return { projects, loading, error, reload: load, search }
}
