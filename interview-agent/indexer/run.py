#!/usr/bin/env python3
"""
索引器入口脚本

用法：
  # 全量索引
  python run.py --full

  # 增量索引（检查文件 hash 变化）
  python run.py --incremental

  # 只索引特定仓库
  python run.py --repo my-awesome-project

  # 模拟运行（不写入数据库）
  python run.py --full --dry-run

环境变量（必需）：
  SUPABASE_URL      — Supabase 项目 URL
  SUPABASE_KEY      — Supabase 匿名密钥
  OPENAI_API_KEY    — OpenAI API Key（用于 Embedding）
  GITHUB_TOKEN      — GitHub Personal Access Token（可选，提高 API 限额）

通过 GitHub Actions 运行：
  见 ../.github/workflows/index-repos.yml
"""

import sys
import os

# 确保 indexer 目录在 Python path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import IndexerConfig
from cloner import get_public_repos, clone_or_pull, cleanup_clones
from filters import collect_files
from chunker import chunk_repo_files
from embedder import generate_embeddings
from upsert import init_supabase_tables, upsert_chunks


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="面试 Agent — GitHub 仓库索引器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  python run.py --full          # 全量索引所有公开仓库
  python run.py --incremental   # 增量更新
  python run.py --dry-run       # 模拟运行，不写入
  python run.py --repo my-app   # 只索引特定仓库
        """,
    )
    parser.add_argument("--full", action="store_true", help="全量索引")
    parser.add_argument("--incremental", action="store_true", help="增量索引")
    parser.add_argument("--repo", type=str, help="只索引指定仓库")
    parser.add_argument("--dry-run", action="store_true", help="模拟运行，不实际写入")
    parser.add_argument("--config", type=str, help="JSON 配置文件路径")
    args = parser.parse_args()

    # ---- 加载配置 ----
    config = IndexerConfig.from_env(args.config)
    config.dry_run = args.dry_run

    missing = config.validate()
    if missing:
        print("❌ 配置不完整，缺少以下设置：")
        for m in missing:
            print(f"   - {m}")
        print("\n请设置对应的环境变量后重试。")
        print("示例：export SUPABASE_URL=https://xxx.supabase.co")
        sys.exit(1)

    mode = "full" if args.full else "incremental"

    print("=" * 60)
    print("🚀 面试 Agent — 仓库索引器")
    print(f"   用户: {config.github_username}")
    print(f"   模式: {mode}")
    if args.dry_run:
        print("   🔍 DRY RUN（不写入数据库）")
    print("=" * 60)

    # ---- Step 1: 初始化数据库表 ----
    print("\n📋 Step 1: 初始化数据库表...")
    init_supabase_tables(config)

    # ---- Step 2: 获取仓库列表 ----
    print(f"\n📋 Step 2: 获取 {config.github_username} 的公开仓库列表...")
    repos = get_public_repos(config)

    if args.repo:
        repos = [r for r in repos if r["name"] == args.repo]
        if not repos:
            print(f"  ❌ 未找到仓库: {args.repo}")
            sys.exit(1)

    print(f"  ✅ 找到 {len(repos)} 个仓库")

    # ---- Step 3: 克隆 + 索引 ----
    os.makedirs(config.clone_dir, exist_ok=True)
    all_chunks = []

    for i, repo in enumerate(repos):
        repo_name = repo["name"]
        print(f"\n📋 Step 3.{i + 1}: 索引 {repo_name} ({repo.get('language', 'Unknown')})")

        # 克隆仓库
        repo_dir = clone_or_pull(repo, config.clone_dir, config)
        if not repo_dir:
            continue

        # 收集文件
        files = collect_files(repo_dir, config)
        print(f"    📄 收集到 {len(files)} 个文件")

        # 生成项目级 chunk（README 等已在 chunk_repo_files 中处理）
        # 额外添加仓库元信息 chunk
        from chunker import Chunk
        meta_chunk = Chunk(
            repo=repo_name,
            path="__meta__",
            content=f"""仓库: {repo_name}
描述: {repo.get('description', '暂无描述')}
语言: {repo.get('language', '未知')}
Stars: {repo.get('stargazers_count', 0)}
Forks: {repo.get('forks_count', 0)}
主页: {repo.get('homepage', '无')}
Topics: {', '.join(repo.get('topics', []))}
创建时间: {repo.get('created_at', '')}
最后更新: {repo.get('updated_at', '')}
""",
            level="project",
            language="",
            metadata={
                "description": repo.get("description", ""),
                "primary_language": repo.get("language", ""),
                "stars": repo.get("stargazers_count", 0),
                "forks": repo.get("forks_count", 0),
                "html_url": repo.get("html_url", ""),
                "homepage": repo.get("homepage", ""),
                "topics": repo.get("topics", []),
                "created_at": repo.get("created_at", ""),
                "updated_at": repo.get("updated_at", ""),
            },
        )
        all_chunks.append(meta_chunk)

        # 分块
        chunks = chunk_repo_files(repo_name, repo_dir, files, config)
        print(f"    📦 生成 {len(chunks)} 个代码块")
        all_chunks.extend(chunks)

    print(f"\n📊 总计: {len(all_chunks)} 个代码块（{len(repos)} 个仓库）")

    if len(all_chunks) == 0:
        print("  ⚠️  没有找到需要索引的内容")
        cleanup_clones(config.clone_dir)
        return

    # ---- Step 4: 生成 Embedding ----
    embeddings: list[list[float]] = []
    use_embeddings = bool(config.openai_api_key or config.voyage_api_key)

    if use_embeddings:
        print("\n📋 Step 4: 生成 Embedding 向量...")
        try:
            embeddings = generate_embeddings(all_chunks, config)
            print(f"  ✅ 生成 {len(embeddings)} 个向量")
        except Exception as e:
            print(f"  ⚠️  Embedding 生成失败: {e}")
            print("  ℹ️  将使用关键词检索模式（无需 Embedding）")
            use_embeddings = False
    else:
        print("\n📋 Step 4: 跳过 Embedding（关键词检索模式）")
        print("  💡 设置 OPENAI_API_KEY 环境变量可开启向量检索")

    # ---- Step 5: 写入 Supabase ----
    # 过滤无效仓库名的 chunks
    invalid_names = {'-', '.', '..', ''}
    valid_chunks = [c for c in all_chunks if c.repo not in invalid_names]
    skipped = len(all_chunks) - len(valid_chunks)
    if skipped > 0:
        print(f"\n  ⏭️  跳过 {skipped} 个无效仓库名的代码块")

    print("\n📋 Step 5: 写入 Supabase...")
    count = upsert_chunks(valid_chunks, embeddings, config, mode=mode, use_embeddings=use_embeddings)
    print(f"  ✅ 成功写入 {count} 个文档")

    # ---- 清理 ----
    print(f"\n🧹 清理克隆目录: {config.clone_dir}")
    cleanup_clones(config.clone_dir)

    print("\n" + "=" * 60)
    print("🎉 索引完成！")
    print(f"   仓库数: {len(repos)}")
    print(f"   文档数: {count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
