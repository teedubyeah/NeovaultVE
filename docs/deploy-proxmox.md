# Deploying NeovisionVE on Proxmox VE

Proxmox VE is a hypervisor platform — it doesn't run Docker containers directly on the host. The recommended approach is to deploy NeovisionVE inside either an **LXC container** or a **VM**. LXC is lighter and faster; a VM gives stronger isolation. This guide covers both, with LXC as the primary path.

---

## Prerequisites

- Proxmox VE 8.x
- A ZFS pool or local storage for container data
- Network access from the container to the internet (for image pulls during build)

---

## Method A — LXC Container (recommended)

LXC containers on Proxmox share the host kernel, making them very efficient for persistent services like NeovisionVE.

### Step 1 — Download an LXC template

1. In the Proxmox UI, go to your node → **Local storage → CT Templates**
2. Click **Templates** and download **Ubuntu 24.04** (or Debian 12)

### Step 2 — Create the LXC container

1. Click **Create CT** (top right of Proxmox UI)
2. Fill in:

| Setting | Value |
|---------|-------|
| **CT ID** | e.g. `200` |
| **Hostname** | `neovisionve` |
| **Template** | Ubuntu 24.04 |
| **Disk** | 8 GB minimum on your chosen storage |
| **CPU** | 2 cores |
| **Memory** | 512 MB (1 GB recommended) |
| **Network** | `eth0`, Bridge `vmbr0`, DHCP or static IP |

3. In **Features**, enable:
   - **Nesting** (required for Docker inside LXC)
   - **Keyctl** (recommended)

4. Click **Finish**

### Step 3 — Start and configure the container

```bash
# In Proxmox Shell, or SSH into the container:
pct start 200
pct enter 200

# Inside the container:
apt update && apt upgrade -y
apt install -y curl git ca-certificates gnupg lsb-release

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Verify
docker --version
```

### Step 4 — Deploy NeovisionVE

```bash
# Create app directory
mkdir -p /opt/neovisionve
cd /opt/neovisionve

# Upload your release archive (from another terminal):
# scp neovisionve.tar.gz root@proxmox-ct-ip:/opt/neovisionve/
tar -xzf neovisionve.tar.gz --strip-components=1

# Configure
cp .env.example .env
nano .env
```

Edit `.env`:

```env
APP_PORT=8080
JWT_SECRET=<run: openssl rand -hex 64>
ENCRYPTION_PEPPER=<run: openssl rand -hex 64>
APP_URL=https://notes.yourdomain.com

# Optional SMTP for sharing
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
SMTP_FROM=NeovisionVE <no-reply@yourdomain.com>
```

Optionally switch to a bind mount for the data volume (easier for LXC bind mounts from Proxmox host):

```yaml
# In docker-compose.yml — change vault-data volume to:
    volumes:
      - /opt/neovisionve/data:/data
```

```bash
mkdir -p /opt/neovisionve/data

# Start
docker compose up -d --build
```

The app is now running at `http://container-ip:8080`.

### Step 5 — Configure the LXC to start on boot

```bash
# Inside the container, enable the Docker service (already enabled above)
# The container itself should auto-start:
```

Back in the Proxmox UI:
1. Select the container → **Options → Start at boot**: `Yes`
2. Add a startup order if needed under **Options → Start/Shutdown order**

---

## Method B — Virtual Machine

If you need stronger isolation, run NeovisionVE in a full VM.

### Step 1 — Create a VM

1. **Create VM** in Proxmox UI
2. Use Ubuntu 24.04 Server ISO (download from ubuntu.com)
3. Recommended specs: 2 vCPU, 1 GB RAM, 16 GB disk
4. Install Ubuntu, then follow the LXC steps above from **Step 4** onward — the commands are identical inside a VM

### Step 2 — Enable QEMU Guest Agent (VM only)

```bash
apt install -y qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

---

## Reverse Proxy with Nginx on the Proxmox host

A common pattern is to run an nginx reverse proxy on the Proxmox host (or in a dedicated proxy LXC) to route HTTPS to NeovisionVE.

### Option A — Caddy inside the NeovisionVE LXC

```bash
# Inside the neovisionve LXC
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-release main" | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
notes.yourdomain.com {
    reverse_proxy localhost:8080
}
```

```bash
systemctl enable --now caddy
```

Caddy automatically provisions a Let's Encrypt certificate. Update `APP_URL=https://notes.yourdomain.com` in `.env` and restart: `docker compose down && docker compose up -d`.

### Option B — Nginx Proxy Manager in a separate LXC

1. Create another LXC (512 MB RAM, 4 GB disk)
2. Install Docker and run Nginx Proxy Manager:

```yaml
# /opt/npm/docker-compose.yml
services:
  app:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "81:81"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

3. Add a Proxy Host pointing to `neovisionve-lxc-ip:8080`

### Option C — Proxmox built-in Nginx (host-level)

```bash
# On the Proxmox host itself
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/neovisionve << 'NGINX'
server {
    server_name notes.yourdomain.com;

    location / {
        proxy_pass http://200.ip.from.proxmox:8080;  # your LXC IP
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -s /etc/nginx/sites-available/neovisionve /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d notes.yourdomain.com
```

---

## Persistent Storage with ZFS (recommended)

Since Proxmox typically uses ZFS, store NeovisionVE data on a dedicated dataset for easy snapshots and backups:

```bash
# On Proxmox host — create a dataset and pass it through to the LXC
zfs create rpool/data/neovisionve

# Add a bind mount to the LXC (while stopped):
pct set 200 -mp0 /rpool/data/neovisionve,mp=/opt/neovisionve/data

# Now the LXC's /opt/neovisionve/data is stored on ZFS
# Snapshots:
zfs snapshot rpool/data/neovisionve@daily-$(date +%Y%m%d)
```

### Automated ZFS snapshots

```bash
# On Proxmox host — add to crontab:
crontab -e

# Daily snapshot at 2am, keep last 30:
0 2 * * * zfs snapshot rpool/data/neovisionve@auto-$(date +\%Y\%m\%d) && \
  zfs list -t snapshot -o name -s creation | grep 'neovisionve@auto' | head -n -30 | xargs -n1 zfs destroy 2>/dev/null
```

---

## Backup with Proxmox Backup Server (PBS)

If you use PBS:

1. The LXC can be backed up directly via **Datacenter → Backup → Add**
2. Select the NeovisionVE LXC CT ID
3. Schedule: Daily, Mode: Snapshot (no downtime)

This backs up the entire container including all app data.

---

## Updates

```bash
# Inside the LXC:
cd /opt/neovisionve
tar -xzf neovisionve-new.tar.gz --strip-components=1 --overwrite
docker compose down && docker compose up -d --build
```

---

## Firewall

Proxmox has a built-in firewall. To restrict access:

1. **Datacenter → Firewall → Add** rule
2. Allow TCP port 8080 only from trusted IPs (or leave closed if using a reverse proxy on port 443 only)
3. For the LXC container: **CT 200 → Firewall → Enable**

---

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| Docker fails inside LXC | Ensure **Nesting** feature is enabled on the LXC (pct set 200 --features nesting=1) |
| App not reachable | Check LXC IP: `pct exec 200 -- ip addr`; verify port 8080 is not blocked |
| LXC won't start with bind mount | Ensure the ZFS dataset exists on the host before starting the LXC |
| High memory usage | Reduce Node.js memory with `NODE_OPTIONS=--max-old-space-size=256` in `.env` |
| SSL cert not renewing | If using Caddy, it auto-renews; for certbot add a cron: `0 3 * * * certbot renew --quiet` |
