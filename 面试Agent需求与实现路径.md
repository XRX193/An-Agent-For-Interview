# 面试 Agent —— 需求分析与实现路径

> **项目定位**：在 GitHub 上部署一个 AI Agent，面试时面试官可以直接提问，Agent 基于你在 GitHub 上的开源项目自动生成专业、诚实的回答。
>
> **作者**：向荣鑫 | **日期**：2026-07-17

---

## 目录

1. [项目概述](#1-项目概述)
2. [需求分析](#2-需求分析)
3. [系统架构](#3-系统架构)
4. [技术选型](#4-技术选型)
5. [项目文件结构](#5-项目文件结构)
6. [实现路径（四阶段）](#6-实现路径四阶段)
7. [部署架构](#7-部署架构)
8. [成本估算](#8-成本估算)
9. [System Prompt 设计](#9-system-prompt-设计)
10. [关键风险与对策](#10-关键风险与对策)
11. [验证方案](#11-验证方案)
12. [附录：后续扩展方向](#12-附录后续扩展方向)

---

## 1. 项目概述

### 1.1 核心场景

```
面试官打开网页 → 看到候选人项目总览
     │
     ▼
面试官提问："你在 xx 项目中用了什么技术栈？为什么选择这个架构？"
     │
     ▼
Agent 检索 GitHub 仓库代码 → 结合 Claude API → 生成专业回答
     │
     ▼
回答中引用具体代码、文件路径作为佐证
```

### 1.2 交互方式

- **面试官直接提问**：面试官在 Agent 界面输入问题
- **Agent 自动回答**：基于索引的 GitHub 项目内容，无需候选人干预
- **中文交互**：全中文界面和回答
- **仓库范围**：自动索引用户所有公开仓库

---

## 2. 需求分析

### 2.1 功能需求

| 编号 | 功能 | 描述 | 优先级 |
|:-----|:-----|:-----|:------:|
| **F1** | GitHub 仓库索引 | 自动拉取用户所有公开仓库，提取 README、代码结构、技术栈、commit 历史 | 🔴 P0 |
| **F2** | 智能问答 | 面试官输入问题，Agent 基于索引的项目内容生成回答 | 🔴 P0 |
| **F3** | 代码引用 | 回答中能引用具体仓库、文件路径、代码片段作为佐证 | 🔴 P0 |
| **F4** | 项目导航 | 面试官可浏览候选人的项目列表，点击查看详情 | 🟡 P1 |
| **F5** | 对话历史 | 保持面试过程中的对话上下文，支持多轮深入追问 | 🟡 P1 |
| **F6** | 仓库自动更新 | 当 GitHub 仓库有新的 commit 时，自动增量更新索引 | 🟢 P2 |
| **F7** | 面试报告 | 面试结束后生成对话摘要，记录讨论过的项目和技术点 | 🟢 P2 |
| **F8** | 多语言支持 | 中文为主，可切换到英文 | 🟢 P2 |

### 2.2 非功能需求

| 编号 | 需求 | 描述 |
|:-----|:-----|:-----|
| **NF1** | 响应速度 | 问答响应 < 10 秒（含检索 + LLM 生成） |
| **NF2** | 部署简便 | 一键通过 GitHub Actions 部署，无需自有服务器 |
| **NF3** | 成本可控 | 单次面试成本 < $1（API 调用费用） |
| **NF4** | 界面专业 | 简洁大气的技术面试风格，支持移动端 |
| **NF5** | 安全性 | 只索引公开仓库；Agent prompt 防止越狱/不当回答 |
| **NF6** | 可维护性 | 配置文件驱动，更换 GitHub 用户名即可复用 |

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     GitHub 仓库群                         │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐               │
│  │Repo A│  │Repo B│  │Repo C│  │Repo D│  ...           │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘               │
└─────┼─────────┼─────────┼─────────┼─────────────────────┘
      │         │         │         │
      ▼         ▼         ▼         ▼
┌─────────────────────────────────────────────────────────┐
│               GitHub Actions（索引流水线）                 │
│  • 克隆仓库  • 代码分块  • 生成 Embedding                 │
│  • 存入向量数据库 (Supabase pgvector)                    │
│  • 每周自动更新 / Webhook 触发                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               Cloudflare Workers（API 层）                │
│  POST /api/chat     → 对话接口                           │
│  POST /api/search   → 项目搜索                           │
│  GET  /api/projects → 项目列表                           │
│  流程：检索向量DB → 组装Context → 调用Claude API          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                GitHub Pages（前端）                       │
│  React SPA  •  对话界面  •  项目展示                      │
│  响应式设计  •  中文优化  •  流式渲染                      │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心数据流

```
面试官提问
    │
    ▼
前端发送 POST /api/chat { question, history }
    │
    ▼
Worker 将问题转为向量 → 检索向量DB → 获取 Top-5 相关代码片段
    │
    ▼
组装 System Prompt + 检索到的代码上下文 + 对话历史
    │
    ▼
调用 Claude API (claude-sonnet-5 / claude-haiku-4-5)
    │
    ▼
流式返回回答（SSE）→ 前端逐字渲染（含代码高亮、文件引用链接）
```

### 3.3 RAG 检索策略（多层级索引）

| 层级 | 内容 | 分块策略 | 用途 |
|:-----|:-----|:-----|:-----|
| **L1 项目级** | README、技术栈、项目描述 | 整个文件 | 回答「这个项目是做什么的」 |
| **L2 架构级** | 目录结构、package.json、配置文件 | 按文件 | 回答「用了什么技术/框架」 |
| **L3 代码级** | 核心源文件（排除 node_modules 等） | 按函数/类 (~500-1000 tokens) | 回答「这个功能怎么实现的」 |
| **L4 历史级** | Commit messages、PR 描述 | 按条目 | 回答「开发过程遇到什么挑战」 |

---

## 4. 技术选型

| 层次 | 技术 | 选型理由 |
|:-----|:-----|:-----|
| **前端框架** | React 18 + TypeScript | 生态成熟，GitHub Pages 部署友好 |
| **构建工具** | Vite | 快速构建，静态输出适合 Pages |
| **样式方案** | Tailwind CSS | 快速 UI 开发，内置暗色模式 |
| **代码高亮** | Shiki / Prism.js | 精准语法高亮，支持 C#、Java 等 |
| **Markdown 渲染** | react-markdown + remark-gfm | 渲染 Claude 返回的 Markdown |
| **后端运行时** | Cloudflare Workers | 免费额度充足（10万次/天），全球边缘节点低延迟 |
| **AI 模型（主力）** | Claude Sonnet 5 | 代码理解能力强，中文流畅 |
| **AI 模型（降级）** | Claude Haiku 4.5 | 速度快、成本低，简单问题使用 |
| **向量数据库** | Supabase (pgvector) | 免费 500MB，SQL + 向量混合查询 |
| **Embedding** | text-embedding-3-small 或 voyage-code-2 | 代码语义理解效果好 |
| **CI/CD** | GitHub Actions | 与 GitHub 深度集成，免费使用 |
| **域名** | `{username}.github.io/interview-agent` | GitHub Pages 默认域名，零成本 |

---

## 5. 项目文件结构

```
interview-agent/
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml    # 构建并部署前端到 GitHub Pages
│       ├── deploy-worker.yml      # 部署 Worker 到 Cloudflare
│       └── index-repos.yml        # 定期索引仓库（每周）+ 手动触发
│
├── frontend/                      # React 前端
│   ├── src/
│   │   ├── App.tsx                # 应用入口
│   │   ├── main.tsx               # 渲染入口
│   │   ├── components/
│   │   │   ├── Header.tsx         # 顶部导航栏
│   │   │   ├── ChatArea.tsx       # 对话区域容器
│   │   │   ├── MessageList.tsx    # 消息列表
│   │   │   ├── MessageBubble.tsx  # 消息气泡（含代码块渲染）
│   │   │   ├── CodeBlock.tsx      # 语法高亮代码块
│   │   │   ├── FileReference.tsx  # 可点击的文件引用链接
│   │   │   ├── InputBar.tsx       # 输入框 + 发送按钮
│   │   │   ├── ProjectList.tsx    # 项目侧边栏
│   │   │   ├── ProjectCard.tsx    # 项目卡片
│   │   │   ├── ContextPanel.tsx   # 检索上下文面板（展示用到的文件）
│   │   │   └── TypingIndicator.tsx # 打字中动画
│   │   ├── hooks/
│   │   │   ├── useChat.ts         # 对话逻辑（SSE 流 + 消息状态管理）
│   │   │   └── useProjects.ts     # 项目列表 hook
│   │   ├── lib/
│   │   │   ├── api.ts             # Worker API 调用封装
│   │   │   └── streamParser.ts    # SSE 数据流解析器
│   │   ├── types/
│   │   │   └── index.ts           # Message, Chunk, FileRef 等类型定义
│   │   └── styles/
│   │       └── globals.css        # 全局样式
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── worker/                        # Cloudflare Worker（API 后端）
│   ├── src/
│   │   ├── index.ts               # Worker 入口 + 路由分发
│   │   ├── chat.ts                # POST /api/chat 核心对话逻辑
│   │   ├── embed.ts               # 问题向量化
│   │   ├── retrieve.ts            # 向量检索 + 重排序
│   │   ├── prompt.ts              # System Prompt 动态组装
│   │   ├── guardrails.ts          # 话题校验 + 速率限制
│   │   ├── db.ts                  # Supabase 客户端
│   │   └── types.ts               # 类型定义
│   ├── wrangler.toml              # Cloudflare 部署配置
│   ├── package.json
│   └── tsconfig.json
│
├── indexer/                       # 仓库索引脚本（Python）
│   ├── run.py                     # 索引入口
│   ├── config.py                  # 仓库列表、分块大小等配置
│   ├── cloner.py                  # Git clone/fetch 逻辑
│   ├── chunker.py                 # AST 感知的代码分块器
│   ├── embedder.py                # 批量 Embedding 生成
│   ├── upsert.py                  # 向量数据库写入
│   ├── filters.py                 # 文件过滤（跳过二进制、node_modules 等）
│   └── requirements.txt
│
├── config.json                    # 用户配置文件
├── README.md                      # 项目说明 + 部署指南
├── LICENSE
└── .gitignore
```

### 配置文件 `config.json`

```json
{
  "github_username": "your-github-username",
  "agent_name": "技术面试助手",
  "agent_description": "基于我的 GitHub 开源项目，回答技术面试问题",
  "language": "zh-CN",
  "repos": {
    "mode": "all_public",
    "exclude": ["dotfiles", "tutorial-project"]
  },
  "model": {
    "primary": "claude-sonnet-5",
    "fallback": "claude-haiku-4-5"
  },
  "ui": {
    "primary_color": "#1a1a2e",
    "accent_color": "#0f3460",
    "candidate_name": "向荣鑫",
    "candidate_title": "软件工程师"
  }
}
```

---

## 6. 实现路径（四阶段）

### 🚀 第一阶段：基础搭建（第 1-2 天）

**目标**：跑通最小可行链路（前端 ↔ Worker ↔ Claude API）

| 步骤 | 任务 | 详细说明 |
|:----:|:-----|:-----|
| 1.1 | 创建 GitHub 仓库 | 新建 `interview-agent` 仓库，搭建 monorepo 结构（frontend + worker + indexer） |
| 1.2 | 搭建 Cloudflare Worker | 创建 Worker 项目，配置 `wrangler.toml`，实现 `POST /api/chat` 基础接口 |
| 1.3 | 集成 Claude API | Worker 中集成 Claude API（先不接向量库，手工注入上下文验证链路） |
| 1.4 | 搭建前端骨架 | 使用 Vite + React + Tailwind 创建前端，实现基础 Chat UI（输入框 + 消息列表） |
| 1.5 | 端到端联调 | 前端对接 Worker API，验证完整通信链路 |
| 1.6 | 配置 CI/CD | `deploy-frontend.yml`：构建前端 → 部署到 GitHub Pages；`deploy-worker.yml`：部署 Worker 到 Cloudflare |

**✅ 验证标准**：在 GitHub Pages 上打开页面，发送「你好」，收到 Claude 的回复

---

### 🔧 第二阶段：知识索引（第 3-4 天）

**目标**：Agent 能基于实际项目回答，而非通用回答

| 步骤 | 任务 | 详细说明 |
|:----:|:-----|:-----|
| 2.1 | 创建 Supabase 项目 | 注册 Supabase，启用 pgvector 扩展，创建 `documents` 表 |
| 2.2 | 实现索引脚本 | 通过 GitHub API 拉取所有公开仓库，克隆到本地 |
| 2.3 | 实现代码分块器 | README 整体一块；源文件按函数/类边界切分（~500-1000 tokens/块）；配置文件整体一块 |
| 2.4 | 生成向量并存储 | 调用 Embedding API 生成向量，批量写入 Supabase |
| 2.5 | 实现检索逻辑 | Worker 中实现 `searchRelevantDocs(question)` → 向量检索 → Top-K 文档 |
| 2.6 | 编写 System Prompt | 角色设定、行为准则、回答格式（见第 9 节） |
| 2.7 | 配置定时索引 | `index-repos.yml`：每周自动运行 + 支持手动触发 |

**✅ 验证标准**：问「你有哪些项目？」或「xx 项目用了什么技术？」，Agent 能基于实际代码准确回答

---

### ✨ 第三阶段：体验优化（第 5-6 天）

**目标**：打磨面试场景的完整体验

| 步骤 | 任务 | 详细说明 |
|:----:|:-----|:-----|
| 3.1 | 流式响应（SSE） | Worker 支持 Streaming Response，前端实现打字机效果逐字渲染 |
| 3.2 | 代码高亮与引用 | 代码块使用 Shiki/Prism.js 高亮；文件路径可点击跳转到 GitHub |
| 3.3 | 多轮对话上下文 | 维护最近 10 轮对话历史，支持追问：「刚才说的那个函数能详细讲讲吗？」 |
| 3.4 | 项目侧边栏 | 展示所有已索引仓库，点击预览简介，支持「@项目名」限定问题范围 |
| 3.5 | 移动端适配 | 响应式布局，触摸友好的按钮和输入框 |
| 3.6 | 暗色模式 | 适合面试屏幕共享场景 |

**✅ 验证标准**：完整面试模拟——10 轮对话，回答准确、引用到位、体验流畅

---

### 🔒 第四阶段：生产就绪（第 7 天+）

**目标**：安全加固和持续维护

| 步骤 | 任务 | 详细说明 |
|:----:|:-----|:-----|
| 4.1 | 安全措施 | Rate Limiting（20次/分钟）、System Prompt 注入防护、CORS 白名单、敏感文件过滤 |
| 4.2 | 监控与日志 | Cloudflare Workers Analytics、错误追踪、API 费用监控 |
| 4.3 | 增量索引 | GitHub Webhook 监听 push 事件，只重索引变更文件（基于文件 hash 比对） |
| 4.4 | 面试报告 | 面试结束后导出对话摘要，记录讨论到的项目和关键问题 |
| 4.5 | 自定义域名 | 绑定个人域名如 `interview.yourname.com`，配置 Cloudflare DNS + SSL |

---

## 7. 部署架构

### 7.1 部署拓扑

```
GitHub Repository: yourname/interview-agent
├── main 分支      → 源代码
├── gh-pages 分支  → 前端构建产物（GitHub Actions 自动推送）
│
├── GitHub Actions：
│   ├── 每次 push 到 main → 构建前端 → 部署到 gh-pages
│   ├── 每次 push 到 main → 部署 Worker 到 Cloudflare
│   ├── 每周日 00:00      → 全量索引所有仓库
│   └── Webhook 触发      → 增量索引变更仓库
│
外部服务：
├── Cloudflare Workers  → API 后端（免费额度 10万次/天）
├── Supabase            → 向量数据库（免费 500MB）
└── Anthropic API       → Claude 模型调用
```

### 7.2 部署步骤

```bash
# 第一步：Fork/创建仓库
git clone https://github.com/yourname/interview-agent
cd interview-agent

# 第二步：配置 Supabase
# 在 supabase.com 创建项目 → 获取 URL + anon key
# 在 SQL Editor 中执行：CREATE EXTENSION IF NOT EXISTS vector;

# 第三步：配置 Cloudflare
# 在 dash.cloudflare.com 获取 API Token
# 编辑 worker/wrangler.toml 中的 account_id

# 第四步：设置 GitHub Secrets
# 在仓库 Settings → Secrets and variables → Actions 中添加：
#   SUPABASE_URL, SUPABASE_KEY
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
#   ANTHROPIC_API_KEY

# 第五步：首次索引
cd indexer
pip install -r requirements.txt
python run.py --full

# 第六步：推送代码，触发自动部署
git push origin main

# 第七步：验证
# 打开 https://{username}.github.io/interview-agent
# 发送测试问题
```

---

## 8. 成本估算

### 8.1 月度费用明细

| 项目 | 服务 | 免费额度 | 预估月费 |
|:-----|:-----|:-----|:--------:|
| 前端托管 | GitHub Pages | 无限流量 | **$0** |
| API 后端 | Cloudflare Workers | 10万请求/天 | **$0** |
| 向量数据库 | Supabase | 500MB 存储 | **$0** |
| AI 模型 | Claude Haiku 4.5 | — | ~$2-5 |
| AI 模型 | Claude Sonnet 5 | — | ~$5-15 |
| Embedding | text-embedding-3-small | — | ~$0.10 |
| 域名（可选）| 任意注册商 | — | ~$10/年 |
| **合计** | | | **$0-20/月** |

> **假设**：每月 10 次面试，每次 20 轮对话，Haiku 处理 80% 请求，Sonnet 处理 20% 请求。大部分场景下免费额度完全够用。

### 8.2 单次面试成本

| 模型 | 输入价格 | 输出价格 | 单次面试成本（15问） |
|:-----|:--------|:--------|:--------------------:|
| Claude Haiku 4.5 | $0.80/MTok | $4.00/MTok | ~$0.05 |
| Claude Sonnet 5 | $3.00/MTok | $15.00/MTok | ~$0.15 |
| Claude Opus 4.8 | $15.00/MTok | $75.00/MTok | ~$0.75 |

> **推荐**：面试场景使用 Claude Sonnet 5，技术问答质量最佳。每月 10 次面试也仅需 ~$1.5。

---

## 9. System Prompt 设计

这是整个系统最关键的部分——决定了 Agent 的回答质量和行为边界。

```
你是一位技术面试助手，代表候选人 [候选人姓名] 回答面试官关于其 GitHub
项目的问题。

## 你的知识来源
你只能基于以下提供的项目代码和文档来回答问题。如果问题超出这些项目的
范围，诚实地说明你无法回答，不要编造任何信息。

## 行为准则
1. **诚实**：不知道就说不知道，不夸大不虚构
2. **具体**：引用具体的仓库名、文件路径、代码行作为依据
3. **专业**：用技术面试的正式语言，但保持自然流畅
4. **简洁**：先给结论（1-2句），再展开细节
5. **关联**：将技术选择与项目需求关联，解释「为什么这样做」
6. **辅助而非替代**：提供技术事实和代码引用，让候选人用自己的语言表达

## 回答格式
- 涉及代码时，使用代码块并标注文件路径：[repo/src/File.cs:42]
- 说明技术选型时，简要对比其他可选项
- 被问到挑战/困难时，诚实描述问题和解决过程
- 文件路径格式：`[仓库名/文件路径:行号]`，方便前端渲染为可点击链接

## 候选人的项目概览
{项目索引摘要}

## 相关代码片段
{检索到的 Top-5 代码块}

## 对话历史
{最近 10 轮对话}

## 面试官的问题
{question}
```

---

## 10. 关键风险与对策

| 风险 | 影响 | 概率 | 对策 |
|:-----|:-----|:----:|:-----|
| **GitHub API 限流**（5000次/小时） | 索引中断 | 低 | 使用缓存 + 条件请求（ETag），避免重复拉取 |
| **Claude API 延迟**（>5秒） | 面试等待尴尬 | 中 | 流式响应 + Haiku 自动降级策略 |
| **向量检索不准确** | 回答偏离项目 | 中 | 混合检索（向量 + 关键词 BM25）+ 多层级索引 |
| **大仓库索引超时** | 索引失败 | 低 | GitHub Actions 超时设为 30min，大仓库分批处理 |
| **面试官问非项目问题** | Agent 乱编 | 高 | System Prompt 严格限定知识范围，越界拒绝回答 |
| **Claude 虚构文件路径** | 引用错误 | 中 | Prompt 强调只用提供的上下文；后处理验证路径有效性 |
| **索引过期**（面试前刚更新代码） | 回答不完整 | 低 | 页头显示"最后索引时间"；支持手动触发增量索引 |

---

## 11. 验证方案

### 11.1 端到端验证流程

| 阶段 | 验证内容 | 方法 | 通过标准 |
|:----:|:-----|:-----|:-----|
| 1 | 部署验证 | 推送代码后访问 GitHub Pages URL | 页面正常加载，无报错 |
| 2 | 连通性验证 | 发送「你好」 | 3 秒内收到回复 |
| 3 | 索引验证 | 手动触发 GitHub Action → 检查 Supabase | 文档数量与仓库文件数匹配 |
| 4 | 问答准确性 | 准备 10 个标准面试问题逐一测试 | 回答引用真实文件路径，内容与代码一致 |
| 5 | 引用验证 | 点击回答中的文件链接 | 正确跳转到 GitHub 对应文件和行号 |
| 6 | 多轮对话 | 连续追问 5 轮 | 上下文保持连贯，不丢失话题 |
| 7 | 压力验证 | 连续发送 50 条消息 | 无崩溃、无 OOM、Rate Limiting 正常触发 |
| 8 | 面试模拟 | 邀请朋友扮演面试官，完整模拟一次面试 | 整体流程顺畅，回答专业 |

### 11.2 标准面试问题测试集

| # | 问题 | 期望回答要点 |
|:--:|:-----|:-----|
| 1 | 请介绍一下你的项目经历 | 列出主要仓库，概述每个项目的用途和技术栈 |
| 2 | 你最有挑战的项目是哪个？为什么？ | 引用具体的代码实现和遇到的问题 |
| 3 | 你在项目中用了哪些设计模式？ | 引用代码中的实际模式应用（如 Repository、Factory 等） |
| 4 | 你是怎么做错误处理的？ | 引用具体的 try-catch、中间件、日志代码 |
| 5 | 你的项目是怎么做测试的？ | 引用测试文件和测试框架配置 |
| 6 | 为什么选择 xx 技术而不是 yy？ | 基于项目需求分析技术选型理由 |
| 7 | 某个具体功能是怎么实现的？ | 引用函数级别的代码实现 |
| 8 | 你如何保证代码质量？ | 引用 lint 配置、CI 流程、code review 实践 |
| 9 | 项目中有哪些性能优化？ | 引用缓存、索引、异步处理等实现 |
| 10 | 如果重新做这个项目，你会怎么改进？ | 基于现有代码提出合理的重构方向 |

---

## 12. 附录：后续扩展方向

| 扩展 | 描述 | 难度 | 价值 |
|:-----|:-----|:----:|:----:|
| **语音交互** | 集成 Web Speech API，面试官可语音提问，Agent 语音回答 | ⭐⭐ | 高 |
| **简历集成** | 上传 PDF 简历，Agent 同时基于简历和项目回答，交叉验证 | ⭐⭐ | 高 |
| **实时编码辅助** | 面试官出编程题，Agent 展示候选人的编码风格和思路 | ⭐⭐⭐ | 中 |
| **多候选人支持** | 团队多人共用，每人独立配置文件和索引空间 | ⭐⭐ | 中 |
| **面试表现分析** | AI 分析面试官的问题倾向，给出面试复盘报告 | ⭐⭐ | 中 |
| **浏览器扩展** | Chrome 扩展，在视频面试窗口侧边栏直接使用 | ⭐⭐⭐ | 高 |
| **本地 LLM 降级** | 支持 Ollama/LM Studio，完全离线运行，零 API 成本 | ⭐⭐⭐ | 中 |
| **GitHub OAuth 登录** | 其他人可授权自己的仓库，做成 SaaS 产品 | ⭐⭐⭐⭐ | 高 |

---

## 附录 A：关键文件实现优先级

以下 5 个文件是架构的核心，应最先实现：

| 优先级 | 文件 | 作用 |
|:------:|:-----|:-----|
| 1 | `worker/src/chat.ts` | Worker 核心处理器：编排 Embedding → 检索 → Claude API → SSE 流 |
| 2 | `worker/src/prompt.ts` | System Prompt 组装器：决定回答质量的关键 |
| 3 | `indexer/chunker.py` | 代码分块器：检索质量取决于分块策略 |
| 4 | `frontend/src/hooks/useChat.ts` | 前端 SSE 流处理 + 消息状态管理 |
| 5 | `.github/workflows/index-repos.yml` | 自动化索引流水线 |

---

## 附录 B：面试日操作清单

```
面试前 30 分钟：
□ 打开 https://{username}.github.io/interview-agent
□ 点击「检查状态」→ 确认 Worker 正常、索引新鲜
□ 打开 Context Panel → 确认已索引的仓库列表正确
□ 发送测试问题 → 确认响应速度正常
□ 打开暗色模式（如果需要屏幕共享）

面试中：
□ 面试官提问 → 在 Agent 中输入问题
□ Agent 返回回答 → 快速浏览关键代码引用
□ 用自己的语言口头回答，必要时引用 Agent 提供的具体代码

面试后：
□ 导出对话摘要（面试报告功能）
□ 回顾讨论到的项目和技术点
□ 如有新项目或重大更新，手动触发增量索引
```

---

> **文档版本**：v1.0 | **最后更新**：2026-07-17
>
> 本文档为需求分析与实现路径，详细代码实现请参见 [GitHub 仓库](https://github.com/yourname/interview-agent)
