"""
代码分块器 —— 按文件类型智能切分

分块策略（按层级）：
  - L1 项目级：README、项目描述 → 整个文件一块
  - L2 架构级：package.json、配置文件 → 整个文件一块
  - L3 代码级：源文件 → 按函数/类边界切分 (~500-1000 tokens)
  - L4 历史级：commit messages → 按条目切分

分块原则：
  1. 尽可能在自然边界（函数定义、类定义）处切分
  2. 控制每块大小在 300-1500 tokens 范围
  3. 相邻块保留少量重叠（保留上下文连贯性）
  4. 每个块保留元数据：仓库名、文件路径、行号范围、语言
"""

import os
import re
from pathlib import Path
from config import IndexerConfig

# ===== 近似 Token 计数 =====
# 英文：~4 字符/token；中文：~1.5 字符/token
# 保守估计 3 字符/token
CHARS_PER_TOKEN = 3

# ===== 始终整文件索引的（项目级/架构级） =====
WHOLE_FILE_PATTERNS = [
    "readme.md", "readme.rst", "readme.txt", "readme",
    "license", "changelog.md", "contributing.md",
    "package.json", "tsconfig.json", "pyproject.toml",
    "cargo.toml", "go.mod", "build.gradle", "pom.xml",
    "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "makefile", "cmakelists.txt",
    ".eslintrc.js", ".prettierrc", ".editorconfig",
    "vite.config.ts", "webpack.config.js", "next.config.js",
    "tailwind.config.ts", "tailwind.config.js",
]


class Chunk:
    """代码块"""

    def __init__(
        self,
        repo: str,
        path: str,
        content: str,
        level: str,
        language: str = "",
        start_line: int = 0,
        end_line: int = 0,
        metadata: dict | None = None,
    ):
        self.repo = repo
        self.path = path
        self.content = content
        self.level = level       # "project" | "architecture" | "code" | "history"
        self.language = language
        self.start_line = start_line
        self.end_line = end_line
        self.metadata = metadata or {}

    def to_dict(self) -> dict:
        return {
            "repo": self.repo,
            "path": self.path,
            "content": self.content,
            "level": self.level,
            "language": self.language,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "metadata": self.metadata,
        }

    def __repr__(self) -> str:
        return f"Chunk({self.level}: {self.repo}/{self.path} L{self.start_line}-{self.end_line})"


def chunk_repo_files(
    repo_name: str,
    repo_dir: str,
    file_paths: list[str],
    config: IndexerConfig,
) -> list[Chunk]:
    """对仓库的所有文件进行分块"""
    chunks: list[Chunk] = []

    for file_path in file_paths:
        try:
            rel_path = os.path.relpath(file_path, repo_dir)
            file_name = os.path.basename(file_path).lower()

            # 确定层级
            if file_name in WHOLE_FILE_PATTERNS:
                # 项目级（README 等）和架构级（配置文件）
                level = "project" if file_name.startswith("readme") else "architecture"
                chunk = _chunk_whole_file(repo_name, rel_path, file_path, level)
                if chunk:
                    chunks.append(chunk)
            else:
                # 代码级
                code_chunks = _chunk_source_file(repo_name, rel_path, file_path, config)
                chunks.extend(code_chunks)

        except Exception as e:
            print(f"    ⚠️  分块失败 {rel_path}: {e}")
            continue

    return chunks


def _chunk_whole_file(
    repo: str,
    rel_path: str,
    file_path: str,
    level: str,
) -> Chunk | None:
    """整文件作为一个块"""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        if not content.strip():
            return None

        # 截断过大的文件
        max_chars = 6000 * CHARS_PER_TOKEN  # ~6000 tokens
        if len(content) > max_chars:
            content = content[:max_chars] + "\n\n... (内容已截断)"

        lines = content.split("\n")
        return Chunk(
            repo=repo,
            path=rel_path,
            content=content,
            level=level,
            language=_detect_language(rel_path),
            start_line=1,
            end_line=len(lines),
        )
    except OSError:
        return None


def _chunk_source_file(
    repo: str,
    rel_path: str,
    file_path: str,
    config: IndexerConfig,
) -> list[Chunk]:
    """按函数/类边界切分源文件"""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return []

    if not content.strip():
        return []

    lines = content.split("\n")
    language = _detect_language(rel_path)

    # 尝试用 AST 感知的方式切分，失败则按段落切分
    chunks = _chunk_by_blank_lines(
        repo, rel_path, lines, language, config, "code"
    )

    return chunks


def _chunk_by_blank_lines(
    repo: str,
    rel_path: str,
    lines: list[str],
    language: str,
    config: IndexerConfig,
    level: str = "code",
) -> list[Chunk]:
    """
    按空行 + 注释/函数/类声明边界切分

    策略：
    1. 在可能的结构边界（函数/类定义前、连续空行后）处切分
    2. 控制每块不超过目标大小的 2 倍
    3. 相邻块有少量重叠
    """
    max_chars = config.chunk_size_tokens * CHARS_PER_TOKEN
    overlap_chars = config.chunk_overlap_tokens * CHARS_PER_TOKEN

    # 先找边界行（结构声明行）
    boundary_indices = _find_boundaries(lines, language)

    chunks: list[Chunk] = []
    start = 0

    while start < len(lines):
        end = min(start + max(10, max_chars // max(1, sum(len(l) for l in lines[start:start + 50]) // 50)), len(lines))

        # 在 max_chars 范围内找最合适的断点
        best_end = start + 1
        for i in range(start + 1, end):
            if i in boundary_indices:
                best_end = i
            if i - start > max_chars // CHARS_PER_TOKEN:
                break

        # 如果找不到自然边界，按字符数强制切
        if best_end <= start + 1:
            char_count = 0
            for i in range(start, end):
                char_count += len(lines[i]) + 1
                if char_count > max_chars:
                    best_end = i
                    break
            else:
                best_end = end

        # 提取内容
        chunk_lines = lines[start:best_end]
        chunk_text = "\n".join(chunk_lines).strip()

        if chunk_text:
            chunks.append(Chunk(
                repo=repo,
                path=rel_path,
                content=chunk_text,
                level=level,
                language=language,
                start_line=start + 1,
                end_line=best_end,
            ))

        # 下一块从 (best_end - overlap) 开始
        overlap_lines = max(1, overlap_chars // max(1, sum(len(l) for l in lines[:min(10, len(lines))]) // 10))
        start = max(best_end - overlap_lines, start + 1)
        if start >= len(lines):
            break

    return chunks


def _find_boundaries(lines: list[str], language: str) -> set[int]:
    """找出可能的结构边界行"""
    boundaries: set[int] = set()

    patterns = [
        # 函数/类定义
        r"^\s*(def |class |async def |fn |func |function |public |private |protected |static )",
        # 接口/枚举
        r"^\s*(interface |enum |struct |impl |trait |type )",
        # 导出
        r"^\s*(export |module |namespace )",
        # 装饰器/注解
        r"^\s*(@\w+|#\[|//=)",
        # 注释分隔线
        r"^\s*(//=+|#=+|/\*=+)",
        # import 块结束后的空行后
        r"^$",
    ]

    for i, line in enumerate(lines):
        for pattern in patterns:
            if re.search(pattern, line):
                boundaries.add(i)
                break

    return boundaries


def _detect_language(file_path: str) -> str:
    """根据文件扩展名检测编程语言"""
    ext = Path(file_path).suffix.lower()
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".jsx": "javascript",
        ".vue": "vue",
        ".svelte": "svelte",
        ".java": "java",
        ".kt": "kotlin",
        ".scala": "scala",
        ".cs": "csharp",
        ".fs": "fsharp",
        ".go": "go",
        ".rs": "rust",
        ".zig": "zig",
        ".c": "c",
        ".cpp": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".rb": "ruby",
        ".php": "php",
        ".swift": "swift",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".ps1": "powershell",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".json": "json",
        ".xml": "xml",
        ".graphql": "graphql",
        ".css": "css",
        ".scss": "scss",
        ".less": "less",
        ".md": "markdown",
        ".mdx": "markdown",
        ".rst": "restructuredtext",
    }
    name = Path(file_path).name.lower()
    if name in ("dockerfile",):
        return "dockerfile"
    if name in ("makefile", "cmakelists.txt"):
        return "makefile"

    return mapping.get(ext, "")
