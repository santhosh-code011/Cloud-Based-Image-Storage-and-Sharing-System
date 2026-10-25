# Cloud-Based Image Storage and Sharing System (CloudVault)

A high-performance, distributed, and secure Cloud Object Storage and Sharing platform built for Cloud Computing demonstrations, academic coursework, and production-grade portfolios.

---

## 📌 Project Overview
Modern web applications require scalable and fault-tolerant storage solutions rather than traditional monolithic file systems. **CloudVault** implements an **Amazon S3-compatible Object Storage architecture** combined with a secure **Presigned URL Tokenization Sharing Engine**.

### 🌟 Key Features
- **Object Storage Architecture:** Flat-namespace storage decoupling the data plane (binary payloads) from the control plane (ACID metadata catalog).
- **Multi-Region Cross-Zone Replication:** Simulates active-active replication across three availability regions: `ap-south-1` (Mumbai), `us-east-1` (N. Virginia), and `eu-west-1` (Ireland).
- **Cryptographic Data Integrity (SHA-256):** Calculates bit-level SHA-256 hashes during byte transmission to prevent bit-rot and ensure zero data tampering.
- **Presigned URLs with Expiration:** Generates temporary, cryptographically signed URLs for third-party access without exposing storage credentials.
- **Zero-Trust Access Control:** Optional password protection for shared assets with view-only or download permissions.
- **Dynamic QR Code Generation:** Client-side vector canvas QR codes for instant mobile sharing.
- **Cloud Metrics & Quota Management:** Live telemetry for allocated storage capacity, quota usage, object counts, and 99.99% SLA availability.
- **Ultra-Clean Single-Repository Structure:** Exactly **7 modular files** with **zero external dependencies** — instant `git push` to GitHub without massive `node_modules` folders!

---

## 🏗️ System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │                 Client Web App               │
                  │   (Glassmorphic Dashboard, Drag-Drop Uploader)│
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP REST API
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         Cloud Storage Gateway Server         │
                  │                 (server.py)                  │
                  └───────┬──────────────────────────────┬───────┘
                          │                              │
         Metadata Catalog │                              │ Binary Payload
       (Control Plane)    │                              │ (Data Plane)
                          ▼                              ▼
             ┌─────────────────────────┐    ┌─────────────────────────┐
             │ SQLite Metadata Store   │    │ Distributed Object      │
             │ - SHA-256 Checksums     │    │ Storage Directory       │
             │ - Presigned Tokens      │    │ (cloud_storage/)        │
             │ - Access Expirations    │    └────────────┬────────────┘
             └─────────────────────────┘                 │
                                            ┌────────────┴────────────┐
                                            ▼                         ▼
                                     [us-east-1] Replica       [eu-west-1] Replica
```

---

## 📁 Repository Structure (Exactly 7 Files)

```
Cloud-Based Image Storage and Sharing System/
├── server.py              # Zero-dependency Cloud Backend & REST API Server
├── index.html             # Modern Glassmorphic Cloud Dashboard & UI
├── style.css              # Cyberpunk / Cloud SaaS Design System with animations
├── app.js                 # Client-side Cloud Controller, Uploader & QR Generator
├── Dockerfile             # Container configuration for AWS ECS / GCP Cloud Run
├── .gitignore             # Git ignore rule for clean, lightweight repository
└── README.md              # Complete Project Documentation & Academic Guide
```

---

## 🚀 Quickstart Guide

### Option 1: Native Run (No setup needed, zero dependencies)
Ensure Python 3 is installed, then run:

```bash
python server.py
```

Then open your browser and visit: **[http://localhost:5000](http://localhost:5000)**

### Option 2: Run with Docker
```bash
# Build the container image
docker build -t cloud-vault .

# Run container with mapped port
docker run -p 5000:5000 cloud-vault
```

---

## 📡 RESTful API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/images` | `GET` | Retrieve list of objects with optional `search`, `region`, and `tag` filters. |
| `/api/stats` | `GET` | Query cloud capacity metrics, object count, quota usage, and SLA. |
| `/api/upload` | `POST` | Upload and replicate image payload with metadata and tags. |
| `/api/raw/<id>` | `GET` | Stream raw binary object bytes with cached headers. |
| `/api/share` | `POST` | Issue a time-bounded presigned URL with optional passcode. |
| `/api/share/<token>` | `GET` | Resolve a presigned token and verify validity/passcode. |
| `/api/image/<id>` | `DELETE`| Remove an object from storage and purge all share tokens. |

---

## 📤 Pushing to GitHub (Step-by-Step)

Because this repository contains only clean, compact source files and no bloated folders, pushing to GitHub takes less than 30 seconds:

```bash
# 1. Initialize git repository
git init

# 2. Stage all files
git add .

# 3. Create initial commit
git commit -m "Initial commit: Cloud-Based Image Storage and Sharing System"

# 4. Set branch to main
git branch -M main

# 5. Add your GitHub remote repository link (replace with your URL)
git remote add origin https://github.com/YOUR_USERNAME/Cloud-Based-Image-Storage.git

# 6. Push code to GitHub
git push -u origin main
```

---

## 🎓 Academic Viva & Presentation Notes
- **Why Object Storage instead of SQL Blob Storage?** Object storage allows horizontal scaling across commodity cloud hardware and separates binary payloads from search indexing metadata.
- **How do Presigned URLs improve cloud security?** They offload authorization to cryptographic tokens, preventing external actors from requiring direct administrative database or S3 credentials.
- **How is data integrity verified?** The server computes an unforgeable SHA-256 hash when bytes are received and persists it alongside metadata to verify file authenticity at any time.

---

## 📄 License
This project is open-source under the MIT License.
