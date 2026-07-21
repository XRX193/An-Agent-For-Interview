import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

INDEXER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(INDEXER_DIR))

from chunker import Chunk, _chunk_by_blank_lines
from config import IndexerConfig
from filters import should_skip_file
from upsert import chunks_to_json, upsert_chunks
from cloner import clone_or_pull
import run


class ChunkerTests(unittest.TestCase):
    def test_chunk_cursor_finishes_without_tiny_tail_cascade(self):
        lines = []
        for index in range(80):
            lines.extend([f"def function_{index}():", f"    return {index}", ""])

        config = IndexerConfig(chunk_size_tokens=60, chunk_overlap_tokens=8)
        chunks = _chunk_by_blank_lines("demo", "app.py", lines, "python", config)
        ranges = [(chunk.start_line, chunk.end_line) for chunk in chunks]

        self.assertEqual(chunks[-1].end_line, len(lines))
        self.assertEqual(len(ranges), len(set(ranges)))
        self.assertTrue(all(left[0] < right[0] for left, right in zip(ranges, ranges[1:])))
        self.assertLess(sum(len(chunk.content) < 20 for chunk in chunks), 2)

    def test_serialized_chunks_have_stable_ids_and_metadata(self):
        chunk = Chunk(
            repo="demo",
            path="src\\app.py",
            content="print('ok')",
            level="code",
            start_line=3,
            end_line=3,
            metadata={"default_branch": "develop"},
        )

        first = chunks_to_json([chunk])[0]
        second = chunks_to_json([chunk])[0]
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["path"], "src/app.py")
        self.assertEqual(first["metadata"]["default_branch"], "develop")


class IndexMergeTests(unittest.TestCase):
    def test_incremental_write_replaces_only_processed_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "search_index.json"
            output.write_text(json.dumps({
                "chunks": [
                    {"id": "old", "repo": "changed", "path": "old.py", "content": "old"},
                    {"id": "keep", "repo": "stable", "path": "keep.py", "content": "keep"},
                ],
                "repo_updates": {"changed": "old", "stable": "same"},
            }), encoding="utf-8")
            replacement = Chunk("changed", "new.py", "new", "code", start_line=1, end_line=1)

            with patch("upsert.index_path", return_value=str(output)):
                upsert_chunks(
                    [replacement],
                    IndexerConfig(),
                    mode="incremental",
                    processed_repos={"changed"},
                    current_repos={"changed", "stable"},
                    repo_updates={"changed": "new", "stable": "same"},
                )

            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual({item["path"] for item in data["chunks"]}, {"new.py", "keep.py"})
            self.assertEqual(data["repo_updates"]["changed"], "new")

    def test_ide_directories_are_skipped(self):
        config = IndexerConfig()
        self.assertTrue(should_skip_file(str(Path("repo") / ".idea" / "workspace.xml"), config))

    def test_public_clone_does_not_put_token_in_remote_url(self):
        with tempfile.TemporaryDirectory() as directory:
            config = IndexerConfig(github_token="sensitive-token")
            repo = {"name": "demo", "clone_url": "https://github.com/candidate/demo.git"}
            with patch("cloner.subprocess.run") as subprocess_run:
                clone_or_pull(repo, directory, config)

            command = subprocess_run.call_args.args[0]
            self.assertNotIn("sensitive-token", " ".join(command))
            self.assertIn(repo["clone_url"], command)

    def test_dry_run_never_writes_the_index(self):
        with tempfile.TemporaryDirectory() as directory:
            config = IndexerConfig(github_username="candidate", clone_dir=directory)
            repo = {
                "name": "demo",
                "description": "Demo",
                "language": "Python",
                "clone_url": "https://github.com/candidate/demo.git",
                "updated_at": "2026-07-21T00:00:00Z",
                "default_branch": "main",
            }
            with (
                patch("run.IndexerConfig.from_env", return_value=config),
                patch("run.get_public_repos", return_value=[repo]),
                patch("run.load_index_state", return_value={"chunks": [], "repo_updates": {}}),
                patch("run.clone_or_pull", return_value=directory),
                patch("run.collect_files", return_value=[]),
                patch("run.cleanup_clones"),
                patch("run.atexit.register"),
                patch("run.upsert_chunks") as write_index,
                patch.object(sys, "argv", ["run.py", "--full", "--dry-run"]),
            ):
                run.main()

            write_index.assert_not_called()


if __name__ == "__main__":
    unittest.main()
