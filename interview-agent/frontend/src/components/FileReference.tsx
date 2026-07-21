import { ExternalLink, FileCode2 } from 'lucide-react'
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
      className="file-reference"
      title={`${file.repo}/${file.path}${file.line ? `:${file.line}` : ''}`}
    >
      <FileCode2 size={14} />
      <span>{file.repo}/{fileName}</span>
      {file.line && <small>:{file.line}</small>}
      <ExternalLink size={12} />
    </a>
  )
}
