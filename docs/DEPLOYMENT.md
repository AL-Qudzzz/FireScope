# FireScope — Deployment, Operations, Backup & Rollback Guide (`v1.0.0`)

- **Application:** FireScope (`firescope-api` + React 19 SPA)
- **Version:** `1.0.0`
- **Runtime Architecture:** Single-service Node.js (`>= 20.x`) Express HTTP server (`server.ts`) serving `/health`, `/api/v1/*`, DuckDB read-only Parquet queries (`data/processed/*.parquet`), and compiled static frontend assets (`dist/`).

---

## 1. Current Deployment Architecture Inspection

FireScope runs as a unified full-stack Node.js process listening on `0.0.0.0:3000` (configurable via `PORT`):
- **Development Mode (`npm run dev`):** Runs `tsx server.ts` with Vite middleware mounted for SPA delivery.
- **Production Mode (`npm run build && NODE_ENV=production npm start`):** Compiles frontend assets to `dist/` via `vite build`, then runs `node --import tsx server.ts` serving `dist/` via `express.static` alongside `/api/v1/*` and `/health`.
- **Analytical Storage Engine:** Embedded in-memory DuckDB instance (`@duckdb/node-api`) executing read-only vectorized scans over `data/processed/daily_aggregates.parquet` (`20.75 MB`) and `data/processed/recent_observations_2026.parquet` (`12.09 MB`). No external PostgreSQL/PostGIS database server is required.

---

## 2. Production Environment & Secret Management

### 2.1 Environment Variables
Create `/etc/firescope/firescope.env` (or inject via container secret manager) with `0600` file permissions owned by the service account:

```ini
NODE_ENV=production
PORT=3000
APP_URL=https://firescope.example.org
# Optional server-side NASA FIRMS Area API key (never expose via VITE_*)
FIRMS_MAP_KEY=YOUR_NASA_FIRMS_MAP_KEY_HERE
```

### 2.2 Secret Management Rules
1. Never commit `.env` or real `FIRMS_MAP_KEY` values to Git.
2. Never prefix `FIRMS_MAP_KEY` with `VITE_` (Vite bundles `VITE_*` variables into client JS).
3. Rotate `FIRMS_MAP_KEY` via the environment file and reload the service (`systemctl reload-or-restart firescope`).

---

## 3. Process Management (`systemd` Reference Configuration)

Place at `/etc/systemd/system/firescope.service`:

```ini
[Unit]
Description=FireScope Active Fire Intelligence Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=firescope
Group=firescope
WorkingDirectory=/opt/firescope
EnvironmentFile=/etc/firescope/firescope.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5s
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/opt/firescope/data/raw /opt/firescope/data/processed
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
```

---

## 4. Reverse Proxy & HTTPS (`Nginx` Reference Configuration)

Terminate TLS 1.2/1.3 at Nginx (or Cloud Load Balancer) and proxy traffic to `http://127.0.0.1:3000`:

```nginx
server {
    listen 443 ssl http2;
    server_name firescope.example.org;

    ssl_certificate     /etc/letsencrypt/live/firescope.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/firescope.example.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

---

## 5. Persistent Storage, Logging & Health Checks

- **Persistent Storage Layout:**
  - `/opt/firescope/data/raw/` (`~149 MB`): Immutable NASA FIRMS ZIP archives (mounted read-only at runtime).
  - `/opt/firescope/data/processed/` (`~32.8 MB`): Read-only DuckDB Parquet files (`daily_aggregates.parquet`, `recent_observations_2026.parquet`, `parquet_manifest.json`).
- **Health Check Endpoint:**
  - `GET http://127.0.0.1:3000/health`
  - Expected HTTP `200` payload:
    ```json
    {
      "status": "ok",
      "service": "firescope-api",
      "version": "1.0.0",
      "parquet_available": true,
      "parquet_canonical_rows": 8913218
    }
    ```
  - Configure load-balancer / container liveness probes with `interval=15s`, `timeout=5s`, `retries=3`.

---

## 6. Backup & Restore Procedure

### 6.1 Creating a Verified Data & Configuration Backup
```bash
mkdir -p /var/backups/firescope
tar -czf /var/backups/firescope/firescope-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz \
  data/raw/ \
  data/processed/ \
  MANIFEST.json \
  package.json \
  bun.lock
sha256sum /var/backups/firescope/firescope-data-*.tar.gz > /var/backups/firescope/SHA256SUMS
```

### 6.2 Restoring from Backup (or Regenerating Parquet from Raw Archives)
1. **Direct Restore (< 5 seconds):**
   ```bash
   sha256sum -c /var/backups/firescope/SHA256SUMS
   tar -xzf /var/backups/firescope/firescope-data-<timestamp>.tar.gz -C /opt/firescope
   ```
2. **Deterministic Rebuild from Immutable `data/raw/*.zip` (~45 seconds):**
   If `data/processed/*.parquet` is ever corrupted or deleted, regenerate identical Parquet files directly from `data/raw/*.zip`:
   ```bash
   npx tsx scripts/buildParquet.ts
   ```

---

## 7. Step-by-Step Deployment & Rollback Instructions

### 7.1 Standard Release Deployment (`v1.0.0`)
```bash
# 1. Fetch release artifact and install dependencies
npm install

# 2. Run pre-release verification gates
npm test
npm run lint
npm run build

# 3. Verify Parquet manifest and raw archive checksums
node -e 'const m=require("./data/processed/parquet_manifest.json"); if(m.canonical_rows_total!==8913218) process.exit(1);'

# 4. Restart production service and verify health
NODE_ENV=production npm start
curl -fsS http://127.0.0.1:3000/health
```

### 7.2 Rollback Procedure
If post-deployment health checks (`/health` or `/api/v1/data/status`) fail:
1. Stop the newly deployed release process (`systemctl stop firescope` or container revision rollback).
2. Restore the previous release directory symlink (`/opt/firescope -> /opt/firescope-releases/<previous-release>`) and data snapshot from `/var/backups/firescope/`.
3. Start the previous release (`systemctl start firescope`) and verify `curl -fsS http://127.0.0.1:3000/health` returns `"status":"ok"`.

---

## 8. Phase 8.6 & Phase 8.7 Staging / Production Verification Report

Executed against the live running server on port `3000`:
- **Health Probe (`GET /health`):** HTTP `200 OK`, `version: "1.0.0"`, `parquet_available: true`, `parquet_canonical_rows: 8913218`.
- **Live NASA Connectivity (`GET /api/v1/data/status`):** HTTP `200 OK`, `data_mode: "LIVE_NASA_FIRMS"`, `live_firms_connected: true` (`117,976` active 24h global observations across MODIS C6.1, VIIRS S-NPP, NOAA-20, NOAA-21), `live_eonet_connected: true`.
- **API Regression & Concurrency (`20` parallel requests):** `20 / 20` HTTP `200 OK`.
- **End-to-End Browser Verification:** Passed across `1440×900`, `768×1024`, and `390×844` viewports including Saved AOI persistence and simulated `503` recovery.
