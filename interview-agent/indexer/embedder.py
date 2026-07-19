"""
批量 Embedding 生成

支持两种方案：
  1. OpenAI text-embedding-3-small — 性价比高，512 维
  2. Voyage AI voyage-code-2 — 代码理解更好
"""

import time
from config import IndexerConfig
from chunker import Chunk


def generate_embeddings(
    chunks: list[Chunk],
    config: IndexerConfig,
) -> list[list[float]]:
    """为代码块批量生成 Embedding 向量"""
    if config.embedding_provider == "voyage":
        return _embed_with_voyage(chunks, config)
    return _embed_with_openai(chunks, config)


def _embed_with_openai(chunks: list[Chunk], config: IndexerConfig) -> list[list[float]]:
    """使用 OpenAI Embedding API"""
    import urllib.request
    import json

    api_key = config.openai_api_key
    model = config.embedding_model
    all_embeddings: list[list[float]] = []
    total = len(chunks)

    print(f"  📐 生成 Embedding ({model})... 共 {total} 个代码块")

    for i in range(0, total, config.batch_size):
        batch = chunks[i : i + config.batch_size]
        texts = [c.content for c in batch]

        body = json.dumps({
            "model": model,
            "input": texts,
            "dimensions": config.embedding_dimensions,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.openai.com/v1/embeddings",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode())
                    embeddings = [item["embedding"] for item in data["data"]]
                    all_embeddings.extend(embeddings)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                print(f"    ⚠️  重试 {attempt + 1}/{max_retries}: {e}")
                time.sleep(2 ** attempt)

        print(f"    ✅ {min(i + config.batch_size, total)}/{total}")

        # 速率限制：OpenAI 免费层 3 RPM
        time.sleep(0.5)

    return all_embeddings


def _embed_with_voyage(chunks: list[Chunk], config: IndexerConfig) -> list[list[float]]:
    """使用 Voyage AI Embedding API"""
    import urllib.request
    import json

    api_key = config.voyage_api_key
    all_embeddings: list[list[float]] = []
    total = len(chunks)

    print(f"  📐 生成 Embedding (voyage-code-2)... 共 {total} 个代码块")

    for i in range(0, total, config.batch_size):
        batch = chunks[i : i + config.batch_size]
        texts = [c.content for c in batch]

        body = json.dumps({
            "model": "voyage-code-2",
            "input": texts,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.voyageai.com/v1/embeddings",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode())
                    embeddings = [item["embedding"] for item in data["data"]]
                    all_embeddings.extend(embeddings)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                print(f"    ⚠️  重试 {attempt + 1}/{max_retries}: {e}")
                time.sleep(2 ** attempt)

        print(f"    ✅ {min(i + config.batch_size, total)}/{total}")
        time.sleep(0.3)

    return all_embeddings
