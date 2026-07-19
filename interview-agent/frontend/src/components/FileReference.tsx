/**
 * 文件引用标签 — 圆角药丸样式链接到 GitHub 源文件
 * 显示仓库名/文件名:行号，点击新窗口打开
 */
import type { FileRef } from '../types'

interface FileReferenceProps {
  file: FileRef
}

export default function FileReference({ file }: FileReferenceProps) {
  const fileName = file.path.split('/').pop() ?? file.path

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
      title={`${file.repo}/${file.path}${file.line ? `:${file.line}` : ''}`}
    >
      {/* 文件图标 */}
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>

      <span className="font-medium">{file.repo}/{fileName}</span>

      {file.line && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          :{file.line}
        </span>
      )}

      {/* 外链图标 */}
      <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  )
}
