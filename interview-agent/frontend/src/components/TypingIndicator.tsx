/**
 * 打字指示器 — AI 生成回答时的加载动画
 * 三个跳动圆点 + 提示文字"正在检索项目并生成回答..."
 */
export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
        <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
        <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500">正在检索项目并生成回答...</span>
    </div>
  )
}
