# Interview Agent

> 基于 GitHub 公开项目的 AI 技术面试助手。面试官直接提问，Agent 检索候选人的真实代码并生成带文件与行号引用的回答。

[![Version](https://img.shields.io/badge/version-v1.3-2563eb)](https://github.com/XRX193/An-Agent-For-Interview/releases/tag/v1.3)
[![Deploy Frontend](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-frontend.yml)
[![Deploy Worker](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-worker.yml/badge.svg)](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-worker.yml)
[![Index Repositories](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/index-repos.yml/badge.svg)](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/index-repos.yml)

## 项目概览

Interview Agent 面向技术面试场景，将候选人的 GitHub 公开仓库构建为轻量 JSON 索引。前端通过 Cloudflare Worker 发起检索和 DeepSeek 对话，回答中引用的仓库、路径和行号会经过后端校验。

```text
GitHub 公开仓库
      |
      v
Python 索引器 -> search_index.json
      |
      v
Cloudflare Worker -> 关键词检索 -> Prompt 组装 -> DeepSeek SSE
      |
      v
React 前端 -> 流式回答、代码高亮、项目筛选、检索上下文
```

核心特点：

- 回答基于真实项目内容，不依赖通用面试模板。
- 支持按项目限定检索范围。
- 使用 SSE 流式输出，并展示实际使用的检索片段。
- 文件引用必须匹配已检索路径和行号范围。
- 索引文件可随仓库更新自动增量重建。
- 前端、Worker 和索引器均由自动化测试与 CI 门禁保护。

## v1.3 更新

v1.3 聚焦正确性、安全性、部署可靠性和维护成本。

| 模块 | 优化内容 | 效果 |
|:-----|:---------|:-----|
| 前端 API | 统一使用 `/api` 前缀，开发环境代理到本地 Worker | 修复生产项目列表与健康检查 404 |
| 项目范围 | 将选中项目作为 `scope` 发送 | 项目筛选真正影响检索结果 |
| SSE | 统一流解析器，支持 CRLF、上下文和错误事件 | 检索面板与错误提示可正常工作 |
| 重试 | 重建正确历史，不再重复用户消息 | 多轮对话历史保持一致 |
| 检索 | 移除未实现的向量分支，改进中英文关键词评分 | 避免配置 Embedding 后返回空结果 |
| 引用 | 校验仓库、完整路径、分支和行号范围 | GitHub 链接可用，减少虚构引用 |
| Worker 安全 | CORS 白名单、请求大小限制、历史角色校验、移除 debug 路由 | 降低跨域滥用和 Prompt 注入风险 |
| 配置 | 前端、Worker、索引器共同读取 `config.json` | Fork 后不再需要多处修改候选人信息 |
| 索引器 | 修复尾部碎片，增加稳定 ID、元数据和真正的增量模式 | 索引更小、更稳定，检索噪声更低 |
| 凭据 | 公共仓库克隆不再把 Token 写入 Git URL | 避免 Token 出现在错误日志和 Git 配置中 |
| CI/CD | 合并重复工作流，部署前执行测试，使用可复现安装 | 减少工作流漂移和带错部署 |
| 依赖 | 删除未使用的 Supabase、Hono、Embedding 依赖 | 安装更快，供应链面更小 |

v1.3 新增 15 个自动化测试：前端 2 个、Worker 7 个、索引器 6 个。

## 技术栈

| 层 | 技术 |
|:---|:-----|
| 前端 | React 19、TypeScript、Vite 8、Tailwind CSS 4 |
| API | Cloudflare Workers、原生 Fetch/Streams API |
| AI | DeepSeek Chat |
| 检索 | 本地 JSON 索引、中英文关键词评分 |
| 索引 | Python 3.13 标准库、GitHub API、Git |
| 部署 | GitHub Actions、GitHub Pages、Cloudflare Workers |

## 项目结构

```text
An-Agent-For-Interview/
|-- .github/workflows/
|   |-- deploy-frontend.yml
|   |-- deploy-worker.yml
|   `-- index-repos.yml
|-- interview-agent/
|   |-- config.json
|   |-- search_index.json
|   |-- frontend/
|   |   |-- src/components/
|   |   |-- src/hooks/
|   |   |-- src/lib/
|   |   `-- test/
|   |-- worker/
|   |   |-- src/
|   |   `-- test/
|   `-- indexer/
|       |-- run.py
|       |-- chunker.py
|       |-- cloner.py
|       |-- filters.py
|       |-- upsert.py
|       `-- tests/
|-- LICENSE
`-- README.md
```

## 快速开始

### 1. 准备服务

- GitHub 账号及公开仓库
- Cloudflare 账号
- DeepSeek API Key
- Node.js 22+
- Python 3.13+（仅本地运行索引器时需要）

项目不再依赖 Supabase 或 OpenAI Embedding。

### 2. Fork 并配置

编辑 `interview-agent/config.json`：

```json
{
  "github_username": "YOUR_GITHUB_USERNAME",
  "index_storage": {
    "repository_owner": "YOUR_FORK_OWNER",
    "repository_name": "An-Agent-For-Interview",
    "branch": "main"
  },
  "ui": {
    "candidate_name": "你的名字",
    "candidate_title": "你的职位"
  },
  "security": {
    "allowed_origins": [
      "https://YOUR_FORK_OWNER.github.io",
      "http://localhost:5173"
    ]
  }
}
```

`github_username` 是被索引的候选人账号；`index_storage.repository_owner` 是存放 `search_index.json` 的 Fork 所有者，两者可以不同。

### 3. 配置 GitHub Actions

在仓库 Settings -> Secrets and variables -> Actions 中添加：

Secrets：

| 名称 | 用途 |
|:-----|:-----|
| `DEEPSEEK_API_KEY` | Worker 调用 DeepSeek |
| `CLOUDFLARE_API_TOKEN` | 部署 Worker |
| `CLOUDFLARE_ACCOUNT_ID` | 指定 Cloudflare 账号 |

Variables：

| 名称 | 用途 | 示例 |
|:-----|:-----|:-----|
| `VITE_API_BASE` | 前端访问 Worker 的 API 基地址，必须包含 `/api` | `https://interview-agent-api.example.workers.dev/api` |

GitHub Actions 自带的 `GITHUB_TOKEN` 用于更新索引，无需手动创建 PAT。

### 4. 首次部署

1. 手动运行 `Deploy Worker to Cloudflare` 工作流。
2. 从 Cloudflare 获取 Worker 地址，并设置 `VITE_API_BASE`。
3. 手动运行 `Deploy Frontend to GitHub Pages`。
4. 手动运行一次全量索引：

```bash
gh workflow run index-repos.yml -f mode=full
```

之后推送到 `main` 会按变更路径自动部署；索引器每周执行增量更新。

## 本地开发

启动 Worker：

```bash
cd interview-agent/worker
npm ci
npm run dev
```

启动前端：

```bash
cd interview-agent/frontend
npm ci
npm run dev
```

Vite 会将 `/api` 代理到 `http://localhost:8787`。可通过 `VITE_DEV_API_TARGET` 覆盖目标地址。

本地生成索引：

```bash
cd interview-agent/indexer
python run.py --full
```

只检查、不写入：

```bash
python run.py --full --dry-run
```

## API

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/health` | 索引状态、仓库数和文档数 |
| `GET` | `/api/projects` | 已索引项目列表 |
| `POST` | `/api/chat` | 检索项目并以 SSE 返回回答 |

`POST /api/chat` 请求示例：

```json
{
  "question": "这个项目如何处理流式响应？",
  "history": [],
  "scope": "An-Agent-For-Interview"
}
```

## 测试

前端：

```bash
cd interview-agent/frontend
npm run lint
npm test
npm run build
```

Worker：

```bash
cd interview-agent/worker
npm run lint
npm test
npx wrangler deploy --dry-run
```

索引器：

```bash
python -m unittest discover -s interview-agent/indexer/tests -v
```

## 安全边界

- 仅索引配置账号的公开仓库。
- 浏览器请求受 CORS 来源白名单限制。
- 客户端不能注入 `system` 历史消息。
- 问题、请求体和对话历史均有长度限制。
- 检索内容作为不可信数据进入 Prompt，不能覆盖系统规则。
- 文件引用必须对应本次检索结果。

当前内存限流以单个 Worker 实例为范围。面向公开高流量场景时，建议增加 Cloudflare Rate Limiting、Turnstile 或 Durable Objects。

## 成本

| 服务 | 费用 |
|:-----|:-----|
| GitHub Pages | 免费额度内为 $0 |
| GitHub Actions | 公开仓库免费 |
| Cloudflare Workers | 免费额度内为 $0 |
| DeepSeek | 按实际 Token 使用量计费 |
| JSON 索引 | 存储在 GitHub 仓库，无额外数据库费用 |

## 版本

- `v1.3`：修复核心交互与检索链路，重构 JSON 索引、安全边界、配置和 CI/CD。
- `v1.2`：完成 React、Worker 和 Python 索引器的基础项目结构。

## License

MIT Copyright (c) [XRX193](https://github.com/XRX193)
