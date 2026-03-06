# NeovisionVE

A self-hosted, zero-knowledge encrypted notes and bookmarks vault. Your data is encrypted client-side with AES-256-GCM — the server never sees your plaintext content.

---

## Features

- **Encrypted notes** — rich text notes with pinning, archiving, colour coding and labels
- **Encrypted bookmarks** — hierarchical folders, favourites, favicon previews, import/export
- **Zero-knowledge** — encryption key derived from your password, never stored server-side
- **Secure sharing** — share notes and bookmarks via encrypted one-time links
- **Admin panel** — user management, SMTP configuration, server controls
- **Self-hosted** — runs entirely in Docker, no external services required

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A terminal / Git Bash

### 1. Clone the repository

```bash
git clone https://github.com/teedubyeah/NeovaultVE.git
cd NeovaultVE
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Generate your secrets (run each command separately and paste the output):

```bash
openssl rand -hex 64   # → paste as JWT_SECRET
openssl rand -hex 64   # → paste as ENCRYPTION_PEPPER
```

Edit `.env` and fill in both values:

```env
APP_PORT=8080
JWT_SECRET=<your 64-char hex string>
ENCRYPTION_PEPPER=<your 64-char hex string>
APP_URL=http://localhost:8080
```

> ⚠ The app will refuse to start if these are missing or left as placeholders.

### 3. Build and start

```bash
docker compose up -d --build
```

The first build takes 3–5 minutes. Once complete, open `http://localhost:8080`.

The **first account registered becomes the admin.**

---

## Updating

```bash
git pull origin main
docker compose down
docker compose up -d --build
```

Your `.env` and database are never touched by a `git pull`.

---

## Security

| Layer | Implementation |
|-------|---------------|
| Encryption | AES-256-GCM per item |
| Key derivation | PBKDF2 — 310,000 iterations, SHA-256 |
| Password hashing | Argon2id |
| Key pepper | Server-side HMAC pepper via env var |
| Transport | JWT (HS256), 7-day expiry |
| Headers | Helmet.js security headers |
| Rate limiting | 20 req/15 min (auth), 200 req/min (API) |

Encryption keys are derived from your password on every request and never stored anywhere. Administrators cannot read user data.

---

## Deployment Guides

- [TrueNAS SCALE](docs/deploy-truenas-scale.md)
- [Unraid](docs/deploy-unraid.md)
- [Proxmox](docs/deploy-proxmox.md)

---

## Email / SMTP

Share invite emails are configured in **Admin → Email / SMTP** after first login. No restart required. Supported modes:

- **Console** — links printed to backend logs (default, good for local testing)
- **Custom SMTP** — Gmail, SendGrid, Mailgun, Fastmail, or any SMTP provider

---

## Backup

Everything is stored in a single SQLite file. Back it up with:

```bash
docker compose exec backend cp /app/data/neovisionve.db /app/data/neovisionve.db.bak
```

Or use your host's snapshot / backup tools on the Docker volume.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5 |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Encryption | Node.js crypto (AES-256-GCM, PBKDF2) |
| Auth | Argon2id, JWT |
| Serving | nginx (frontend), Express (API) |
| Runtime | Docker, Docker Compose |

---

## License

MIT — see [LICENSE](LICENSE) for details.
