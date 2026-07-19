/**
 * System Prompt 动态组装器
 *
 * 这是整个系统最关键的部分——决定了 Agent 的回答质量和行为边界。
 */
import type { Chunk, Project } from './types'

/** 候选人信息（从 config.json 或环境变量读取） */
export interface CandidateProfile {
  name: string
  title: string
  githubUsername: string
  language: string
}

/**
 * 组装完整的 System Prompt
 */
export function buildSystemPrompt(
  profile: CandidateProfile,
  projects: Project[],
  retrievedDocs: Chunk[],
  conversationHistory: Array<{ role: string; content: string }>,
): string {
  const projectSummary = buildProjectSummary(projects)
  const contextSnippets = buildContextSnippets(retrievedDocs)
  const historyText = buildHistoryText(conversationHistory)

  return `你是一位技术面试助手，代表候选人 ${profile.name}（${profile.title}）回答面试官关于其 GitHub 项目的问题。

## 你的知识来源
你只能基于以下提供的项目代码和文档来回答问题。如果问题超出这些项目的范围，诚实地说明你无法回答，不要编造任何信息。

## 行为准则
1. **诚实**：不知道就说不知道，不夸大不虚构
2. **具体**：引用具体的仓库名、文件路径、代码行作为依据
3. **专业**：用技术面试的正式语言，但保持自然流畅
4. **简洁**：先给结论（1-2句），再展开细节
5. **关联**：将技术选择与项目需求关联，解释「为什么这样做」
6. **辅助而非替代**：提供技术事实和代码引用，让候选人用自己的语言表达
7. **特别重要**：引用文件时，必须使用格式 \`[仓库名/文件路径:行号]\`，例如 \`[my-project/src/app.ts:42]\`。这些路径必须来自下面"相关代码片段"中实际提供的文件路径，不要虚构任何不存在的路径。

## 回答格式
- 涉及代码时，使用代码块并标注文件路径：\`[repo/src/File.cs:42]\`
- 说明技术选型时，简要对比其他可选项
- 被问到挑战/困难时，诚实描述问题和解决过程
- 文件路径格式：\`[仓库名/文件路径:行号]\`，方便前端渲染为可点击链接

## 候选人的项目概览
${projectSummary}

## 相关代码片段
${contextSnippets}

## 对话历史
${historyText}

## 面试官的问题
请回答以下问题，严格基于上面提供的项目信息。`.trim()
}

/** 构建项目摘要 */
function buildProjectSummary(projects: Project[]): string {
  if (projects.length === 0) {
    return '（暂无已索引的项目信息）'
  }

  return projects
    .map(
      (p) =>
        `- **${p.name}**（${p.language}，⭐ ${p.stars}）：${p.description || '暂无描述'}。` +
        `技术栈标签：${p.topics.length > 0 ? p.topics.join('、') : '未标注'}`,
    )
    .join('\n')
}

/** 构建检索到的代码片段上下文 */
function buildContextSnippets(chunks: Chunk[]): string {
  if (chunks.length === 0) {
    return '（本次未检索到特定的相关代码片段，请基于项目概览回答）'
  }

  return chunks
    .map((c, i) => {
      const levelLabel =
        { project: '项目级', architecture: '架构级', code: '代码级', history: '历史级' }[c.level] ?? c.level
      return `### 片段 ${i + 1}（${levelLabel}，来源：${c.repo}/${c.path}）\n\`\`\`\n${c.content}\n\`\`\``
    })
    .join('\n\n')
}

/** 构建对话历史 */
function buildHistoryText(history: Array<{ role: string; content: string }>): string {
  if (history.length === 0) return '（这是对话的开始）'

  return history
    .map((m) => `**${m.role === 'user' ? '面试官' : 'Agent'}**：${m.content}`)
    .join('\n\n')
}

/**
 * 从回答中提取文件引用
 */
export function extractFileRefs(answer: string, chunks: Chunk[]): { answer: string; fileRefs: Array<{ repo: string; path: string; line?: number; url: string }> } {
  const fileRefs: Array<{ repo: string; path: string; line?: number; url: string }> = []

  // 匹配 [repo/path:line] 格式
  const refRegex = /\[([a-zA-Z0-9._-]+\/[^\]:]+?)(?::(\d+))?\]/g

  let match: RegExpExecArray | null
  while ((match = refRegex.exec(answer)) !== null) {
    const fullPath = match[1]
    const line = match[2] ? parseInt(match[2]) : undefined
    const repo = fullPath.split('/')[0]

    // 验证路径是否来自检索到的文档
    const isValid = chunks.some((c) => c.repo === repo && c.path.includes(fullPath.split('/').slice(1).join('/')))

    if (isValid || chunks.length === 0) {
      fileRefs.push({
        repo,
        path: fullPath,
        line,
        url: `https://github.com/${fullPath}${line ? `#L${line}` : ''}`,
      })
    }
  }

  return { answer, fileRefs }
}
