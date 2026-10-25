#!/usr/bin/env python3
"""
Cloud-Based Image Storage and Sharing System
--------------------------------------------
A standalone Cloud Object Storage service built with Python 3 standard library.
Features:
- S3-compatible Object Storage architecture
- Multi-Region Replication simulation (us-east-1, eu-west-1, ap-south-1)
- SHA-256 Data Integrity Checksumming
- Presigned Sharing URLs with expiration & password protection
- SQLite metadata store with full ACID compliance
- Zero external dependencies (runs out-of-the-box on standard Python 3)
"""

import http.server
import socketserver
import json
import os
import sys
import sqlite3
import hashlib
import uuid
import time
import mimetypes
import urllib.parse
from datetime import datetime

PORT = 5000
HOST = "0.0.0.0"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "cloud_storage")
DB_PATH = os.path.join(BASE_DIR, "cloud_metadata.db")

# Ensure storage directory exists
os.makedirs(STORAGE_DIR, exist_ok=True)

# ----------------- Database Initialization -----------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            mimetype TEXT NOT NULL,
            size INTEGER NOT NULL,
            checksum TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            region TEXT NOT NULL,
            storage_class TEXT NOT NULL,
            tags TEXT,
            replicated_regions TEXT,
            created_at INTEGER NOT NULL
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS shares (
            token TEXT PRIMARY KEY,
            image_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            password_hash TEXT,
            access_count INTEGER DEFAULT 0,
            allow_download INTEGER DEFAULT 1,
            FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ----------------- Helper Functions -----------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def format_size(bytes_num):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_num < 1024.0:
            return f"{bytes_num:.1f} {unit}"
        bytes_num /= 1024.0
    return f"{bytes_num:.1f} TB"

# ----------------- HTTP Request Handler -----------------
class CloudStorageHandler(http.server.BaseHTTPRequestHandler):

    def send_json(self, status_code, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API: List Images with filtering & stats
        if path == "/api/images":
            search = query.get("search", [""])[0].lower()
            tag = query.get("tag", [""])[0].lower()
            region = query.get("region", [""])[0]

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM images ORDER BY created_at DESC")
            rows = cur.fetchall()
            conn.close()

            items = []
            for r in rows:
                tags = json.loads(r["tags"]) if r["tags"] else []
                item = {
                    "id": r["id"],
                    "filename": r["filename"],
                    "mimetype": r["mimetype"],
                    "size": r["size"],
                    "formatted_size": format_size(r["size"]),
                    "checksum": r["checksum"],
                    "region": r["region"],
                    "storage_class": r["storage_class"],
                    "tags": tags,
                    "replicated_regions": json.loads(r["replicated_regions"]),
                    "created_at": r["created_at"],
                    "created_date": datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M:%S")
                }
                # Filter match
                if search and (search not in item["filename"].lower() and search not in item["checksum"].lower()):
                    continue
                if tag and (tag not in [t.lower() for t in tags]):
                    continue
                if region and region != "all" and item["region"] != region:
                    continue
                items.append(item)

            self.send_json(200, {"success": True, "count": len(items), "images": items})
            return

        # 2. API: Cloud Storage Metrics & SLA stats
        elif path == "/api/stats":
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*), COALESCE(SUM(size), 0) FROM images")
            total_count, total_size = cur.fetchone()

            cur.execute("SELECT region, COUNT(*), COALESCE(SUM(size), 0) FROM images GROUP BY region")
            region_stats = {row[0]: {"count": row[1], "size": row[2]} for row in cur.fetchall()}

            cur.execute("SELECT COUNT(*) FROM shares")
            total_shares = cur.fetchone()[0]
            conn.close()

            # Quota allocation: 500 MB mock free-tier
            MAX_QUOTA = 500 * 1024 * 1024
            self.send_json(200, {
                "success": True,
                "total_objects": total_count,
                "total_size_bytes": total_size,
                "total_size_formatted": format_size(total_size),
                "quota_bytes": MAX_QUOTA,
                "quota_formatted": format_size(MAX_QUOTA),
                "used_percentage": round((total_size / MAX_QUOTA) * 100, 2) if MAX_QUOTA > 0 else 0,
                "total_shares": total_shares,
                "uptime": "99.995%",
                "region_distribution": region_stats
            })
            return

        # 3. API: Serve Binary Image by ID
        elif path.startswith("/api/raw/"):
            image_id = path.split("/api/raw/")[1]
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM images WHERE id = ?", (image_id,))
            img = cur.fetchone()
            conn.close()

            if not img or not os.path.exists(img["storage_path"]):
                self.send_json(404, {"error": "Image not found on cloud storage"})
                return

            try:
                with open(img["storage_path"], "rb") as f:
                    file_bytes = f.read()

                self.send_response(200)
                self.send_header("Content-Type", img["mimetype"])
                self.send_header("Content-Length", str(len(file_bytes)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Disposition", f'inline; filename="{img["filename"]}"')
                self.end_headers()
                self.wfile.write(file_bytes)
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        # 4. API: Resolve Presigned Share Link
        elif path.startswith("/api/share/"):
            token = path.split("/api/share/")[1]
            pwd_candidate = query.get("p", [""])[0]

            conn = get_db()
            cur = conn.cursor()
            cur.execute('''
                SELECT s.*, i.filename, i.mimetype, i.size, i.checksum, i.region, i.storage_path
                FROM shares s
                JOIN images i ON s.image_id = i.id
                WHERE s.token = ?
            ''', (token,))
            share = cur.fetchone()

            if not share:
                conn.close()
                self.send_json(404, {"error": "Invalid or non-existent share link"})
                return

            now = int(time.time())
            if share["expires_at"] and now > share["expires_at"]:
                conn.close()
                self.send_json(410, {"error": "This presigned share link has expired"})
                return

            has_password = bool(share["password_hash"])
            if has_password:
                candidate_hash = hashlib.sha256(pwd_candidate.encode("utf-8")).hexdigest()
                if candidate_hash != share["password_hash"]:
                    conn.close()
                    self.send_json(401, {
                        "error": "Password required",
                        "password_required": True,
                        "filename": share["filename"]
                    })
                    return

            # Increment access count
            cur.execute("UPDATE shares SET access_count = access_count + 1 WHERE token = ?", (token,))
            conn.commit()
            conn.close()

            # Serve metadata or preview
            self.send_json(200, {
                "success": True,
                "image_id": share["image_id"],
                "filename": share["filename"],
                "mimetype": share["mimetype"],
                "size": share["size"],
                "formatted_size": format_size(share["size"]),
                "region": share["region"],
                "allow_download": bool(share["allow_download"]),
                "expires_at": share["expires_at"],
                "access_count": share["access_count"] + 1,
                "raw_url": f"/api/raw/{share['image_id']}"
            })
            return

        # 5. Static Files Serving (index.html, style.css, app.js)
        if path == "/" or path == "/index.html":
            self.serve_static_file(os.path.join(BASE_DIR, "index.html"), "text/html")
        elif path == "/style.css":
            self.serve_static_file(os.path.join(BASE_DIR, "style.css"), "text/css")
        elif path == "/app.js":
            self.serve_static_file(os.path.join(BASE_DIR, "app.js"), "application/javascript")
        else:
            # Fallback to index.html for client-side routing
            self.serve_static_file(os.path.join(BASE_DIR, "index.html"), "text/html")

    def serve_static_file(self, file_path, content_type):
        if not os.path.exists(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            return

        with open(file_path, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. API: Upload Image
        if path == "/api/upload":
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", 0))

            if content_length > 25 * 1024 * 1024:  # 25 MB limit
                self.send_json(413, {"error": "File size exceeds maximum 25 MB limit"})
                return

            raw_body = self.rfile.read(content_length)

            if "application/json" in content_type:
                try:
                    payload = json.loads(raw_body.decode("utf-8"))
                    filename = payload.get("filename", "uploaded_image.png")
                    base64_data = payload.get("data", "")
                    region = payload.get("region", "us-east-1")
                    storage_class = payload.get("storage_class", "STANDARD")
                    tags = payload.get("tags", ["General"])

                    import base64
                    if "," in base64_data:
                        base64_data = base64_data.split(",", 1)[1]
                    file_bytes = base64.b64decode(base64_data)

                    # Compute SHA-256 for integrity verification
                    checksum = hashlib.sha256(file_bytes).hexdigest()
                    image_id = str(uuid.uuid4())
                    ext = os.path.splitext(filename)[1].lower() or ".png"
                    safe_storage_name = f"{image_id}{ext}"
                    storage_path = os.path.join(STORAGE_DIR, safe_storage_name)

                    with open(storage_path, "wb") as f:
                        f.write(file_bytes)

                    mimetype = mimetypes.guess_type(filename)[0] or "image/png"
                    created_at = int(time.time())

                    # Simulate replication to other regions
                    all_regions = ["us-east-1", "eu-west-1", "ap-south-1"]
                    replicated = [r for r in all_regions if r != region]

                    conn = get_db()
                    cur = conn.cursor()
                    cur.execute('''
                        INSERT INTO images (id, filename, mimetype, size, checksum, storage_path, region, storage_class, tags, replicated_regions, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (image_id, filename, mimetype, len(file_bytes), checksum, storage_path, region, storage_class, json.dumps(tags), json.dumps(replicated), created_at))
                    conn.commit()
                    conn.close()

                    self.send_json(201, {
                        "success": True,
                        "message": "Image successfully stored and replicated across cloud regions.",
                        "image": {
                            "id": image_id,
                            "filename": filename,
                            "size": len(file_bytes),
                            "checksum": checksum,
                            "region": region,
                            "replicated_regions": replicated,
                            "storage_class": storage_class
                        }
                    })
                    return
                except Exception as e:
                    self.send_json(400, {"error": f"Upload processing failed: {str(e)}"})
                    return
            else:
                self.send_json(400, {"error": "Content-Type must be application/json"})
                return

        # 2. API: Generate Presigned Sharing Link
        elif path == "/api/share":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                image_id = payload.get("image_id")
                duration_hours = int(payload.get("duration_hours", 24))  # 0 for never
                password = payload.get("password", "").strip()
                allow_download = 1 if payload.get("allow_download", True) else 0

                conn = get_db()
                cur = conn.cursor()
                cur.execute("SELECT id FROM images WHERE id = ?", (image_id,))
                if not cur.fetchone():
                    conn.close()
                    self.send_json(404, {"error": "Image not found"})
                    return

                token = hashlib.sha256(f"{image_id}{time.time()}{uuid.uuid4()}".encode("utf-8")).hexdigest()[:24]
                created_at = int(time.time())
                expires_at = (created_at + (duration_hours * 3600)) if duration_hours > 0 else None
                password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest() if password else None

                cur.execute('''
                    INSERT INTO shares (token, image_id, created_at, expires_at, password_hash, allow_download)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (token, image_id, created_at, expires_at, password_hash, allow_download))
                conn.commit()
                conn.close()

                self.send_json(201, {
                    "success": True,
                    "token": token,
                    "share_url": f"/?share={token}",
                    "expires_at": expires_at,
                    "has_password": bool(password_hash),
                    "allow_download": bool(allow_download)
                })
                return
            except Exception as e:
                self.send_json(400, {"error": str(e)})
                return

        self.send_json(404, {"error": "API route not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/image/"):
            image_id = path.split("/api/image/")[1]
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT storage_path FROM images WHERE id = ?", (image_id,))
            img = cur.fetchone()

            if not img:
                conn.close()
                self.send_json(404, {"error": "Image not found"})
                return

            # Remove file from storage
            if os.path.exists(img["storage_path"]):
                try:
                    os.remove(img["storage_path"])
                except Exception:
                    pass

            cur.execute("DELETE FROM shares WHERE image_id = ?", (image_id,))
            cur.execute("DELETE FROM images WHERE id = ?", (image_id,))
            conn.commit()
            conn.close()

            self.send_json(200, {"success": True, "message": "Object deleted from cloud storage"})
            return

        self.send_json(404, {"error": "API route not found"})

# ----------------- Server Runner -----------------
def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((HOST, PORT), CloudStorageHandler) as httpd:
        print("=" * 60)
        print(" [CLOUD COMPUTING PROJECT]")
        print(" Cloud-Based Image Storage and Sharing System")
        print("=" * 60)
        print(f" -> Server running locally at: http://localhost:{PORT}")
        print(f" -> Object Storage Directory: {STORAGE_DIR}")
        print(f" -> Metadata Database:        {DB_PATH}")
        print(" -> Cloud Regions simulated:   us-east-1, eu-west-1, ap-south-1")
        print("=" * 60)
        print(" Press Ctrl+C to terminate the server.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down cloud storage server.")
            httpd.server_close()

if __name__ == "__main__":
    run_server()
