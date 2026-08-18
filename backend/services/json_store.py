"""
Safe read/write helpers for the JSON config-like files (settings, budget).

Writes are atomic (write to temp file, then replace) so a crash mid-write
never corrupts the JSON on disk.
"""
import json
import os
from pathlib import Path
from typing import Any, Dict


def read_json(path: Path, default: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        write_json(path, default)
        return default
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            # Corrupt file - back it up and reset to default rather than crash.
            backup = path.with_suffix(path.suffix + ".bak")
            path.replace(backup)
            write_json(path, default)
            return default


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    os.replace(tmp_path, path)
