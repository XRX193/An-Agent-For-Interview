"""GitHub repository discovery, PR collection, and shallow clone helpers."""

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request

from config import IndexerConfig


GITHUB_API = "https://api.github.com"


def github_api_request(url: str, headers: dict[str, str]) -> dict | list:
    """Fetch a JSON payload from the GitHub REST API."""
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def repository_owner(repo: dict) -> str:
    owner = repo.get("owner")
    return owner.get("login", "") if isinstance(owner, dict) else ""


def is_owned_by_candidate(repo: dict, config: IndexerConfig) -> bool:
    """Return whether a repository belongs to the configured GitHub account."""
    owner = repository_owner(repo)
    return bool(owner) and owner.casefold() == config.github_username.casefold()


def repository_key(repo: dict, config: IndexerConfig) -> str:
    """Return a collision-free index key for a repository."""
    if is_owned_by_candidate(repo, config):
        return str(repo["name"])
    full_name = repo.get("full_name")
    if isinstance(full_name, str) and full_name:
        return full_name
    owner = repository_owner(repo)
    return f"{owner}/{repo['name']}" if owner else str(repo["name"])


def github_headers(config: IndexerConfig) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    if config.github_token:
        headers["Authorization"] = f"Bearer {config.github_token}"
    return headers


def get_public_repos(config: IndexerConfig) -> list[dict]:
    """Get the candidate's public repositories and public collaborations.

    The public profile API is intentionally used instead of ``/user/repos`` so
    an Actions token cannot make private repositories eligible for indexing.
    """
    repos: list[dict] = []
    headers = github_headers(config)

    if config.repo_mode == "listed":
        for configured_name in config.repo_include:
            owner, separator, name = configured_name.partition("/")
            if not separator:
                owner, name = config.github_username, configured_name
            try:
                data = github_api_request(f"{GITHUB_API}/repos/{owner}/{name}", headers)
            except urllib.error.HTTPError as error:
                raise RuntimeError(f"Could not fetch repository {configured_name}: HTTP {error.code}") from error
            if not isinstance(data, dict):
                raise RuntimeError(f"Could not fetch repository {configured_name}: invalid response")
            repos.append(data)
    else:
        page = 1
        while True:
            query = urllib.parse.urlencode({
                "per_page": 100,
                "page": page,
                "type": "all",
                "sort": "updated",
            })
            try:
                data = github_api_request(
                    f"{GITHUB_API}/users/{config.github_username}/repos?{query}",
                    headers,
                )
            except urllib.error.HTTPError as error:
                raise RuntimeError(f"GitHub API error: {error.code} {error.reason}") from error
            if not isinstance(data, list):
                raise RuntimeError("GitHub API returned an invalid repository list")
            if not data:
                break
            repos.extend(repo for repo in data if isinstance(repo, dict))
            page += 1

    invalid_names = {"-", ".", "..", ""}
    return [
        repo
        for repo in repos
        if not repo.get("private", False)
        and repo.get("visibility") not in {"private", "internal"}
        and repo.get("name") not in config.repo_exclude
        and repo.get("name") not in invalid_names
    ]


def get_related_pull_requests(repo: dict, config: IndexerConfig) -> list[dict]:
    """Get public pull requests authored by the candidate for an external repo."""
    owner = repository_owner(repo)
    name = str(repo.get("name", ""))
    if not owner or not name:
        return []

    pull_requests: list[dict] = []
    headers = github_headers(config)
    page = 1
    while True:
        query = urllib.parse.urlencode({
            "q": f"repo:{owner}/{name} is:pr is:public author:{config.github_username}",
            "per_page": 100,
            "page": page,
            "sort": "updated",
            "order": "desc",
        })
        try:
            payload = github_api_request(f"{GITHUB_API}/search/issues?{query}", headers)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Could not fetch PRs for {owner}/{name}: HTTP {error.code}") from error
        if not isinstance(payload, dict):
            raise RuntimeError(f"Could not fetch PRs for {owner}/{name}: invalid response")
        items = payload.get("items", [])
        if not isinstance(items, list) or not items:
            break
        pull_requests.extend(item for item in items if isinstance(item, dict))
        if len(items) < 100:
            break
        page += 1

    for pull_request in pull_requests:
        number = pull_request.get("number")
        pull_request["files"] = (
            get_pull_request_files(owner, name, number, headers)
            if isinstance(number, int)
            else []
        )
    return pull_requests


def get_pull_request_files(
    owner: str,
    repository: str,
    number: int,
    headers: dict[str, str],
) -> list[dict]:
    """Get the changed-file patches for a pull request."""
    files: list[dict] = []
    page = 1
    while True:
        query = urllib.parse.urlencode({"per_page": 100, "page": page})
        url = f"{GITHUB_API}/repos/{owner}/{repository}/pulls/{number}/files?{query}"
        try:
            data = github_api_request(url, headers)
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Could not fetch files for {owner}/{repository} PR #{number}: HTTP {error.code}"
            ) from error
        if not isinstance(data, list) or not data:
            break
        files.extend(item for item in data if isinstance(item, dict))
        if len(data) < 100:
            break
        page += 1
    return files


def clone_or_pull(repo: dict, clone_dir: str, config: IndexerConfig) -> str | None:
    """Clone a public repository or update its existing shallow clone."""
    repo_name = repo["name"]
    repo_path = os.path.join(clone_dir, repo_name)
    clone_url = repo["clone_url"]

    if os.path.exists(repo_path):
        print(f"    Updating: {repo_name}")
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
        except subprocess.CalledProcessError as error:
            print(f"    Update failed for {repo_name}: {error}; cloning again")
            shutil.rmtree(repo_path, ignore_errors=True)

    print(f"    Cloning: {repo_name}")
    try:
        subprocess.run(
            ["git", "clone", "--depth=1", clone_url, repo_path],
            capture_output=True, check=True, timeout=120,
        )
        return repo_path
    except subprocess.CalledProcessError as error:
        print(f"    Clone failed for {repo_name}: {error}")
        return None


def cleanup_clones(clone_dir: str) -> None:
    """Remove the temporary clone directory."""
    if os.path.exists(clone_dir):
        shutil.rmtree(clone_dir, ignore_errors=True)
        print(f"Cleaned temporary clone directory: {clone_dir}")
