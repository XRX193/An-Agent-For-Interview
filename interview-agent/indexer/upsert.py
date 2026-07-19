"""
写入 Supabase —— 失败，改用本地 JSON 文件索引
"""
import hashlib
import json
import os
from config import IndexerConfig
from chunker import Chunk


def init_supabase_tables(config: IndexerConfig) -> None:
    pass


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    config: IndexerConfig,
    mode: str = "full",
    use_embeddings: bool = True,
) -> int:
    """将代码块写入本地 JSON 文件，后续提交到 Git"""
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "search_index.json"
    )

    data = {
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "total_chunks": len(chunks),
        "repos": list({c.repo for c in chunks}),
        chunks_to_json(chunks),
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    file_size = os.path.getsize(output_path) / 1024
    print(f"  📄 索引文件已保存: {output_path} ({file_size:.0f} KB)")
    print(f"  📦 共 {len(chunks)} 个代码块")
    return len(chunks)


def chunks_to_json(chunks: list[Chunk]) -> list[dict]:
    """转换为可序列化的 JSON"""
    result = []
    for c in chunks:
        result.append({
            "repo": c.repo,
            "path": c.path,
            "content": c.content[:2000],  # 截断长内容
            "level": c.level,
            "language": c.language,
            "start_line": c.start_line,
            "end_line": c.end_line,
        })
    return result
