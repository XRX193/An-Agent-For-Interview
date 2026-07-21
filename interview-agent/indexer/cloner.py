"""
Git 克隆/拉取逻辑

- 通过 GitHub API 获取用户的所有公开仓库
- 克隆到临时目录
- 支持增量更新（git pull）
"""

import os
import json
import shutil
import subprocess
from pathlib import Path
from config import IndexerConfig

# GitHub API 基础 URL
GITHUB_API = "https://api.github.com"


def get_public_repos(config: IndexerConfig) -> list[dict]:
    """通过 GitHub API 获取用户的所有公开仓库"""
    repos = []
    page = 1

    headers = {"Accept": "application/vnd.github+json"}
    if config.github_token:
        headers["Authorization"] = f"Bearer {config.github_token}"

    import urllib.request
    import urllib.error

    while True:
        if config.repo_mode == "listed":
            # 列出模式：直接获取指定仓库
            for repo_name in config.repo_include:
                url = f"{GITHUB_API}/repos/{config.github_username}/{repo_name}"
                req = urllib.request.Request(url, headers=headers)
                try:
                    with urllib.request.urlopen(req) as resp:
                        data = json.loads(resp.read().decode())
                        repos.append(data)
                except urllib.error.HTTPError as e:
                    raise RuntimeError(f"仓库 {repo_name} 获取失败: HTTP {e.code}") from e
            break
        else:
            # 全部公开仓库模式
            url = f"{GITHUB_API}/users/{config.github_username}/repos?per_page=100&page={page}&type=owner&sort=updated"
            req = urllib.request.Request(url, headers=headers)

            try:
                with urllib.request.urlopen(req) as resp:
                    data = json.loads(resp.read().decode())
                    if not data:
                        break
                    repos.extend(data)
                    page += 1
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"GitHub API 错误: {e.code} {e.reason}") from e

    # 过滤排除列表和无效仓库名
    invalid_names = {'-', '.', '..', ''}
    repos = [r for r in repos if r["name"] not in config.repo_exclude and r["name"] not in invalid_names]
    # 排除 fork 的仓库（可选）
    # repos = [r for r in repos if not r.get("fork", False)]

    return repos


def clone_or_pull(repo: dict, clone_dir: str, config: IndexerConfig) -> str | None:
    """克隆仓库或拉取最新代码，返回仓库本地路径"""
    repo_name = repo["name"]
    repo_path = os.path.join(clone_dir, repo_name)
    clone_url = repo["clone_url"]

    if os.path.exists(repo_path):
        # 已存在，执行 git pull
        print(f"    📥 拉取更新: {repo_name}")
        try:
            subprocess.run(
                ["git", "-C", repo_path, "fetch", "--depth=1"],
                capture_output=True, check=True, timeout=60,
            )
            subprocess.run(
                ["git", "-C", repo_path, "reset", "--hard", "origin/HEAD"],
                capture_output=True, check=True, timeout=60,
            )
            return repo_path
        except subprocess.CalledProcessError as e:
            print(f"    ⚠️  拉取失败 {repo_name}: {e}，将重新克隆")
            shutil.rmtree(repo_path, ignore_errors=True)

    # 浅克隆（只获取最新代码）
    print(f"    📦 克隆: {repo_name}")
    try:
        subprocess.run(
            ["git", "clone", "--depth=1", clone_url, repo_path],
            capture_output=True, check=True, timeout=120,
        )
        return repo_path
    except subprocess.CalledProcessError as e:
        print(f"    ❌ 克隆失败 {repo_name}: {e}")
        return None


def cleanup_clones(clone_dir: str) -> None:
    """清理克隆的临时目录"""
    if os.path.exists(clone_dir):
        shutil.rmtree(clone_dir, ignore_errors=True)
        print(f"🧹 已清理临时目录: {clone_dir}")
