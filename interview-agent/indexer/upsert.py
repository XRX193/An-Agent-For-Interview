"""
向量数据库写入 —— HTTP 直连 Supabase RPC
"""
import hashlib
import json
import urllib.request
import time
from config import IndexerConfig
from chunker import Chunk


def init_supabase_tables(config: IndexerConfig) -> None:
    print("  ℹ️  请在 Supabase SQL Editor 中手动执行建表 SQL")


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    config: IndexerConfig,
    mode: str = "full",
    use_embeddings: bool = True,
) -> int:
    """通过 HTTP POST /rest/v1/rpc/insert_documents 批量写入"""
    if config.dry_run:
        print(f"  🔍 [DRY RUN] 将写入 {len(chunks)} 个文档")
        return len(chunks)

    total = len(chunks)
    inserted = 0
    batch_size = 50

    mode_text = "向量检索" if use_embeddings else "关键词检索"
    print(f"  📤 写入 {total} 个文档到 Supabase（{mode_text}，HTTP RPC）...")

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
                "metadata": chunk.metadata,
            }
            rows.append(row)

        payload = json.dumps({"payload": rows}).encode("utf-8")

        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    f"{config.supabase_url}/rest/v1/rpc/insert_documents",
                    data=payload,
                    headers={
                        "apikey": config.supabase_key,
                        "Authorization": f"Bearer {config.supabase_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req) as resp:
                    resp_data = json.loads(resp.read().decode())
                    inserted += len(rows)
                    print(f"    ✅ {min(i + batch_size, total)}/{total} (返回: {resp_data})")
                break
            except Exception as e:
                body = ""
                try:
                    if hasattr(e, 'read'): body = e.read().decode()[:200]
                except: pass
                if attempt == 2:
                    print(f"    ❌ 批次写入失败: {e} {body}")
                else:
                    print(f"    ⚠️  重试 {attempt + 1}/3: {e}")
                    time.sleep(2)

    print(f"  ✅ 成功写入 {inserted} 个文档")
    return inserted
