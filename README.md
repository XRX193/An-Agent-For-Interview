# Interview Agent

> 🤖 基于 GitHub 开源项目的 AI 面试助手 —— 面试时自动生成专业、诚实的回答

[![Deploy Frontend](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-frontend.yml)
[![Deploy Worker](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-worker.yml/badge.svg)](https://github.com/XRX193/An-Agent-For-Interview/actions/workflows/deploy-worker.yml)

## 这是什么？

面试 Agent 是一个 AI 驱动的技术面试辅助工具。它会自动索引你在 GitHub 上的所有公开项目，面试时面试官可以通过网页界面直接提问，Agent 基于你的实际项目代码——而非通用模板——生成专业的回答，并引用具体的文件路径和代码行作为佐证。

```
面试官："你在 xx 项目中用了什么设计模式？为什么？"
             │
             ▼
   Agent 检索你的 GitHub 代码 → 找到具体实现 → 引用文件路径和代码
             │
             ▼
   回答："在 my-project/src/repositories/UserRepo.cs:42
         使用了 Repository 模式，配合依赖注入实现数据访问层解耦..."
```

## 快速开始

### 前置条件

- [GitHub 账号](https://github.com)（至少有几个公开仓库）
- [Cloudflare 账号](https://dash.cloudflare.com)（免费）
- [Supabase 账号](https://supabase.com)（免费，用于向量存储）
- [DeepSeek API Key](https://platform.deepseek.com)（用于 AI 对话，💰 极低成本）
- [OpenAI API Key](https://platform.openai.com)（可选，用于 Embedding 向量检索；无则使用关键词检索）

### 1. Fork 仓库

点击右上角 **Fork** → 创建你自己的副本。

### 2. 修改配置

编辑 `interview-agent/config.json`，将 `github_username` 改为你的 GitHub 用户名：

```json
{
  "github_username": "YOUR_GITHUB_USERNAME",
  "ui": {
    "candidate_name": "你的名字",
    "candidate_title": "你的职位"
  }
}
```

### 3. 配置外部服务

#### Supabase（向量数据库）

1. 在 [supabase.com](https://supabase.com) 创建免费项目
2. 在 SQL Editor 中执行建表语句（见 `interview-agent/indexer/upsert.py` 中的 `init_supabase_tables` SQL）
3. 获取项目 URL 和 `anon` key（Settings → API）

#### Cloudflare Workers

1. 在 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → 创建 API Token
2. 获取 Account ID

### 4. 设置 GitHub Secrets

在仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 |
|:-------|:-----|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（⚠️ 必需） |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | Supabase 匿名密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥（可选，无则用关键词检索） |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `GITHUB_TOKEN` | GitHub PAT（可选，提高 API 限额） |

### 5. 首次索引

```bash
# 手动触发 GitHub Action
gh workflow run index-repos.yml -f mode=full

# 或本地运行
cd interview-agent/indexer
pip install -r requirements.txt
python run.py --full
```

### 6. 部署

推送代码到 `main` 分支，GitHub Actions 会自动部署前端到 GitHub Pages，Worker 到 Cloudflare。

```bash
git push origin main
```

### 7. 验证

打开 `https://{你的用户名}.github.io/An-Agent-For-Interview`，尝试发送一个测试问题。详细验证步骤见 [frontend/README.md](interview-agent/frontend/README.md#验证)。

## 项目结构

```
An-Agent-For-Interview/
├── interview-agent/
│   ├── frontend/            # React 19 + TypeScript 前端（部署到 GitHub Pages）
│   │   └── src/
│   │       ├── components/      # UI 组件
│   │       ├── hooks/           # React Hooks（useChat, useProjects）
│   │       ├── lib/             # API 客户端、SSE 解析器
│   │       └── types/           # TypeScript 类型定义
│   │
│   ├── worker/              # Cloudflare Worker（API 后端）
│   │   └── src/
│   │       ├── index.ts         # 路由分发（Hono 框架）
│   │       ├── chat.ts          # 核心对话 + SSE 流处理
│   │       ├── prompt.ts        # System Prompt 动态组装
│   │       ├── retrieve.ts      # 向量检索 + 重排序
│   │       ├── embed.ts         # Embedding API 封装
│   │       ├── guardrails.ts    # 速率限制 + 话题校验
│   │       └── db.ts            # Supabase 客户端
│   │
│   ├── indexer/             # Python 仓库索引脚本
│   │   ├── run.py               # 入口
│   │   ├── cloner.py            # Git clone/fetch
│   │   ├── chunker.py           # 代码分块
│   │   ├── embedder.py          # 批量 Embedding
│   │   ├── upsert.py            # 向量数据库写入
│   │   └── filters.py           # 文件过滤
│   │
│   ├── config.json          # 用户配置
│   └── search_index.json    # 搜索索引
│
├── .github/workflows/       # CI/CD
│   ├── deploy-frontend.yml
│   ├── deploy-worker.yml
│   └── index-repos.yml
│
├── LICENSE                  # MIT
└── README.md                # 本文件
```

## 成本

| 服务 | 月费 |
|:-----|:----:|
| GitHub Pages（前端托管） | $0 |
| Cloudflare Workers（API） | $0（10万请求/天） |
| Supabase（向量数据库） | $0（500MB） |
| DeepSeek API（~10次面试/月） | ~$0.10-0.30 |
| Embedding API（可选，首次索引+增量） | ~$0.10 |
| **合计** | **~$0-0.50/月** |

## 技术栈

| 层 | 技术 |
|:---|:-----|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| 后端 | Cloudflare Workers + Hono |
| AI 对话 | DeepSeek Chat（deepseek-chat） |
| 向量数据库 | Supabase pgvector |
| Embedding | text-embedding-3-small |
| CI/CD | GitHub Actions |
| 索引 | Python + GitHub API |

## 常见问题

**Q: 需要面试官安装什么吗？**
不需要，面试官只需要浏览器打开网页即可。

**Q: Agent 回答准确吗？**
回答严格基于你 GitHub 上的实际代码，引用具体文件路径作为佐证。但偶尔 LLM 可能产生幻觉——请核实关键信息。

**Q: 能私有部署吗？**
可以。本项目所有组件都可自托管。详见部署架构。

**Q: 如何确保安全？**
- 只索引公开仓库
- 速率限制防止滥用
- System Prompt 防护防止越狱
- CORS 白名单

## License

MIT © [XRX193](https://github.com/XRX193)
