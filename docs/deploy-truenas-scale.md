# Deploying NeovisionVE on TrueNAS SCALE

This guide deploys NeovisionVE entirely through the TrueNAS web UI using a single
Docker Compose file. Docker clones the source code from GitHub automatically during
the build — no SSH, no terminal, no file downloads required.

---

## Prerequisites

- TrueNAS SCALE 24.04 (Dragonfish) or later
- A storage pool with space for the app data (e.g. `tank`)
- Access to the TrueNAS web UI as admin

---

## Step 1 — Create a dataset for persistent data

This is where your encrypted vault database will live. It must exist before the
app starts.

1. Go to **Storage → Create Dataset**
2. Set the following:

| Field | Value |
|-------|-------|
| Parent | your pool, e.g. `tank/apps` |
| Name | `neovisionve` |
| Dataset Preset | Generic |

3. Click **Save**

The full path will be something like `/mnt/tank/apps/neovisionve`.  
Create a `data` subfolder inside it:

1. Go to **Storage → (your pool) → neovisionve → Add Dataset**
2. Name it `data`, preset Generic, click **Save**

The data path is now `/mnt/tank/apps/neovisionve/data`.

---

## Step 2 — Generate your secrets

NeovisionVE requires two strong random secrets before it will start. Generate them
in the TrueNAS Shell (**System → Shell**) — this is the only time you need the shell:

```bash
openssl rand -hex 64
```

Run it **twice** — copy each output separately. You will paste them into the compose
file in the next step. Keep them somewhere safe (a password manager).

---

## Step 3 — Prepare the Docker Compose file

Copy the entire block below into a text editor and fill in your values before
pasting it into TrueNAS.

**Replace these four placeholders:**

| Placeholder | Replace with |
|-------------|-------------|
| `REPLACE_WITH_64_CHAR_HEX` (first) | your first `openssl rand -hex 64` output |
| `REPLACE_WITH_64_CHAR_HEX` (second) | your second `openssl rand -hex 64` output |
| `YOUR_TRUENAS_IP` | your TrueNAS server's local IP address, e.g. `192.168.1.50` |
| `/mnt/tank/apps/neovisionve/data` | your actual dataset path if different |

```yaml
services:
  backend:
    build:
      context: https://github.com/teedubyeah/NeovaultVE.git#main:backend
      dockerfile: Dockerfile
    container_name: neovisionve-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DB_PATH=/app/data/neovisionve.db
      - JWT_SECRET=REPLACE_WITH_64_CHAR_HEX
      - ENCRYPTION_PEPPER=REPLACE_WITH_64_CHAR_HEX
      - APP_URL=http://YOUR_TRUENAS_IP:8080
      - SMTP_HOST=
      - SMTP_PORT=587
      - SMTP_SECURE=false
      - SMTP_USER=
      - SMTP_PASS=
      - SMTP_FROM=NeovisionVE <no-reply@yourdomain.com>
    volumes:
      - /mnt/tank/apps/neovisionve/data:/app/data
    networks:
      - neovisionve-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 8s
      timeout: 5s
      retries: 10
      start_period: 30s

  frontend:
    build:
      context: https://github.com/teedubyeah/NeovaultVE.git#main:frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=/api
    container_name: neovisionve-ui
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - neovisionve-network

networks:
  neovisionve-network:
    driver: bridge
```

> ⚠ **Do not use the placeholder values.** The app will refuse to start if
> `JWT_SECRET` or `ENCRYPTION_PEPPER` are missing or set to known weak defaults.

> The `context: https://github.com/...` lines tell Docker to clone the repository
> directly from GitHub during the build. No local files are needed.

---

## Step 4 — Deploy via Custom App

1. In the TrueNAS UI go to **Apps → Discover Apps**
2. Click **Custom App** in the top right
3. Fill in the **Application Name**: `neovisionve`
4. Scroll down to the **Docker Compose** section
5. **Clear** any existing content in the compose editor
6. **Paste** your completed compose file from Step 3
7. Click **Save**

TrueNAS will now:
- Clone the backend source from GitHub and build the backend image
- Clone the frontend source from GitHub and build the frontend image
- Start both containers

The first build takes **3–5 minutes** while Docker compiles everything. You can
watch progress under:

**Apps → Installed Apps → neovisionve → Logs**

Once the logs show `NeovisionVE API running on port 3001`, the app is ready.

---

## Step 5 — First login

Open your browser and go to:

```
http://YOUR_TRUENAS_IP:8080
```

- Click **Create Account** — the **first account registered becomes the admin**
- Read and acknowledge the encryption warning
- You are now in your vault

To configure email for share invites, go to **Admin → Email / SMTP** and enter
your SMTP credentials there. No restart required.

---

## Step 6 — HTTPS with nginx Proxy Manager (optional)

If you run nginx Proxy Manager on your TrueNAS:

1. **Add a new Proxy Host**
2. **Domain Names**: `notes.yourdomain.com`
3. **Scheme**: `http` · **Forward Hostname**: your TrueNAS IP · **Forward Port**: `8080`
4. Enable **Block Common Exploits**
5. On the **SSL** tab, request a Let's Encrypt certificate
6. Update `APP_URL` in your compose file to `https://notes.yourdomain.com`
7. Go to **Apps → Installed Apps → neovisionve → Edit**, update the compose, and save

---

## Updating to a new version

1. Go to **Apps → Installed Apps → neovisionve → Edit**
2. The compose file is already there — just click **Save** again

TrueNAS will rebuild the images by cloning the latest code from GitHub and
restarting the containers. Your data volume is never touched during an update.

> If you want to pin to a specific version, change `#main` in the two `context:`
> lines to a git tag, e.g. `#v0.15`.

---

## Backup

Your entire vault is a single SQLite file inside the data dataset.

### Automatic ZFS snapshots (recommended)

1. Go to **Storage → Data Protection → Periodic Snapshot Tasks → Add**

| Field | Value |
|-------|-------|
| Dataset | `tank/apps/neovisionve` |
| Recursive | ✓ |
| Schedule | Daily |
| Keep for | 30 days |

2. Click **Save** — TrueNAS handles everything from here automatically.

### Manual snapshot via UI

1. Go to **Storage → (your pool)**
2. Click the **⋮** menu next to `neovisionve`
3. Select **Create Snapshot**

---

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| Build fails immediately | Check **Logs** — usually a missing or incorrect secret value |
| "JWT_SECRET is not set" | Replace the placeholder with a real `openssl rand -hex 64` value |
| App builds but won't open | Confirm port 8080 is not blocked; check no other app uses port 8080 |
| Data permission error in logs | In Shell: `chmod 755 /mnt/tank/apps/neovisionve/data` |
| Email not sending | Go to **Admin → Email / SMTP**, set mode to **Your own SMTP**, fill in credentials, click **Send test** |
| Forgot admin password | Admin can reset any user's password in the Admin panel — note this makes that user's existing notes permanently unreadable |
