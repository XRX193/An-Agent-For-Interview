"""为 Cloudflare Vectorize 生成增量同步计划。"""

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from config import IndexerConfig
from upsert import index_path


STATE_SCHEMA_VERSION = 1


class EmbeddingQuotaExceeded(RuntimeError):
    """Workers AI daily free allocation is exhausted."""


def _is_daily_quota_error(detail: str) -> bool:
    return "daily free allocation" in detail.lower()


def vector_state_path() -> Path:
    return Path(__file__).resolve().parent.parent / "vector_index_state.json"


def vector_plan_dir() -> Path:
    return Path(__file__).resolve().parent / "_vector_plan"


def load_vector_state() -> dict:
    path = vector_state_path()
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value.get("vector_ids", []), list):
            raise ValueError("vector_ids must be a list")
        return value
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"  [warn] 无法读取向量状态，将执行全量向量同步: {error}")
        return {}


def calculate_sync_plan(index_data: dict, previous_state: dict, config: IndexerConfig) -> tuple[list[dict], list[str]]:
    """根据稳定片段 ID 计算需要 upsert 和删除的向量。"""
    chunks = index_data.get("chunks", [])
    current_by_id = {
        str(chunk["id"]): chunk
        for chunk in chunks
        if isinstance(chunk, dict) and chunk.get("id")
    }
    previous_ids = {str(value) for value in previous_state.get("vector_ids", [])}
    previous_by_repo = {
        str(repo): {str(vector_id) for vector_id in vector_ids}
        for repo, vector_ids in previous_state.get("repo_vector_ids", {}).items()
        if isinstance(vector_ids, list)
    }
    model_changed = (
        previous_state.get("index_name") != config.vector_index_name
        or previous_state.get("model") != config.embedding_model
        or previous_state.get("dimensions") != config.embedding_dimensions
    )
    processed_repos = {str(repo) for repo in index_data.get("processed_repos", [])}
    current_repos = {str(repo) for repo in index_data.get("current_repos", [])}
    has_repository_scope = "processed_repos" in index_data and "current_repos" in index_data
    if not has_repository_scope:
        upsert_ids = set(current_by_id) if model_changed else set(current_by_id) - previous_ids
        delete_ids = previous_ids - set(current_by_id)
        return [current_by_id[value] for value in sorted(upsert_ids)], sorted(delete_ids)
    is_full_sync = (
        index_data.get("mode") == "full"
        or model_changed
        or (
            not previous_by_repo
            and processed_repos == current_repos
        )
    )
    if is_full_sync:
        upsert_ids = set(current_by_id)
        delete_ids = previous_ids - set(current_by_id)
    else:
        old_ids = set().union(
            *(previous_by_repo.get(repo, set()) for repo in processed_repos),
        ) if processed_repos else set()
        removed_ids = set().union(
            *(ids for repo, ids in previous_by_repo.items() if repo not in current_repos),
        ) if previous_by_repo else set()
        upsert_ids = set(current_by_id) - previous_ids
        delete_ids = (old_ids | removed_ids) - set(current_by_id)
    return [current_by_id[value] for value in sorted(upsert_ids)], sorted(delete_ids)


def prepare_vector_sync(
    config: IndexerConfig,
    embed_batch: Callable[[list[str], IndexerConfig], list[list[float]]] | None = None,
) -> dict:
    """生成 Wrangler 可消费的 NDJSON 和删除 ID 清单。"""
    if not config.vector_enabled:
        return {"enabled": False, "reason": "vector retrieval disabled"}
    if not config.cloudflare_account_id or not config.cloudflare_api_token:
        print("  [warn] 未配置 Cloudflare 凭据，跳过向量同步计划")
        return {"enabled": False, "reason": "missing Cloudflare credentials"}

    if not Path(index_path()).exists():
        return {"enabled": True, "upsert_count": 0, "delete_count": 0}

    with open(index_path(), "r", encoding="utf-8") as file:
        index_data = json.load(file)
    previous_state = load_vector_state()
    processed_repos = {str(repo) for repo in index_data.get("processed_repos", [])}
    current_repos = {str(repo) for repo in index_data.get("current_repos", [])}
    if (
        previous_state.get("vector_ids")
        and not previous_state.get("repo_vector_ids")
        and processed_repos != current_repos
    ):
        raise RuntimeError("A full index run is required to migrate legacy Vectorize state")
    upsert_chunks, delete_ids = calculate_sync_plan(index_data, previous_state, config)

    plan_dir = vector_plan_dir()
    plan_dir.mkdir(parents=True, exist_ok=True)
    upsert_path = plan_dir / "upsert.ndjson"
    delete_path = plan_dir / "delete-ids.txt"
    upsert_path.unlink(missing_ok=True)
    delete_path.unlink(missing_ok=True)

    if not upsert_chunks and not delete_ids and previous_state:
        return {
            "enabled": True,
            "upsert_count": 0,
            "delete_count": 0,
            "quota_exhausted": False,
            "deferred_upsert_count": 0,
            "upsert_path": str(upsert_path),
            "delete_path": str(delete_path),
        }

    embedding_function = embed_batch or request_embeddings
    completed_upsert_ids: set[str] = set()
    quota_exhausted = False
    deferred_upsert_count = 0
    if upsert_chunks:
        with upsert_path.open("w", encoding="utf-8", newline="\n") as output:
            for offset in range(0, len(upsert_chunks), config.embedding_batch_size):
                batch = upsert_chunks[offset:offset + config.embedding_batch_size]
                try:
                    vectors = embedding_function([chunk["content"] for chunk in batch], config)
                except EmbeddingQuotaExceeded as error:
                    quota_exhausted = True
                    deferred_upsert_count = len(upsert_chunks) - offset
                    print(
                        "  [warn] Workers AI daily quota exhausted; "
                        f"deferring {deferred_upsert_count} vector(s): {error}"
                    )
                    break
                if len(vectors) != len(batch):
                    raise RuntimeError("Embedding 返回数量与输入片段数量不一致")
                for chunk, vector in zip(batch, vectors):
                    if len(vector) != config.embedding_dimensions:
                        raise RuntimeError(
                            f"Embedding 维度错误: 期望 {config.embedding_dimensions}，实际 {len(vector)}"
                        )
                    metadata = {
                        "repo": chunk.get("repo", ""),
                        "path": chunk.get("path", ""),
                        "level": chunk.get("level", "code"),
                        "language": chunk.get("language", ""),
                    }
                    if chunk.get("start_line"):
                        metadata["start_line"] = chunk["start_line"]
                    if chunk.get("end_line"):
                        metadata["end_line"] = chunk["end_line"]
                    default_branch = chunk.get("metadata", {}).get("default_branch")
                    if isinstance(default_branch, str) and default_branch:
                        metadata["default_branch"] = default_branch
                    source_owner = chunk.get("metadata", {}).get("source_owner")
                    if isinstance(source_owner, str) and source_owner:
                        metadata["source_owner"] = source_owner
                    source_url = chunk.get("metadata", {}).get("source_url")
                    if isinstance(source_url, str) and source_url:
                        metadata["source_url"] = source_url
                    if chunk.get("path") == "__meta__" or chunk.get("level") == "history":
                        metadata["summary"] = str(chunk.get("content", ""))[:8_000]
                    record = {"id": chunk["id"], "values": vector, "metadata": metadata}
                    output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                    completed_upsert_ids.add(str(chunk["id"]))
                print(f"  向量生成进度: {min(offset + len(batch), len(upsert_chunks))}/{len(upsert_chunks)}")

    if delete_ids:
        delete_path.write_text("\n".join(delete_ids) + "\n", encoding="utf-8")

    previous_by_repo = {
        str(repo): [str(vector_id) for vector_id in vector_ids]
        for repo, vector_ids in previous_state.get("repo_vector_ids", {}).items()
        if isinstance(vector_ids, list)
    }
    current_by_repo: dict[str, list[str]] = {}
    for chunk in index_data.get("chunks", []):
        if isinstance(chunk, dict) and chunk.get("id") and chunk.get("repo"):
            current_by_repo.setdefault(str(chunk["repo"]), []).append(str(chunk["id"]))

    processed_repos = {str(repo) for repo in index_data.get("processed_repos", [])}
    current_repos = {str(repo) for repo in index_data.get("current_repos", [])}
    has_repository_scope = "processed_repos" in index_data and "current_repos" in index_data
    model_changed = (
        previous_state.get("index_name") != config.vector_index_name
        or previous_state.get("model") != config.embedding_model
        or previous_state.get("dimensions") != config.embedding_dimensions
    )

    next_by_repo = {repo: set(vector_ids) for repo, vector_ids in previous_by_repo.items()}
    known_current_repos = current_repos if has_repository_scope else set(current_by_repo)
    repos_to_update = processed_repos if has_repository_scope else set(current_by_repo)
    for repo in set(next_by_repo) - known_current_repos:
        del next_by_repo[repo]
    for repo in repos_to_update:
        desired_ids = set(current_by_repo.get(repo, []))
        retained_ids = set() if model_changed else next_by_repo.get(repo, set()) & desired_ids
        completed_ids = desired_ids & completed_upsert_ids
        next_by_repo[repo] = retained_ids | completed_ids

    current_ids = sorted({vector_id for vector_ids in next_by_repo.values() for vector_id in vector_ids})

    if completed_upsert_ids or delete_ids:
        state = {
            "schema_version": STATE_SCHEMA_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "index_name": config.vector_index_name,
            "model": config.embedding_model,
            "dimensions": config.embedding_dimensions,
            "vector_ids": current_ids,
            "repo_vector_ids": {
                repo: sorted(vector_ids)
                for repo, vector_ids in sorted(next_by_repo.items())
            },
        }
        vector_state_path().write_text(
            json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    return {
        "enabled": True,
        "upsert_count": len(completed_upsert_ids),
        "delete_count": len(delete_ids),
        "quota_exhausted": quota_exhausted,
        "deferred_upsert_count": deferred_upsert_count,
        "upsert_path": str(upsert_path),
        "delete_path": str(delete_path),
    }


def request_embeddings(texts: list[str], config: IndexerConfig) -> list[list[float]]:
    endpoint = (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{config.cloudflare_account_id}/ai/run/{config.embedding_model}"
    )
    body = json.dumps({"text": texts, "truncate_inputs": True}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {config.cloudflare_api_token}",
            "Content-Type": "application/json",
        },
    )

    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not payload.get("success"):
                raise RuntimeError(f"Workers AI 返回失败: {payload.get('errors', [])}")
            vectors = payload.get("result", {}).get("data")
            if not isinstance(vectors, list):
                raise RuntimeError("Workers AI 响应缺少 result.data")
            return vectors
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if _is_daily_quota_error(detail):
                raise EmbeddingQuotaExceeded(detail) from error
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise RuntimeError(f"Workers AI 请求失败 ({error.code}): {detail}") from error
            time.sleep(2 ** attempt)
        except urllib.error.URLError as error:
            if attempt == 2:
                raise RuntimeError(f"Workers AI 网络错误: {error.reason}") from error
            time.sleep(2 ** attempt)

    raise RuntimeError("Workers AI 请求失败")
