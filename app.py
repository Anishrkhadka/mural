from __future__ import annotations
from flask import Flask, render_template, jsonify, request, send_from_directory, abort
from pathlib import Path
import json
import time
import os

app = Flask(__name__, static_folder="static", template_folder="templates")

# Paths
APP_DIR = Path(__file__).parent.resolve()
WALLPAPER_DIR = (APP_DIR / "wallpapers").resolve()
DATA_DIR = (APP_DIR / "data").resolve()
SETTINGS_FILE = DATA_DIR / "settings.json"

# Config
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
DEFAULT_SETTINGS = {
    "duration_seconds": 10,
    "shuffle": True,
    "fit_mode": "cover",   # cover | contain | actual
    "order_by": "name",    # name | mtime
    "hide_cursor_after_ms": 3000,
    "preload_next": True
}

# Ensure dirs exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
WALLPAPER_DIR.mkdir(parents=True, exist_ok=True)

def load_settings():
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {**DEFAULT_SETTINGS, **data}
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings(new_settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_settings, f, indent=2, ensure_ascii=False)

def list_images(order_by: str = "name"):
    if not WALLPAPER_DIR.exists():
        return []
    files = []
    for p in WALLPAPER_DIR.rglob("*"):
        if p.is_file() and p.suffix.lower() in ALLOWED_EXTS:
            rel = p.relative_to(WALLPAPER_DIR).as_posix()
            files.append({
                "path": rel,
                "name": p.name,
                "mtime": p.stat().st_mtime
            })
    if order_by == "mtime":
        files.sort(key=lambda x: x["mtime"])
    else:
        files.sort(key=lambda x: x["path"].lower())
    return [f"/images/{f['path']}" for f in files]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/settings")
def settings_page():
    return render_template("settings.html")

# Serve image files (supports subfolders)
@app.route("/images/<path:filename>")
def images(filename: str):
    safe_path = (WALLPAPER_DIR / filename).resolve()
    if WALLPAPER_DIR not in safe_path.parents and safe_path != WALLPAPER_DIR:
        abort(403)
    if not safe_path.exists():
        abort(404)
    # Let Flask set sensible cache headers; ETags help with client caching
    return send_from_directory(WALLPAPER_DIR, filename)

# APIs
@app.route("/api/images")
def api_images():
    settings = load_settings()
    imgs = list_images(order_by=settings.get("order_by", "name"))
    return jsonify({
        "images": imgs,
        "count": len(imgs),
        "generated_at": int(time.time())
    })

def _coerce_bool(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "yes", "on"}
    return bool(v)

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "GET":
        return jsonify(load_settings())
    # POST: validate & persist
    payload = request.get_json(silent=True) or {}
    s = load_settings()

    # Validate
    try:
        if "duration_seconds" in payload:
            d = int(payload["duration_seconds"])
            if d < 1 or d > 3600:
                return jsonify({"error": "duration_seconds must be 1–3600"}), 400
            s["duration_seconds"] = d
        if "shuffle" in payload:
            s["shuffle"] = _coerce_bool(payload["shuffle"])
        if "fit_mode" in payload:
            if payload["fit_mode"] not in {"cover", "contain", "actual"}:
                return jsonify({"error": "fit_mode must be cover|contain|actual"}), 400
            s["fit_mode"] = payload["fit_mode"]
        if "order_by" in payload:
            if payload["order_by"] not in {"name", "mtime"}:
                return jsonify({"error": "order_by must be name|mtime"}), 400
            s["order_by"] = payload["order_by"]
        if "hide_cursor_after_ms" in payload:
            s["hide_cursor_after_ms"] = max(0, int(payload["hide_cursor_after_ms"]))
        if "preload_next" in payload:
            s["preload_next"] = _coerce_bool(payload["preload_next"])
    except ValueError:
        return jsonify({"error": "Invalid data types in settings"}), 400

    save_settings(s)
    return jsonify(s), 200

# Health check
@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok", "images_dir": str(WALLPAPER_DIR), "data_dir": str(DATA_DIR)})

if __name__ == "__main__":
    # Dev server (Docker uses Gunicorn from Dockerfile CMD)
    app.run(host="0.0.0.0", port=8000, debug=True)
