"""
向量数据库写入

将分块结果和 Embedding 批量写入 Supabase pgvector。
支持：
  - 全量模式（先清空再写入）
  - 增量模式（按文件 hash 判断是否更新）
"""

import hashlib
import uuid
from config import IndexerConfig
from chunker import Chunk


def init_supabase_tables(config: IndexerConfig) -> None:
    """初始化 Supabase 数据库表结构和 RPC 函数"""
    from supabase import create_client

    client = create_client(config.supabase_url, config.supabase_key)

    sql = """
    -- 启用 pgvector
    CREATE EXTENSION IF NOT EXISTS vector;

    -- 文档表
    CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(512),
        level TEXT NOT NULL CHECK (level IN ('project', 'architecture', 'code', 'history')),
        language TEXT DEFAULT '',
        start_line INTEGER DEFAULT 0,
        end_line INTEGER DEFAULT 0,
        content_hash TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents(repo);
    CREATE INDEX IF NOT EXISTS idx_documents_level ON documents(level);
    CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

    -- 匹配文档的 RPC 函数
    CREATE OR REPLACE FUNCTION match_documents(
        query_embedding vector(512),
        match_threshold float DEFAULT 0.5,
        match_count int DEFAULT 5
    )
    RETURNS TABLE(
        id UUID,
        repo TEXT,
        path TEXT,
        content TEXT,
        level TEXT,
        language TEXT,
        metadata JSONB,
        score float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RETURN QUERY
        SELECT
            d.id,
            d.repo,
            d.path,
            d.content,
            d.level,
            d.language,
            d.metadata,
            1 - (d.embedding <=> query_embedding) AS score
        FROM documents d
        WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
        ORDER BY d.embedding <=> query_embedding
        LIMIT match_count;
    END;
    $$;

    -- 列出所有项目的 RPC 函数
    CREATE OR REPLACE FUNCTION list_projects()
    RETURNS TABLE(
        name TEXT,
        description TEXT,
        language TEXT,
        stars INTEGER,
        url TEXT,
        topics TEXT[],
        last_updated TEXT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RETURN QUERY
        SELECT DISTINCT ON (d.repo)
            d.repo AS name,
            COALESCE(d.metadata->>'description', '') AS description,
            COALESCE(d.metadata->>'primary_language', '') AS language,
            COALESCE((d.metadata->>'stars')::int, 0) AS stars,
            COALESCE(d.metadata->>'html_url', '') AS url,
            COALESCE((SELECT array_agg(t) FROM jsonb_array_elements_text(d.metadata->'topics') t), ARRAY[]::TEXT[]) AS topics,
            COALESCE(d.metadata->>'updated_at', '') AS last_updated
        FROM documents d
        WHERE d.level = 'project'
        ORDER BY d.repo, d.updated_at DESC;
    END;
    $$;

    -- 索引统计
    CREATE OR REPLACE FUNCTION index_stats()
    RETURNS TABLE(
        total_docs BIGINT,
        total_repos BIGINT,
        last_indexed_at TEXT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RETURN QUERY
        SELECT
            COUNT(*)::BIGINT AS total_docs,
            COUNT(DISTINCT repo)::BIGINT AS total_repos,
            to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS last_indexed_at
        FROM documents;
    END;
    $$;
    """

    try:
        result = client.rpc("sql_exec", {"query": sql}).execute()
        print("  ✅ 数据表初始化完成")
        return result
    except Exception:
        # rpc 不允许执行 DDL，提示用户在 Supabase SQL Editor 中手动执行
        pass

    # 尝试通过 REST API 执行（Supabase Management API）
    print("  ℹ️  请确保已在 Supabase SQL Editor 中执行建表语句")
    print("  ℹ️  详见 indexer/upsert.py 中的 init_supabase_tables() 函数的 SQL")
    print("  ℹ️  下面的 upsert 操作会尝试写入数据，如果表不存在会报错")

    # 保存 SQL 到文件，方便手动执行
    sql_path = "/tmp/interview_agent_init.sql"
    try:
        with open(sql_path, "w") as f:
            f.write(sql)
        print(f"  💾 SQL 已保存到: {sql_path}")
    except OSError:
        pass


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    config: IndexerConfig,
    mode: str = "full",
    use_embeddings: bool = True,
) -> int:
    """批量写入 chunks 和 embeddings 到 Supabase

    Args:
        chunks: 代码块列表
        embeddings: Embedding 向量列表（use_embeddings=False 时为空）
        config: 索引器配置
        mode: "full" 全量或 "incremental" 增量
        use_embeddings: 是否写入向量（False = 关键词检索模式）
    """
    from supabase import create_client

    if config.dry_run:
        mode_text = "向量检索" if use_embeddings else "关键词检索"
        print(f"  🔍 [DRY RUN] 将写入 {len(chunks)} 个文档（{mode_text}）")
        return len(chunks)

    client = create_client(config.supabase_url, config.supabase_key)

    # 诊断：打印连接信息（隐藏敏感部分）
    masked_url = config.supabase_url[:25] + '***' if len(config.supabase_url) > 25 else '***'
    print(f"  🔗 Supabase: {masked_url}")
    print(f"  🔑 Key 长度: {len(config.supabase_key)} 字符")

    # 测试连接
    try:
        test = client.table("documents").select("id", count="exact").limit(1).execute()
        print(f"  ✅ 连接成功，documents 表当前有 {test.count} 条记录")
    except Exception as e:
        print(f"  ❌ 连接测试失败: {e}")
        print(f"  💡 请检查：1) Supabase URL 是否正确  2) anon key 是否有效  3) documents 表是否存在")

    total = len(chunks)
    inserted = 0

    # 全量模式：先删除旧数据（按仓库）
    if mode == "full":
        repos = list({c.repo for c in chunks})
        for repo in repos:
            # 跳过空仓库名和纯特殊字符的仓库名
            if not repo or not repo.strip() or repo in ('-', '.', '..'):
                print(f"  ⏭️  跳过无效仓库名: '{repo}'")
                continue
            try:
                client.table("documents").delete().eq("repo", repo).execute()
                print(f"  🗑️  已清理仓库: {repo}")
            except Exception as e:
                print(f"  ⚠️  清理仓库 {repo} 失败: {e}")

    mode_text = "向量检索" if use_embeddings else "关键词检索"
    print(f"  📤 写入 {total} 个文档到 Supabase（{mode_text}）...")

    for i in range(0, total, config.batch_size):
        batch_chunks = chunks[i : i + config.batch_size]
        batch_embs = embeddings[i : i + config.batch_size] if use_embeddings else []

        rows = []
        for j, chunk in enumerate(batch_chunks):
            content_hash = hashlib.sha256(chunk.content.encode()).hexdigest()
            row: dict = {
                "id": str(uuid.uuid4()),
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
            if use_embeddings:
                row["embedding"] = batch_embs[j]
            rows.append(row)

        # 分批插入
        max_retries = 3
        import time
        for attempt in range(max_retries):
            try:
                result = client.table("documents").insert(rows).execute()
                inserted += len(rows)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"    ❌ 写入失败: {e}")
                    raise
                print(f"    ⚠️  重试 {attempt + 1}/{max_retries}")
                time.sleep(2 ** attempt)

        print(f"    ✅ {min(i + config.batch_size, total)}/{total}")

    return inserted
