/**
 * 顶部导航栏 — 显示候选人信息、索引状态、清空对话按钮
 */
interface HeaderProps {
  candidateName?: string
  lastIndexedAt?: string
  onClear?: () => void
}

export default function Header({ candidateName = '候选人', lastIndexedAt, onClear }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
          {candidateName.charAt(0)}
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            技术面试助手
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {candidateName} 的项目智能体
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
        {lastIndexedAt && (
          <span>
            索引更新：{new Date(lastIndexedAt).toLocaleDateString('zh-CN')}
          </span>
        )}
        {onClear && (
          <button
            onClick={onClear}
            className="px-2 py-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            清空对话
          </button>
        )}
      </div>
    </header>
  )
}
