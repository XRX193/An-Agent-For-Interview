/**
 * Vite 构建配置
 * - @vitejs/plugin-react: React 19 JSX 编译
 * - @tailwindcss/vite: Tailwind CSS 4 构建
 * - base: 由 VITE_BASE 环境变量控制（GitHub Pages 部署时设为 /interview-agent/）
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? '/',
})
