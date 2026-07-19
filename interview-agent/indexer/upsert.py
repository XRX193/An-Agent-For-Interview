"""
向量数据库写入

将分块结果批量写入 Supabase。
使用 RPC 函数 insert_documents 绕过 REST 表 API 限制。
"""

import hashlib
import json
from config import IndexerConfig
from chunker import Chunk


def init_supabase_tables(config: IndexerConfig) -> None:
    """初始化 Supabase 数据库表结构"""
    print("  ℹ️  请在 Supabase SQL Editor 中手动执行建表 SQL 和创建 RPC 函数")


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    config: IndexerConfig,
    mode: str = "full",
    use_embeddings: bool = True,
) -> int:
    """批量写入 chunks 到 Supabase（使用 RPC 函数）"""
    from supabase import create_client

    if config.dry_run:
        mode_text = "向量检索" if use_embeddings else "关键词检索"
        print(f"  🔍 [DRY RUN] 将写入 {len(chunks)} 个文档（{mode_text}）")
        return len(chunks)

    client = create_client(config.supabase_url, config.supabase_key)

    total = len(chunks)
    inserted = 0
    batch_size = 50

    mode_text = "向量检索" if use_embeddings else "关键词检索"
    print(f"  📤 写入 {total} 个文档到 Supabase（{mode_text}，RPC 方式）...")

    for i in range(0, total, batch_size):
        batch = chunks[i : i + batch_size]

        rows = []
        for chunk in batch:
            content_hash = hashlib.sha256(chunk.content.encode()).hexdigest()

            row = {
                "repo": chunk.repo,
                "path": chunk.path,
                "content": chunk.content,
                "level": chunk.level,
                "language": chunk.language,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "content_hash": content_hash,
                "metadata": json.dumps(chunk.metadata),
            }

            if use_embeddings and i < len(embeddings):
                idx = i + (len(rows))
                if idx < len(embeddings):
                    row["embedding"] = embeddings[idx]

            rows.append(row)

        import time
        for attempt in range(3):
            try:
                result = client.rpc("insert_documents", {"payload": json.dumps(rows)}).execute()
                inserted += len(rows)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"    ❌ 批次写入失败: {e}")
                else:
                    print(f"    ⚠️  重试 {attempt + 1}/3")
                    time.sleep(2)

        print(f"    ✅ {min(i + batch_size, total)}/{total}")

    print(f"  ✅ 成功写入 {inserted} 个文档")
    return inserted
