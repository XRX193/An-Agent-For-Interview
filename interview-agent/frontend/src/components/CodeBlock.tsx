import { Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-typescript'
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
    if (codeRef.current) Prism.highlightElement(codeRef.current)
  }, [code])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <div>
          <span>{language}</span>
          {fileRef && (
            <a href={fileRef.url} target="_blank" rel="noopener noreferrer">
              {fileRef.path}{fileRef.line ? `:${fileRef.line}` : ''}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <button type="button" onClick={handleCopy} aria-label="复制代码" title="复制代码">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      <pre>
        <code ref={codeRef} className={`language-${language}`}>
          {code}
        </code>
      </pre>
    </div>
  )
}
