# Deploying NeovisionVE on Unraid

Unraid makes it straightforward to run Docker containers through its web UI. NeovisionVE uses two containers (backend + frontend via nginx) orchestrated by Docker Compose. You can run it either through the **Unraid Community Apps** Docker template approach, or by using the **Compose Manager** plugin. This guide covers both methods.

---

## Prerequisites

- Unraid 6.11 or later
- **Community Applications** plugin installed (Apps → Install Plugins → Community Applications)
- A share for app data (e.g. `/mnt/user/appdata/neovisionve`)

---

## Method A — Compose Manager (recommended)

**Compose Manager** lets you paste a `docker-compose.yml` directly into the Unraid UI — the cleanest approach for multi-container apps.

### Step 1 — Install Compose Manager

1. Go to **Apps** in Unraid and search for **Compose Manager**
2. Install it
3. After install, find it under **Docker → Compose**

### Step 2 — Upload the app files

Copy the NeovisionVE files to your Unraid server:

```bash
# From your local machine:
scp neovisionve.tar.gz root@unraid-ip:/mnt/user/appdata/neovisionve/

# On Unraid (via terminal or SSH):
mkdir -p /mnt/user/appdata/neovisionve
cd /mnt/user/appdata/neovisionve
tar -xzf neovisionve.tar.gz --strip-components=1
cp .env.example .env
```

### Step 3 — Edit the .env file

```bash
vi /mnt/user/appdata/neovisionve/.env
```

```env
APP_PORT=8080
JWT_SECRET=<64-char hex — run: openssl rand -hex 64>
ENCRYPTION_PEPPER=<64-char hex — run: openssl rand -hex 64>
APP_URL=https://notes.yourdomain.com   # or http://unraid-ip:8080 for LAN

# Optional — for sharing features
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
SMTP_FROM=NeovisionVE <no-reply@yourdomain.com>
```

Edit `docker-compose.yml` to use a bind mount (Unraid prefers explicit paths over named volumes):

```yaml
# Find the backend service volumes section and replace:
    volumes:
      - vault-data:/data

# With:
    volumes:
      - /mnt/user/appdata/neovisionve/data:/data
```

Create the data directory:

```bash
mkdir -p /mnt/user/appdata/neovisionve/data
```

### Step 4 — Add the compose stack in Unraid

1. Go to **Docker → Compose → Add Stack**
2. **Name**: `neovisionve`
3. **Compose file path**: `/mnt/user/appdata/neovisionve/docker-compose.yml`
4. **Env file path**: `/mnt/user/appdata/neovisionve/.env`
5. Click **Save**, then **Compose Up**

Monitor the build under **Docker → Compose → neovisionve → Logs**.

The app will be available at: `http://unraid-ip:8080`

---

## Method B — Two separate Docker containers via Unraid UI

If you prefer not to use Compose Manager, you can add each container manually through the standard Unraid Docker UI. This requires building the images first, or using pre-built images if available.

> For most users, **Method A** is strongly recommended. Method B requires manual image management.

---

## Step 5 — Add to Unraid Dashboard

1. Go to **Docker** and verify both `neovisionve-backend` and `neovisionve-frontend` containers are running
2. To add an icon and description, click the container name → **Edit** and set a custom icon URL

---

## Reverse Proxy with Nginx Proxy Manager

Most Unraid users already run **Nginx Proxy Manager** for HTTPS. To expose NeovisionVE:

1. Open Nginx Proxy Manager (default: `http://unraid-ip:81`)
2. **Proxy Hosts → Add Proxy Host**
3. **Domain Names**: `notes.yourdomain.com`
4. **Scheme**: `http`, **Forward Hostname**: `unraid-ip` (or `172.17.0.1` for Docker bridge), **Forward Port**: `8080`
5. **SSL** tab → Request a Let's Encrypt certificate → Force SSL
6. Update `APP_URL=https://notes.yourdomain.com` in `.env` and restart the stack:

```bash
cd /mnt/user/appdata/neovisionve
docker compose down && docker compose up -d
```

---

## Backup

### Automated with Unraid's built-in backup

1. Install the **CA Backup / Restore Appdata** plugin from Community Applications
2. Add `/mnt/user/appdata/neovisionve` to the backup paths
3. Schedule daily backups

### Manual backup

```bash
# Stop app first for a clean backup (optional — SQLite WAL is safe for hot backup)
cd /mnt/user/appdata/neovisionve
docker compose down

# Backup
tar czf /mnt/user/backups/neovisionve-$(date +%Y%m%d).tar.gz data/

# Restart
docker compose up -d
```

---

## Updates

```bash
cd /mnt/user/appdata/neovisionve

# Replace app files with new release
tar -xzf neovisionve-new.tar.gz --strip-components=1 --overwrite

# Rebuild images and restart
docker compose down
docker compose up -d --build
```

> **Note**: Your `.env` and `data/` directory are preserved because they live outside the app source. Always back up before updating.

---

## Autostart

Compose Manager stacks set to **Auto Start** will start automatically when Unraid boots. Verify this setting under **Docker → Compose → neovisionve → Settings**.

---

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| Port 8080 already in use | Change `APP_PORT` in `.env` to e.g. `8081` |
| Build fails on first run | Ensure internet access from Unraid; check Docker's `br0` network bridge |
| Container keeps restarting | Run `docker logs neovisionve-backend` to see the error |
| Can't login after update | Verify `.env` secrets haven't changed; changing `ENCRYPTION_PEPPER` makes all data unreadable |
| Email not working | Without SMTP config, share invite links are printed to the backend log instead |
