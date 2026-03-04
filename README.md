# 🔒 NeovisionVE

A privacy-first, self-hosted, zero-knowledge encrypted notes and bookmarks vault. Everything you store is encrypted with your password before it reaches the server — not even the administrator can read your data.

---

## Features

### Notes
- AES-256-GCM encrypted notes with title, body, color, labels, pin, and archive
- Masonry grid layout with real-time client-side search
- Label sidebar with drag-to-label for fast organisation
- Quick-add from the top of the page

### Bookmarks
- Encrypted bookmark vault with unlimited nested folder hierarchy
- Drag bookmarks into folders to organise
- Import from Chrome, Firefox, Safari, and Edge (Netscape HTML format)
  - Duplicate detection with side-by-side conflict resolution UI
  - Merges into existing folders rather than creating duplicates
- Export back to browser-compatible HTML
- Grid and list views with favicon support

### Sharing
- Share individual notes or bookmarks with any email address
- Recipients receive a secure invite link — content is encrypted with a one-time key embedded in the link (never stored server-side)
- Recipients must create an account to accept; the item is re-encrypted with their personal key
- Revoke shares at any time; view pending and accepted shares

### Security
- **AES-256-GCM** encryption on every user-facing field
- **Argon2id** password hashing (64 MB memory, 3 iterations)
- **Zero-knowledge** — encryption key derived from password + pepper + salt on every request; never stored
- **PBKDF2-SHA256** key derivation (310,000 iterations) with server-side pepper
- Per-item unique random IVs; GCM auth tags prevent tampering
- Helmet.js security headers, rate limiting, JWT authentication
- SQLite WAL mode + `secure_delete=ON`

### Administration
- Multi-user with admin and user roles
- Admin panel: manage users, reset passwords, assign roles, enable/disable accounts
- Per-user data clearing (notes + bookmarks) without deleting accounts
- Site-wide data wipe (admin only)

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

Generate strong secrets and edit `.env`:

```bash
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 64   # → ENCRYPTION_PEPPER
```

```env
APP_PORT=8080
JWT_SECRET=<64-char-hex>
ENCRYPTION_PEPPER=<64-char-hex>
APP_URL=http://localhost:8080

# Optional — SMTP for sharing features
# Leave blank to log emails to console (dev mode)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=NeovisionVE <no-reply@yourdomain.com>
```

> ⚠️ **Critical:** If you lose `JWT_SECRET` or `ENCRYPTION_PEPPER`, all encrypted data becomes unreadable. Back them up securely.

### 3. Run

```bash
docker compose up -d
```

Visit **http://localhost:8080** — register your first account (the first user is automatically an admin).

---

## Platform Deployment Guides

Step-by-step instructions for popular self-hosting platforms:

| Platform | Guide |
|----------|-------|
| **TrueNAS SCALE** | [docs/deploy-truenas-scale.md](docs/deploy-truenas-scale.md) |
| **Unraid** | [docs/deploy-unraid.md](docs/deploy-unraid.md) |
| **Proxmox VE** | [docs/deploy-proxmox.md](docs/deploy-proxmox.md) |

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
    ├── Argon2id (64MB, 3 iter) ──→ Stored hash (login verification only)
    │
    └── PBKDF2-SHA256 (310k iter) + PEPPER + SALT
                │
                └── AES-256-GCM key  (in-memory only, never stored)
                        │
                        ├── Encrypts note title, content, color, labels
                        ├── Encrypts bookmark title, URL, description
                        └── Encrypts folder names
```

The server receives your password only in the `X-Password` request header over the authenticated session and uses it solely to derive the encryption key. It is never logged or persisted.

### Sharing Encryption

Shared items use an additional layer of protection:

```
Shared item content (decrypted with your key)
    │
    └── Re-encrypted with a random 256-bit one-time key
                │
                ├── Ciphertext → stored in database
                └── One-time key → embedded in share link (never stored)

    When recipient accepts:
    Share link key → decrypt shared content → re-encrypt with recipient's key
```

If the database is ever compromised, shared content cannot be read without the original share link.

### What Is Encrypted

| Field | Encrypted |
|-------|-----------|
| Note title | ✅ AES-256-GCM |
| Note content | ✅ AES-256-GCM |
| Note color | ✅ AES-256-GCM |
| Note labels | ✅ AES-256-GCM |
| Bookmark title | ✅ AES-256-GCM |
| Bookmark URL | ✅ AES-256-GCM |
| Bookmark description | ✅ AES-256-GCM |
| Folder names | ✅ AES-256-GCM |
| Shared item content | ✅ AES-256-GCM (one-time key) |
| Pin / Archive status | ❌ Metadata |
| Timestamps | ❌ Metadata |
| Passwords | ✅ Argon2id hash |

---

## Production Hardening Checklist

- [ ] Use HTTPS — add a reverse proxy (Caddy, nginx, Traefik) with a valid TLS certificate
- [ ] Set strong random values for `JWT_SECRET` and `ENCRYPTION_PEPPER`
- [ ] Bind to localhost only if running behind a reverse proxy: `127.0.0.1:8080:80`
- [ ] Schedule regular backups of the `vault-data` Docker volume
- [ ] Configure SMTP so share invites are emailed rather than logged to console
- [ ] Run behind a firewall — expose only ports 80/443 publicly
- [ ] Consider read-only filesystem and `--cap-drop=ALL` for the containers

### Adding HTTPS with Caddy (simplest)

Add to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks:
      - vault-network

volumes:
  caddy_data:
```

```
# Caddyfile
notes.yourdomain.com {
    reverse_proxy frontend:80
}
```

---

## Email / SMTP Configuration

The sharing feature sends invite emails. Configure SMTP in `.env`:

```env
SMTP_HOST=smtp.sendgrid.net     # or smtp.gmail.com, mail.yourdomain.com, etc.
SMTP_PORT=587
SMTP_SECURE=false               # true for port 465 (TLS), false for 587 (STARTTLS)
SMTP_USER=apikey                # SendGrid: literally "apikey"; Gmail: your email
SMTP_PASS=your-smtp-password
SMTP_FROM=NeovisionVE <no-reply@yourdomain.com>
APP_URL=https://notes.yourdomain.com
```

Without SMTP configured, share invites are printed to the backend logs — useful for development or when you want to copy-paste links manually.

---

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend runs at `http://localhost:5173`, API proxied to `http://localhost:3001`.

---

## Data Backup

```bash
# Backup Docker volume
docker run --rm \
  -v vault-notes_vault-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/vault-backup-$(date +%Y%m%d).tar.gz /data

# Restore
docker run --rm \
  -v vault-notes_vault-data:/data \
  -v $(pwd):/backup \
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
| Encryption | Node.js `crypto` — AES-256-GCM + PBKDF2 |
| Password hashing | Argon2id |
| Auth | JWT (HS256, 7-day expiry) |
| Email | Nodemailer (SMTP) |
| Validation | Zod |
| Rate limiting | express-rate-limit |
| Security headers | Helmet.js |
| Containers | Docker + Docker Compose |
| Reverse proxy | nginx (Alpine) |
