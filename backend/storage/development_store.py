"""
Persistent development storage backed by SQLite.

Replaces the previous in-memory ``_in_memory_developments`` dict so that
developments survive server restarts. Uses only the standard library to
avoid adding a heavy ORM dependency.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "developments.db"

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock:
        conn = _connect()
        try:
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS developments (
                        development_id TEXT PRIMARY KEY,
                        development_type TEXT NOT NULL,
                        name TEXT NOT NULL DEFAULT '',
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        area REAL NOT NULL DEFAULT 0,
                        height REAL NOT NULL DEFAULT 0,
                        floors INTEGER NOT NULL DEFAULT 1,
                        capacity REAL NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'proposed',
                        zone_id TEXT NOT NULL DEFAULT '',
                        properties TEXT NOT NULL DEFAULT '{}',
                        created_at TEXT NOT NULL
                    )
                    """
                )
        finally:
            conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    try:
        data["properties"] = json.loads(data["properties"] or "{}")
    except json.JSONDecodeError:
        data["properties"] = {}
    return data


def create_development(dev: dict) -> dict:
    dev_id = dev.get("development_id") or str(uuid.uuid4())
    with _lock:
        conn = _connect()
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO developments (
                        development_id, development_type, name, latitude, longitude,
                        area, height, floors, capacity, status, zone_id, properties,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        dev_id,
                        dev.get("development_type", ""),
                        dev.get("name", ""),
                        float(dev.get("latitude", 0)),
                        float(dev.get("longitude", 0)),
                        float(dev.get("area", 0)),
                        float(dev.get("height", 0)),
                        int(dev.get("floors", 1)),
                        float(dev.get("capacity", 0)),
                        dev.get("status", "proposed"),
                        dev.get("zone_id", ""),
                        json.dumps(dev.get("properties", {}), ensure_ascii=False),
                        dev.get("created_at", ""),
                    ),
                )
        finally:
            conn.close()
    return get_development(dev_id)


def get_development(dev_id: str) -> dict | None:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT * FROM developments WHERE development_id = ?",
                (dev_id,),
            ).fetchone()
        finally:
            conn.close()
    return _row_to_dict(row) if row else None


def list_developments() -> list[dict]:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT * FROM developments ORDER BY created_at",
            ).fetchall()
        finally:
            conn.close()
    return [_row_to_dict(r) for r in rows]


def update_development(dev_id: str, dev: dict) -> dict | None:
    with _lock:
        conn = _connect()
        try:
            existing = get_development(dev_id)
            if not existing:
                return None
            with conn:
                conn.execute(
                    """
                    UPDATE developments SET
                        development_type = ?,
                        name = ?,
                        latitude = ?,
                        longitude = ?,
                        area = ?,
                        height = ?,
                        floors = ?,
                        capacity = ?,
                        status = ?,
                        zone_id = ?,
                        properties = ?
                    WHERE development_id = ?
                    """,
                    (
                        dev.get("development_type", existing.get("development_type", "")),
                        dev.get("name", existing.get("name", "")),
                        float(dev.get("latitude", existing.get("latitude", 0))),
                        float(dev.get("longitude", existing.get("longitude", 0))),
                        float(dev.get("area", existing.get("area", 0))),
                        float(dev.get("height", existing.get("height", 0))),
                        int(dev.get("floors", existing.get("floors", 1))),
                        float(dev.get("capacity", existing.get("capacity", 0))),
                        dev.get("status", existing.get("status", "proposed")),
                        dev.get("zone_id", existing.get("zone_id", "")),
                        json.dumps(dev.get("properties", existing.get("properties", {})), ensure_ascii=False),
                        dev_id,
                    ),
                )
        finally:
            conn.close()
    return get_development(dev_id)


def delete_development(dev_id: str) -> bool:
    with _lock:
        conn = _connect()
        try:
            with conn:
                cur = conn.execute(
                    "DELETE FROM developments WHERE development_id = ?",
                    (dev_id,),
                )
                return cur.rowcount > 0
        finally:
            conn.close()


def count_developments() -> int:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM developments",
            ).fetchone()
            return int(row["n"]) if row else 0
        finally:
            conn.close()
