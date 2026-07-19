"""
文件过滤器 —— 决定哪些文件需要索引

规则：
1. 跳过特定目录 (.git, node_modules, ...)
2. 跳过二进制文件和大文件
3. 只索引白名单中的扩展名
4. 对 README 和配置文件始终索引
"""

import os
import fnmatch
from pathlib import Path
from config import IndexerConfig

# 始终索引的特殊文件名
ALWAYS_INCLUDE_FILES = {
    "readme.md", "readme.rst", "readme.txt",
    "readme", "license", "contributing.md",
    "changelog.md", "code_of_conduct.md",
}

# 始终索引的配置文件
ALWAYS_INCLUDE_CONFIGS = {
    "package.json", "tsconfig.json", "pyproject.toml",
    "cargo.toml", "go.mod", "build.gradle", "pom.xml",
    "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "makefile", "cmakelists.txt",
    ".eslintrc.js", ".prettierrc", ".editorconfig",
    "vite.config.ts", "webpack.config.js", "next.config.js",
    "tailwind.config.ts", "tailwind.config.js",
}


def should_skip_file(file_path: str, config: IndexerConfig) -> bool:
    """判断是否跳过某个文件"""
    path = Path(file_path)
    name_lower = path.name.lower()

    # 1. 检查是否在跳过目录中
    parts = path.parts
    for skip_dir in config.skip_dirs:
        if skip_dir in parts:
            return True

    # 2. 跳过隐藏文件（除了特殊文件）
    if path.name.startswith(".") and name_lower not in ALWAYS_INCLUDE_FILES:
        return True

    # 3. 始终包含某些文件
    if name_lower in ALWAYS_INCLUDE_FILES:
        return False
    if name_lower in ALWAYS_INCLUDE_CONFIGS:
        return False

    # 4. 检查 glob 模式
    for pattern in config.skip_patterns:
        if fnmatch.fnmatch(name_lower, pattern):
            return True

    # 5. 检查扩展名
    ext = path.suffix.lower()
    if ext and ext not in config.include_extensions:
        # 没有扩展名可能是像 Makefile 这样的特殊文件
        if ext == "":
            return False
        return True

    # 6. 检查文件大小
    try:
        size = os.path.getsize(file_path)
        if size > config.max_file_size_kb * 1024:
            return True
    except OSError:
        return True

    return False


def is_binary(file_path: str) -> bool:
    """快速检测文件是否为二进制"""
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            # 检测 null 字节
            if b"\x00" in chunk:
                return True
    except OSError:
        return True
    return False


def collect_files(
    repo_dir: str,
    config: IndexerConfig,
) -> list[str]:
    """遍历仓库目录，收集需要索引的文件"""
    files = []

    for root, dirs, filenames in os.walk(repo_dir):
        # 过滤目录
        dirs[:] = [d for d in dirs if d not in config.skip_dirs]

        for fname in filenames:
            full_path = os.path.join(root, fname)
            if should_skip_file(full_path, config):
                continue
            if is_binary(full_path):
                continue
            files.append(full_path)

    return files
