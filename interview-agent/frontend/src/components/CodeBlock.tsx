/**
 * 代码块 — Prism.js 语法高亮 + 一键复制 + GitHub 文件链接
 * 支持 JS/TS/Python/Java/C#/JSON/Bash/SQL 高亮
 */
import { useEffect, useRef, useState } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism-tomorrow.css'
import type { FileRef } from '../types'

interface CodeBlockProps {
  language: string
  code: string
  fileRef?: FileRef
}

export default function CodeBlock({ language, code, fileRef }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [code])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* 代码块头部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-gray-500 dark:text-gray-400 uppercase">
            {language}
          </span>
          {fileRef && (
            <a
              href={fileRef.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 dark:text-blue-400 hover:underline truncate max-w-[200px]"
            >
              {fileRef.path}
              {fileRef.line ? `:${fileRef.line}` : ''}
            </a>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {copied ? '已复制 ✓' : '复制'}
        </button>
      </div>

      {/* 代码内容 */}
      <pre className="!m-0 !rounded-none overflow-x-auto text-sm leading-relaxed">
        <code ref={codeRef} className={`language-${language}`}>
          {code}
        </code>
      </pre>
    </div>
  )
}
