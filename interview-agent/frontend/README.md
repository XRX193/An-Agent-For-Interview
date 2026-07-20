# 技术面试助手 · 前端

> 🤖 面试 Agent 的前端界面 —— 基于 React 19 + TypeScript + Vite + Tailwind CSS 4

[![Deploy Frontend](https://github.com/RcardoFate/interview-agent/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/RcardoFate/interview-agent/actions/workflows/deploy-frontend.yml)

## 概述

本前端是 [Interview Agent](../README.md) 项目的 Web 界面层，为面试官提供 AI 驱动的技术面试辅助对话体验。Agent 会基于候选人的 GitHub 开源项目代码，生成专业、诚实的回答，并引用具体文件路径和代码行作为佐证。

## 功能

| 模块 | 功能 | 实现方式 |
|:-----|:-----|:---------|
| **对话区** | SSE 流式接收 AI 回答，Markdown 渲染（含 GFM 表格）、代码语法高亮 | react-markdown + remark-gfm + Prism.js |
| **项目侧边栏** | 展示已索引的 GitHub 项目，支持搜索过滤和点击选中 `@项目名` 限定检索范围 | Fetch API + 本地搜索 |
| **检索上下文面板** | 浮动展示每个回答引用到的代码片段及相关性分数，分为 project / architecture / code / history 四个层级 | 侧边浮动面板 |
| **文件引用** | 回答中的代码引用自动生成 GitHub 直达链接，点击跳转到具体行号 | FileReference 组件 |
| **流式打字指示器** | 生成过程中显示跳动圆点 + 闪烁光标动画 | CSS 动画 |
| **消息管理** | 支持清空对话、重试失败消息；自动滚动；历史上下文限制（最近 10 轮） | useChat Hook |
| **错误处理** | 网络错误自动捕获、显示友好错误提示、支持 AbortController 中断 | Fetch signal + error boundary |
| **深色模式** | 自动跟随系统主题，Tailwind CSS 4 dark: 变体 | prefers-color-scheme |

## 技术栈

| 依赖 | 版本 | 用途 |
|:-----|:----:|:-----|
| React | 19 | UI 框架 |
| TypeScript | ~6.0 | 类型安全 |
| Vite | 8 | 构建工具 |
| Tailwind CSS | 4 | 样式框架 |
| react-markdown | 10 | Markdown 渲染 |
| remark-gfm | 4 | GFM 表格/任务列表支持 |
| Prism.js | 1 | 代码语法高亮 |
| oxlint | 1 | 代码检查 |

## 项目结构

```
frontend/
├── src/
│   ├── components/           # UI 组件
│   │   ├── Header.tsx            # 顶部导航栏（候选人信息、清空对话）
│   │   ├── ChatArea.tsx          # 对话区容器（消息列表 + 输入栏）
│   │   ├── MessageList.tsx       # 消息列表（空状态引导 + 历史消息）
│   │   ├── MessageBubble.tsx     # 消息气泡（Markdown 渲染 + 文件引用）
│   │   ├── InputBar.tsx          # 输入栏（Enter 发送 / Shift+Enter 换行）
│   │   ├── ProjectList.tsx       # 项目列表侧边栏（搜索、选择）
│   │   ├── ContextPanel.tsx      # 检索上下文浮动面板（四级分层）
│   │   ├── CodeBlock.tsx         # 代码块（Prism.js 高亮 + 一键复制）
│   │   ├── FileReference.tsx     # 文件引用标签（GitHub 链接 + 行号）
│   │   └── TypingIndicator.tsx   # 打字指示器动画
│   ├── hooks/
│   │   ├── useChat.ts            # 对话状态管理 + SSE 流处理 + 重试
│   │   └── useProjects.ts        # 项目列表获取 + 本地搜索过滤
│   ├── lib/
│   │   ├── api.ts                # API 客户端（HTTP 请求 + SSE 封装）
│   │   └── streamParser.ts       # SSE 流解析器（AsyncGenerator）
│   ├── types/
│   │   └── index.ts              # TypeScript 类型定义（Message、Chunk、Project 等）
│   ├── styles/
│   │   └── globals.css           # Tailwind CSS 4 全局样式 + 自定义动画
│   ├── App.tsx                   # 根组件（三栏布局编排）
│   └── main.tsx                  # 应用入口
├── public/
│   └── favicon.svg               # 站点图标
├── index.html                    # HTML 模板
├── vite.config.ts                # Vite 构建配置（base 路径 + 插件）
├── tsconfig.json                 # TypeScript 项目引用
└── package.json                  # 依赖与脚本
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本（TypeScript 类型检查 + Vite 打包）
npm run build

# 本地预览生产构建
npm run preview

# 代码检查（oxlint）
npm run lint
```

开发时，Vite 会将 `/api` 请求代理到本地后端服务。修改 `vite.config.ts` 中的 proxy 配置以适应你的后端地址：

```ts
// vite.config.ts
export default defineConfig({
  // ...
  server: {
    proxy: {
      '/api': 'http://localhost:8787',  // Cloudflare Worker 本地地址
    },
  },
})
```

## 环境变量

| 变量 | 说明 | 默认值 | 示例 |
|:-----|:-----|:-------|:------|
| `VITE_API_BASE` | 后端 API 基地址 | `/api` | `https://interview-agent.你的账号.workers.dev` |
| `VITE_BASE` | 部署路径前缀 | `/` | `/interview-agent/`（GitHub Pages） |

生产构建时，`VITE_BASE` 会自动设为 `/interview-agent/`（由 GitHub Actions 注入），确保资源路径正确。

## 部署

本前端通过 GitHub Actions 自动构建并部署到 GitHub Pages。详见 [deploy-frontend.yml](../.github/workflows/deploy-frontend.yml)。

部署流程：
1. 推送代码到 `main` 分支
2. GitHub Actions 自动触发构建：`VITE_BASE=/interview-agent/ npm run build`
3. 构建产物 `dist/` 被部署到 `gh-pages` 分支
4. GitHub Pages 从 `gh-pages` 分支提供服务

## 验证

部署完成后，按以下步骤验证前端是否正常运行：

### 1. 检查部署状态

打开 GitHub 仓库的 **Actions** 标签页，确认 `Deploy Frontend` workflow 执行成功（绿色 ✓）。

### 2. 访问页面

打开浏览器访问 `https://{你的GitHub用户名}.github.io/interview-agent/`，确认：

- [ ] 页面正常加载，无白屏/报错
- [ ] 顶部导航栏显示候选人姓名
- [ ] 「项目列表」按钮可切换侧边栏
- [ ] 「检索上下文」按钮可打开浮动面板

### 3. 功能验证

- [ ] **项目列表**：点击「项目列表」→ 侧边栏正常展开 → 显示已索引项目 → 搜索框可过滤
- [ ] **发送消息**：在输入框输入问题 → 按 Enter 发送 → 显示用户消息气泡
- [ ] **流式回答**：发送后出现打字指示器动画 → AI 回答逐步流式显示
- [ ] **Markdown 渲染**：回答中的表格、列表、标题正确渲染
- [ ] **代码高亮**：回答中的代码块正确语法高亮，复制按钮可用
- [ ] **文件引用**：回答中引用的代码文件显示为可点击的 GitHub 链接
- [ ] **检索上下文**：有回答后打开上下文面板 → 显示相关代码片段及分数
- [ ] **@项目限定**：选中侧边栏项目后，输入框上方显示 `@项目名` 标记
- [ ] **清空对话**：点击顶部清空按钮 → 对话历史清除
- [ ] **错误处理**：后端不可用时显示友好错误提示（而非崩溃）

### 4. 开发者工具检查

打开浏览器 DevTools（F12）：

- [ ] **Console** 无红色报错
- [ ] **Network** 标签中 `/api/chat` 请求返回 200，Content-Type 为 `text/event-stream`
- [ ] **Network** 标签中 `/api/projects` 请求返回 200，响应为 JSON 数组

## 常见问题

### 页面空白 / 资源 404

检查 `vite.config.ts` 中的 `base` 配置是否与实际部署路径匹配。GitHub Pages 部署时 `VITE_BASE` 应为 `/interview-agent/`。

### API 请求失败 / CORS 错误

确认后端 Worker 已部署且 CORS 配置正确。检查 `VITE_API_BASE` 环境变量是否指向正确的 Worker 地址。

### 代码高亮不生效

Prism.js 需要手动导入语言包。检查 `CodeBlock.tsx` 中是否已引入对应语言的 Prism 组件。

### 热更新不工作 (dev)

确保 Vite 版本 ≥ 5，React 插件版本匹配。尝试清除 `node_modules/.vite` 缓存后重启。

## 相关文档

- [Interview Agent 主项目](../README.md) — 项目整体介绍与架构
- [部署架构](../README.md#项目结构) — 前后端 + 索引完整架构
- [Worker 后端](../worker/README.md) — API 实现细节
- [索引服务](../indexer/README.md) — 代码索引与向量检索
- [新手操作指南](../傻瓜操作指南.md) — 从零搭建完整项目

## License

MIT © [Rcardo](https://github.com/RcardoFate)
