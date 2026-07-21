"""将代码片段持久化为 Worker 可读取的 JSON 索引。"""

import hashlib
import json
import os
from datetime import datetime, timezone

from chunker import Chunk
from config import IndexerConfig


SCHEMA_VERSION = 2


def index_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "search_index.json",
    )


def load_index_state() -> dict:
    """读取已有索引；旧格式或损坏文件按空索引处理。"""
    path = index_path()
    if not os.path.exists(path):
        return {"chunks": [], "repo_updates": {}}
    try:
        with open(path, "r", encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data.get("chunks"), list):
            raise ValueError("chunks must be a list")
        if not isinstance(data.get("repo_updates", {}), dict):
            data["repo_updates"] = {}
        return data
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"  [warn] 无法读取现有索引，将执行全量重建: {error}")
        return {"chunks": [], "repo_updates": {}}


def upsert_chunks(
    chunks: list[Chunk],
    config: IndexerConfig,
    mode: str = "full",
    processed_repos: set[str] | None = None,
    current_repos: set[str] | None = None,
    repo_updates: dict[str, str] | None = None,
) -> int:
    """写入全量索引，或在增量模式下替换已处理仓库的片段。"""
    existing = load_index_state() if mode == "incremental" else {"chunks": []}
    processed = processed_repos or {chunk.repo for chunk in chunks}
    current = current_repos or processed

    retained = []
    if mode == "incremental":
        retained = [
            chunk
            for chunk in existing.get("chunks", [])
            if chunk.get("repo") in current and chunk.get("repo") not in processed
        ]

    merged = retained + chunks_to_json(chunks)
    unique: dict[str, dict] = {}
    for chunk in merged:
        chunk_id = chunk.get("id") or stable_chunk_id(chunk)
        chunk["id"] = chunk_id
        unique[chunk_id] = chunk

    all_chunks = sorted(
        unique.values(),
        key=lambda item: (
            item.get("repo", ""),
            item.get("path", ""),
            item.get("start_line", 0),
            item.get("end_line", 0),
        ),
    )
    data = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_chunks": len(all_chunks),
        "repos": sorted({chunk["repo"] for chunk in all_chunks}),
        "repo_updates": repo_updates or {},
        "chunks": all_chunks,
    }

    output_path = index_path()
    with open(output_path, "w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, separators=(",", ":"))
        file.write("\n")

    file_size = os.path.getsize(output_path) / 1024
    print(f"  索引文件已保存: {output_path} ({file_size:.0f} KB)")
    print(f"  共 {len(all_chunks)} 个代码块")
    return len(all_chunks)


def stable_chunk_id(chunk: dict) -> str:
    identity = "\0".join(
        [
            str(chunk.get("repo", "")),
            str(chunk.get("path", "")),
            str(chunk.get("start_line", 0)),
            str(chunk.get("end_line", 0)),
            str(chunk.get("content", "")),
        ]
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]


def chunks_to_json(chunks: list[Chunk]) -> list[dict]:
    result = []
    for chunk in chunks:
        value = {
            "repo": chunk.repo,
            "path": chunk.path.replace("\\", "/"),
            "content": chunk.content,
            "level": chunk.level,
            "language": chunk.language,
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "metadata": chunk.metadata,
        }
        value["id"] = stable_chunk_id(value)
        result.append(value)
    return result
