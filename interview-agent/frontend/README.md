# 技术面试助手 · 前端

> 🤖 面试 Agent 的前端界面 —— 基于 React 19 + TypeScript + Vite + Tailwind CSS 4

## 功能概述

| 模块 | 功能 |
|:-----|:-----|
| **对话区** | SSE 流式接收 AI 回答，Markdown 渲染（含 GFM 表格）、代码语法高亮 |
| **项目侧边栏** | 展示已索引的 GitHub 项目，支持点击选中 `@项目名` 限定检索范围 |
| **检索上下文面板** | 浮动展示每个回答引用到的代码片段及相关性分数 |
| **文件引用** | 回答中的代码引用自动生成 GitHub 直达链接 |
| **流式打字指示器** | 生成过程中显示跳动圆点 + 闪烁光标 |

## 技术栈

- **框架**: React 19 + TypeScript 6
- **构建**: Vite 8
- **样式**: Tailwind CSS 4
- **Markdown**: react-markdown + remark-gfm
- **代码高亮**: Prism.js
- **API 通信**: Fetch API + SSE（Server-Sent Events）

## 项目结构

```
frontend/
├── src/
│   ├── components/        # UI 组件
│   │   ├── Header.tsx         # 顶部导航栏（候选人信息、清空对话）
│   │   ├── ChatArea.tsx       # 对话区容器（消息列表 + 输入栏）
│   │   ├── MessageList.tsx    # 消息列表（空状态引导 + 历史消息）
│   │   ├── MessageBubble.tsx  # 消息气泡（Markdown 渲染 + 文件引用）
│   │   ├── InputBar.tsx       # 输入栏（Enter 发送 / Shift+Enter 换行）
│   │   ├── ProjectList.tsx    # 项目列表侧边栏（搜索、选择）
│   │   ├── ContextPanel.tsx   # 检索上下文浮动面板
│   │   ├── CodeBlock.tsx      # 代码块（Prism.js 高亮 + 一键复制）
│   │   ├── FileReference.tsx  # 文件引用标签（GitHub 链接）
│   │   └── TypingIndicator.tsx # 打字指示器动画
│   ├── hooks/
│   │   ├── useChat.ts         # 对话状态管理 + SSE 流处理
│   │   └── useProjects.ts     # 项目列表获取 + 搜索
│   ├── lib/
│   │   ├── api.ts             # API 客户端（HTTP 请求封装）
│   │   └── streamParser.ts    # SSE 流解析器（AsyncGenerator）
│   ├── types/
│   │   └── index.ts           # TypeScript 全局类型定义
│   ├── styles/
│   │   └── globals.css        # Tailwind CSS 4 全局样式 + 动画
│   ├── App.tsx                # 根组件（布局编排）
│   └── main.tsx               # 应用入口
├── public/
│   └── favicon.svg            # 站点图标
├── index.html                 # HTML 模板
├── vite.config.ts             # Vite 构建配置
├── tsconfig.json              # TypeScript 项目引用
└── package.json               # 依赖与脚本
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 代码检查
npm run lint
```

## 环境变量

| 变量 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `VITE_API_BASE` | 后端 API 基地址 | `/api`（开发代理） |
| `VITE_BASE` | 部署路径前缀 | `/`（GitHub Pages 设为 `/interview-agent/`） |

## 部署

通过 GitHub Actions 自动构建并部署到 GitHub Pages，详见 [deploy-frontend.yml](../.github/workflows/deploy-frontend.yml)。
