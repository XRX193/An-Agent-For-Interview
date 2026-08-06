#!/usr/bin/env python3
"""Build the interview index from public GitHub repositories and contributions."""

import argparse
import atexit
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from chunker import Chunk, chunk_repo_files
from cloner import (
    cleanup_clones,
    clone_or_pull,
    get_public_repos,
    get_related_pull_requests,
    is_owned_by_candidate,
    repository_key,
    repository_owner,
)
from config import IndexerConfig
from filters import collect_files
from upsert import load_index_state, upsert_chunks
from vectorize import prepare_vector_sync


def build_repository_meta_chunk(repo: dict, index_key: str, pull_request_count: int | None = None) -> Chunk:
    """Build a project-level chunk for either an owned repo or PR contribution."""
    owner = repository_owner(repo)
    description = repo.get("description") or "No description"
    contribution_note = ""
    if pull_request_count is not None:
        contribution_note = f"\nIndexed contribution pull requests: {pull_request_count}"

    return Chunk(
        repo=index_key,
        path="__meta__",
        content=(
            f"Repository: {repo.get('full_name') or index_key}\n"
            f"Owner: {owner or 'Unknown'}\n"
            f"Description: {description}\n"
            f"Language: {repo.get('language') or 'Unknown'}\n"
            f"Stars: {repo.get('stargazers_count', 0)}\n"
            f"Forks: {repo.get('forks_count', 0)}\n"
            f"Homepage: {repo.get('homepage') or 'None'}\n"
            f"Topics: {', '.join(repo.get('topics', []))}\n"
            f"Created: {repo.get('created_at', '')}\n"
            f"Updated: {repo.get('updated_at', '')}{contribution_note}\n"
        ),
        level="project",
        language="",
        metadata={
            "description": description,
            "primary_language": repo.get("language", ""),
            "stars": repo.get("stargazers_count", 0),
            "forks": repo.get("forks_count", 0),
            "html_url": repo.get("html_url", ""),
            "homepage": repo.get("homepage", ""),
            "topics": repo.get("topics", []),
            "created_at": repo.get("created_at", ""),
            "updated_at": repo.get("updated_at", ""),
            "default_branch": repo.get("default_branch", "main"),
            "source_owner": owner,
            "indexed_as": "pull_requests" if pull_request_count is not None else "repository",
            "pull_request_count": pull_request_count,
        },
    )


def build_pull_request_chunk(repo: dict, index_key: str, pull_request: dict) -> Chunk:
    """Serialize a contribution PR and its available changed-file patches."""
    number = pull_request.get("number", "unknown")
    files = pull_request.get("files", [])
    file_sections: list[str] = []
    if isinstance(files, list):
        for changed_file in files:
            if not isinstance(changed_file, dict):
                continue
            filename = str(changed_file.get("filename", "unknown file"))
            status = str(changed_file.get("status", "modified"))
            additions = changed_file.get("additions", 0)
            deletions = changed_file.get("deletions", 0)
            patch = changed_file.get("patch")
            details = f"File: {filename} ({status}, +{additions}/-{deletions})"
            if isinstance(patch, str) and patch:
                details += f"\n{patch}"
            file_sections.append(details)

    author = pull_request.get("user", {})
    author_login = author.get("login", "") if isinstance(author, dict) else ""
    content = (
        f"Pull request #{number}\n"
        f"Repository: {repo.get('full_name') or index_key}\n"
        f"Author: {author_login}\n"
        f"Title: {pull_request.get('title') or 'No title'}\n"
        f"State: {pull_request.get('state') or 'unknown'}\n"
        f"Created: {pull_request.get('created_at', '')}\n"
        f"Updated: {pull_request.get('updated_at', '')}\n"
        f"URL: {pull_request.get('html_url', '')}\n\n"
        f"Description:\n{pull_request.get('body') or 'No description'}\n"
    )
    if file_sections:
        content += "\nChanged files:\n\n" + "\n\n".join(file_sections)
    if len(content) > 24_000:
        content = content[:24_000] + "\n\n[PR content truncated after 24,000 characters]"

    owner = repository_owner(repo)
    return Chunk(
        repo=index_key,
        path=f"pulls/{number}",
        content=content,
        level="history",
        language="",
        metadata={
            "default_branch": repo.get("default_branch", "main"),
            "source_owner": owner,
            "source_url": pull_request.get("html_url", ""),
            "pull_number": number,
            "pull_state": pull_request.get("state", ""),
            "pull_author": author_login,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Index public GitHub repositories and authored PRs")
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--full", action="store_true", help="Rebuild every eligible source")
    mode_group.add_argument("--incremental", action="store_true", help="Index only changed sources")
    parser.add_argument("--repo", type=str, help="Index one repository name or owner/name")
    parser.add_argument("--dry-run", action="store_true", help="Do not write index files")
    parser.add_argument("--config", type=str, help="Path to the JSON configuration")
    args = parser.parse_args()

    config = IndexerConfig.from_env(args.config)
    config.dry_run = args.dry_run
    missing = config.validate()
    if missing:
        print("Configuration is incomplete:")
        for item in missing:
            print(f"  - {item}")
        sys.exit(1)

    mode = "full" if args.full else "incremental"
    print(f"Indexing public GitHub sources for {config.github_username} ({mode})")
    all_repos = get_public_repos(config)
    all_repo_keys = {repository_key(repo, config) for repo in all_repos}
    repos = all_repos

    if args.repo:
        repos = [
            repo for repo in repos
            if repo.get("name") == args.repo or repository_key(repo, config) == args.repo
        ]
        if not repos:
            print(f"Repository not found: {args.repo}")
            sys.exit(1)

    existing_state = load_index_state()
    existing_updates = existing_state.get("repo_updates", {})
    if mode == "incremental" and not args.repo:
        repos = [
            repo for repo in repos
            if existing_updates.get(repository_key(repo, config)) != repo.get("updated_at", "")
        ]

    removed_repos = set(existing_updates) - all_repo_keys
    print(f"Found {len(all_repos)} public repositories; processing {len(repos)} sources")
    if mode == "incremental" and not repos and not removed_repos:
        print("All public repositories are up to date")
        if not args.dry_run:
            prepare_vector_sync(config)
        return

    os.makedirs(config.clone_dir, exist_ok=True)
    atexit.register(cleanup_clones, config.clone_dir)
    all_chunks: list[Chunk] = []
    processed_repos: set[str] = set()
    processed_updates: dict[str, str] = {}

    for repo in repos:
        index_key = repository_key(repo, config)
        if not is_owned_by_candidate(repo, config):
            pull_requests = get_related_pull_requests(repo, config)
            processed_repos.add(index_key)
            processed_updates[index_key] = repo.get("updated_at", "")
            if not pull_requests:
                print(f"Skipping repository source for {index_key}; no authored PRs found")
                continue

            print(f"Indexing {len(pull_requests)} authored PRs for {index_key}")
            all_chunks.append(build_repository_meta_chunk(repo, index_key, len(pull_requests)))
            all_chunks.extend(
                build_pull_request_chunk(repo, index_key, pull_request)
                for pull_request in pull_requests
            )
            continue

        print(f"Indexing owned public repository: {index_key}")
        repo_dir = clone_or_pull(repo, config.clone_dir, config)
        if not repo_dir:
            continue
        processed_repos.add(index_key)
        processed_updates[index_key] = repo.get("updated_at", "")
        all_chunks.append(build_repository_meta_chunk(repo, index_key))

        files = collect_files(repo_dir, config)
        chunks = chunk_repo_files(index_key, repo_dir, files, config)
        for chunk in chunks:
            chunk.metadata.setdefault("default_branch", repo.get("default_branch", "main"))
            chunk.metadata.setdefault("source_owner", repository_owner(repo))
        all_chunks.extend(chunks)
        print(f"  Collected {len(files)} files and generated {len(chunks)} chunks")

    if not all_chunks and not processed_repos and not removed_repos:
        print("No indexable public repository content found")
        cleanup_clones(config.clone_dir)
        return

    if args.dry_run:
        print(f"Dry run complete: {len(all_chunks)} chunks would be written")
        cleanup_clones(config.clone_dir)
        return

    next_updates = {} if mode == "full" else {
        name: updated_at
        for name, updated_at in existing_updates.items()
        if name in all_repo_keys
    }
    next_updates.update(processed_updates)

    count = upsert_chunks(
        all_chunks,
        config,
        mode=mode,
        processed_repos=processed_repos,
        current_repos=all_repo_keys,
        repo_updates=next_updates,
    )
    print(f"Index now contains {count} updated chunks")

    vector_summary = prepare_vector_sync(config)
    if vector_summary.get("enabled"):
        print(
            "Vector sync plan: "
            f"upsert {vector_summary['upsert_count']}, delete {vector_summary['delete_count']}"
        )

    cleanup_clones(config.clone_dir)


if __name__ == "__main__":
    main()
