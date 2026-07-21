"""
用户配置 —— 仓库列表、分块参数、API Keys 等

所有敏感信息从环境变量读取，非敏感信息可通过命令行参数覆盖。
"""

import os
import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class IndexerConfig:
    """索引器全局配置"""

    # ===== GitHub =====
    github_username: str = ""
    github_token: str = ""
    # 仓库模式：all_public 或 listed
    repo_mode: str = "all_public"
    # 排除的仓库名
    repo_exclude: list[str] = field(default_factory=lambda: ["dotfiles"])
    # 明确包含的仓库（repo_mode=listed 时使用）
    repo_include: list[str] = field(default_factory=list)

    # ===== 分块参数 =====
    chunk_size_tokens: int = 500       # 目标 chunk 大小（tokens）
    chunk_overlap_tokens: int = 50     # 相邻 chunk 重叠量（tokens）
    max_file_size_kb: int = 200        # 跳过超过此大小的文件

    # ===== 文件过滤 =====
    # 始终跳过的目录
    skip_dirs: list[str] = field(default_factory=lambda: [
        ".git", "node_modules", "__pycache__", ".venv", "venv",
        ".next", ".nuxt", "dist", "build", "target",
        ".turbo", ".cache", "coverage", ".nyc_output",
        ".idea", ".vscode", ".claude", ".codex",
    ])
    # 始终跳过的文件模式（glob）
    skip_patterns: list[str] = field(default_factory=lambda: [
        "*.min.js", "*.min.css", "*.map", "*.lock",
        "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.svg",
        "*.woff", "*.woff2", "*.ttf", "*.eot",
        "*.zip", "*.tar", "*.gz", "*.7z",
        "*.pdf", "*.doc", "*.docx", "*.xlsx",
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ])
    # 索引的文件扩展名
    include_extensions: list[str] = field(default_factory=lambda: [
        ".py", ".js", ".ts", ".tsx", ".jsx", ".vue", ".svelte",
        ".java", ".kt", ".scala",
        ".cs", ".fs", ".vb",
        ".go", ".rs", ".zig",
        ".c", ".cpp", ".h", ".hpp",
        ".rb", ".php", ".swift",
        ".sql", ".sh", ".bash", ".ps1",
        ".yaml", ".yml", ".toml", ".ini", ".cfg",
        ".md", ".mdx", ".rst", ".txt",
        ".json", ".xml", ".graphql",
        ".css", ".scss", ".less",
        ".dockerfile", ".makefile", ".cmake",
    ])

    # ===== 运行参数 =====
    clone_dir: str = field(default_factory=lambda: str(Path(__file__).resolve().parent / "_clones"))
    dry_run: bool = False              # 只扫描不写入

    @classmethod
    def from_env(cls, config_path: str | None = None) -> "IndexerConfig":
        """从环境变量和可选的 JSON 配置文件加载配置"""
        cfg = cls()

        # 1. 尝试读取 JSON 配置文件
        if config_path is None:
            # 寻找项目根目录的 config.json
            root = Path(__file__).resolve().parent.parent
            config_path = str(root / "config.json")

        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                json_cfg = json.load(f)
            cfg.github_username = json_cfg.get("github_username", "")
            repo_section = json_cfg.get("repos", {})
            cfg.repo_mode = repo_section.get("mode", "all_public")
            cfg.repo_exclude = repo_section.get("exclude", ["dotfiles"])
            cfg.repo_include = repo_section.get("include", [])

        # 2. 环境变量覆盖敏感信息
        cfg.github_token = os.getenv("GITHUB_TOKEN", os.getenv("GH_TOKEN", ""))
        # 2. 环境变量也覆盖非敏感配置
        cfg.github_username = os.getenv("GITHUB_USERNAME", cfg.github_username)

        return cfg

    def validate(self) -> list[str]:
        """验证必需的配置项，返回缺失项列表"""
        missing = []
        if self.repo_mode == "all_public" and not self.github_username:
            missing.append("github_username: 需要 GitHub 用户名来拉取公开仓库")
        if self.repo_mode == "listed" and not self.repo_include:
            missing.append("repo_include: 在 listed 模式下需要指定仓库列表")
        return missing
