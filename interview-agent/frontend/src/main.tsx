/**
 * 应用入口 — React 18 根组件挂载
 * 使用 StrictMode 严格模式 + Tailwind CSS 4 全局样式
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
