# 🔒 Vault Notes

A privacy-first, self-hosted, encrypted note-taking app — inspired by Google Keep, built for security.

## Features

- **AES-256-GCM encryption** — All note content (title, body, color, labels) encrypted at rest
- **Argon2id password hashing** — Industry-leading password protection  
- **Zero-knowledge storage** — Server never sees plaintext notes; encryption key derived from your password in memory only
- **Multi-user** — Each user gets their own isolated encrypted vault
- **Google Keep-style UI** — Masonry grid, color-coded notes, pin, archive, labels, search
- **Rate limiting** — Auth endpoints protected against brute force
- **Security headers** — Helmet.js + CSP + nginx hardening
- **Self-contained** — Single `docker-compose up` to run everything

---

## Quick Start

### 1. Clone / download the project

```bash
cd vault-notes
```

### 2. Configure secrets

```bash
cp .env.example .env
```

Edit `.env` and set strong random values:

```bash
# Generate strong secrets:
openssl rand -hex 64   # use for JWT_SECRET
openssl rand -hex 64   # use for ENCRYPTION_PEPPER
```

```env
APP_PORT=8080
JWT_SECRET=<your-64-char-random-hex>
ENCRYPTION_PEPPER=<your-64-char-random-hex>
```

> ⚠️ **IMPORTANT**: If you lose these secrets, you lose access to all notes. Back them up securely.

### 3. Run

```bash
docker compose up -d
```

The app will be available at: **http://localhost:8080**

---

## Architecture & Security Design

```
Browser
  │
  ├── HTTPS (add reverse proxy for TLS in production)
  │
nginx (port 8080)
  ├── /          → React SPA
  └── /api/*     → Express backend (internal only)
         │
         └── SQLite database (Docker volume)
```

### Encryption Model

```
User Password
    │
    ├── Argon2id (310k iterations) ──→ Stored hash (for auth)
    │
    └── PBKDF2-SHA256 + PEPPER ──→ AES-256-GCM key (in-memory only)
                                          │
                                          └── Encrypts note fields
                                              (title, content, color, labels)
                                              stored as ciphertext in SQLite
```

**Key points:**
- The encryption key is **never stored anywhere** — derived fresh on each request from password + pepper + user salt
- Each note gets a **unique random IV** (initialization vector)
- **GCM authentication tags** prevent ciphertext tampering
- The server only receives the password in the `X-Password` header over the session — never persisted
- SQLite uses WAL mode + `secure_delete = ON`

### What's encrypted
| Field | Encrypted |
|-------|-----------|
| Note title | ✅ |
| Note content | ✅ |
| Note color | ✅ |
| Note labels | ✅ |
| Pin/Archive status | ❌ (metadata) |
| Timestamps | ❌ (metadata) |
| Passwords | ✅ Argon2id hashed |

---

## Production Hardening Checklist

- [ ] Use HTTPS with a reverse proxy (Nginx/Caddy/Traefik) + TLS cert
- [ ] Change `JWT_SECRET` and `ENCRYPTION_PEPPER` to strong random values
- [ ] Run behind a firewall — only expose port 80/443
- [ ] Set up regular backups of the `vault-data` Docker volume
- [ ] Consider binding to localhost only: `127.0.0.1:8080:80` in docker-compose.yml
- [ ] Review Docker security: `--read-only`, `--cap-drop=ALL` etc.

### Adding HTTPS with Caddy (recommended)

```yaml
# Add to docker-compose.yml services:
caddy:
  image: caddy:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy-data:/data
  networks:
    - vault-network
```

```
# Caddyfile
notes.yourdomain.com {
    reverse_proxy frontend:80
}
```

---

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend runs at `http://localhost:5173`, API at `http://localhost:3001`.

---

## Data Backup

The SQLite database is stored in a Docker named volume. To back it up:

```bash
# Backup
docker run --rm -v vault-notes_vault-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/vault-backup-$(date +%Y%m%d).tar.gz /data

# Restore
docker run --rm -v vault-notes_vault-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/vault-backup-YYYYMMDD.tar.gz -C /
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Custom CSS (Syne + DM Mono fonts) |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Encryption | Node.js `crypto` (AES-256-GCM + PBKDF2) |
| Password hashing | Argon2id |
| Auth | JWT (HS256, 7-day expiry) |
| Validation | Zod |
| Rate limiting | express-rate-limit |
| Security headers | Helmet.js |
| Container | Docker + Docker Compose |
| Reverse proxy | nginx (Alpine) |
