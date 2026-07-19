"""
写入 Supabase —— psycopg2 直连 PostgreSQL
"""
import hashlib
import json
import time
from config import IndexerConfig
from chunker import Chunk


def init_supabase_tables(config: IndexerConfig) -> None:
    print("  ℹ️  建表 SQL 请手动在 Supabase SQL Editor 执行")


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    config: IndexerConfig,
    mode: str = "full",
    use_embeddings: bool = True,
) -> int:
    if config.dry_run:
        print(f"  🔍 [DRY RUN] 将写入 {len(chunks)} 个文档")
        return len(chunks)

    # 从 Supabase URL 提取 project_id，构建直连地址
    from urllib.parse import urlparse
    parsed = urlparse(config.supabase_url)
    hostname = parsed.hostname  # xxxxx.supabase.co
    project_id = hostname.replace(".supabase.co", "") if hostname else ""
    db_host = f"db.{project_id}.supabase.co"
    db_user = "postgres"
    db_name = "postgres"
    db_password = config.supabase_key  # fallback

    # 尝试从环境变量读取数据库密码
    import os
    env_pass = os.getenv("SUPABASE_DB_PASSWORD", "")
    if env_pass:
        db_password = env_pass

    print(f"  🔗 直连 PostgreSQL: {db_host}")

    try:
        import psycopg2
    except ImportError:
        print("  ❌ psycopg2 未安装，请在 requirements.txt 中添加 psycopg2-binary")
        return 0

    conn = None
    try:
        # 解析 IPv4 地址（避免 GitHub Actions IPv6 不可达问题）
        import socket
        addrs = socket.getaddrinfo(db_host, 6543, socket.AF_INET, socket.SOCK_STREAM)
        host_addr = addrs[0][4][0]
        print(f"  🌐 解析 IPv4: {host_addr}")

        conn = psycopg2.connect(
            host=host_addr,
            port=6543,
            dbname=db_name,
            user=db_user,
            password=db_password,
            sslmode="require",
            connect_timeout=30,
        )
        print("  ✅ PostgreSQL 连接成功")
    except Exception as e:
        print(f"  ❌ PostgreSQL 连接失败: {e}")
        print(f"  💡 请检查 SUPABASE_DB_PASSWORD 是否正确")
        return 0

    cur = conn.cursor()
    inserted = 0
    total = len(chunks)
    batch_size = 50

    print(f"  📤 写入 {total} 个文档（直连 PostgreSQL）...")

    for i in range(0, total, batch_size):
        batch = chunks[i : i + batch_size]
        values = []
        params = []

        for chunk in batch:
            content_hash = hashlib.sha256(chunk.content.encode()).hexdigest()
            values.append("(%s, %s, %s, %s, %s, %s, %s, %s, %s)")
            params.extend([
                chunk.repo,
                chunk.path,
                chunk.content,
                chunk.level,
                chunk.language,
                chunk.start_line,
                chunk.end_line,
                content_hash,
                json.dumps(chunk.metadata),
            ])

        sql = f"INSERT INTO documents (repo, path, content, level, language, start_line, end_line, content_hash, metadata) VALUES {', '.join(values)}"

        for attempt in range(3):
            try:
                cur.execute(sql, params)
                conn.commit()
                inserted += len(batch)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"    ❌ 批次写入失败: {e}")
                else:
                    conn.rollback()
                    time.sleep(2)

        print(f"    ✅ {min(i + batch_size, total)}/{total}")

    cur.close()
    conn.close()
    print(f"  ✅ 成功写入 {inserted} 个文档")
    return inserted
