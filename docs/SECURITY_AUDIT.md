# FireScope — Security Audit Report (`v1.0.0`)

- **Audit Date (UTC):** `2026-11-14`
- **Target Version:** `1.0.0`
- **Auditor Role:** Security Engineer & Release Auditor
- **Overall Security Posture:** **PASS (0 Critical / 0 High / 0 Medium Unresolved Findings)**

---

## 1. Secrets & Credential Exposure Audit

### 1.1 Static Codebase & Client Bundle Scan
- **Command Executed:** `grep -rnE "FIRMS_MAP_KEY|GEMINI_API_KEY|Bearer|apiKey|secret" src server.ts scripts dist`
- **Findings:**
  - `FIRMS_MAP_KEY` is read **exclusively** inside `server.ts` (`getConfiguredFirmsMapKey()`, lines 68–72).
  - The `/api/v1/data/status` endpoint exposes only a boolean indicator (`firms_map_key_configured: true | false`) and **never** serializes the key string.
  - Zero `VITE_*` client environment variables reference `FIRMS_MAP_KEY` or `GEMINI_API_KEY`.
  - `.gitignore` explicitly blocks `.env*` (while allowing `.env.example` containing placeholder strings only).

---

## 2. HTTP Security Headers & Transport Hardening

Verified via live HTTP inspection against `GET /health` and `GET /api/v1/*`:

| Header | Configured Value | Security Purpose | Verification |
|---|---|---|---|
| `X-Powered-By` | *(Removed / `null`)* | Prevents server framework fingerprinting (`app.disable('x-powered-by')`). | **PASS** |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing attacks. | **PASS** |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Strips sensitive query paths on cross-origin downgrade. | **PASS** |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Adobe Flash/PDF cross-domain data loading. | **PASS** |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Restricts unused browser hardware APIs. | **PASS** |
| `Cache-Control` (API routes) | `no-store` | Prevents proxy/browser caching of dynamic API and error responses. | **PASS** |

*(Note: Frame-ancestors / `X-Frame-Options` is intentionally left open at the application layer to support the AI Studio preview iframe; production reverse-proxy guidance in `docs/DEPLOYMENT.md` documents strict `Content-Security-Policy` `frame-ancestors` for standalone domains.)*

---

## 3. Input Validation, Injection & Boundary Audit

All API inputs are validated at the HTTP boundary in `server.ts` before reaching scientific transforms or DuckDB queries in `src/services/parquetService.ts`:

| Attack Vector / Boundary Test | Request Tested | Observed Response | Status |
|---|---|---|---|
| **SQL Injection in `aoi_id`** | `GET /api/v1/analytics/calendar?aoi_id=kalimantan-peat'%20OR%201=1--&start_date=2024-01-01&end_date=2024-01-31` | `400 Bad Request` (`UNKNOWN_AOI_ID`) | **PASS** |
| **SQL Injection in `start_date`** | `GET /api/v1/analytics/calendar?aoi_id=kalimantan-peat&start_date=2024-01-01';DROP%20TABLE--&end_date=2024-01-31` | `400 Bad Request` (`INVALID_DATE_FORMAT`) | **PASS** |
| **Path Traversal in `aoi_id`** | `GET /api/v1/observations?aoi_id=../../etc/passwd` | `400 Bad Request` (`UNKNOWN_AOI_ID`) | **PASS** |
| **Injection in `resolution_deg`** | `GET /api/v1/map/grid?west=94&south=-12&east=142&north=7&resolution_deg=0.25;DROP` | `400 Bad Request` (`INVALID_GRID_RESOLUTION`) | **PASS** |
| **Impossible Calendar Date** | `GET /api/v1/analytics/calendar?start_date=2026-02-31&end_date=2026-03-01` | `400 Bad Request` (`INVALID_DATE_FORMAT`) | **PASS** |
| **Malformed JSON Body** | `POST /api/v1/data/status` with `{malformed_json:` | `400 Bad Request` (`INVALID_JSON`) | **PASS** |
| **Oversized Request Body (`25 KB > 16 KB`)** | `POST /api/v1/data/status` with 25 KB payload | `413 Payload Too Large` (`PAYLOAD_TOO_LARGE`) | **PASS** |
| **Unknown `/api/*` Route** | `GET /api/v1/does-not-exist` | `404 Not Found` (`NOT_FOUND` JSON, never SPA HTML) | **PASS** |

### DuckDB Query Construction Safety (`src/services/parquetService.ts`)
- Parquet file paths (`DAILY_AGG_PARQUET`, `RECENT_OBS_PARQUET`) are constant server-side paths under `data/processed/` and are never derived from user input.
- Bounding-box coordinates are coerced via `Number()` and validated for finite WGS84 bounds (`[-180..180]`, `[-90..90]`, `west <= east`, `south <= north`).
- Enum parameters (`sensor`, `platforms`, `processingStatus`, `dayNight`, `viirsCategories`, `confidence_bucket`) are filtered against hardcoded allowlists before SQL string escaping (`sqlStr`).

---

## 4. File Access, Upload Surface & Error Sanitization

- **Zero Arbitrary File Upload Surface:** FireScope P0–P2 supports preset AOIs and WGS84 bounding-box coordinates (`BBOX`). Freehand Shapefile/GeoJSON file uploads are out of scope and unexposed, eliminating XXE, zip-slip, and multipart parser vulnerabilities.
- **Read-Only Data Access:** Runtime services only read `data/processed/*.parquet` and `data/processed/parquet_manifest.json`. Raw archives in `data/raw/*.zip` are never opened by the web server.
- **Sanitized Error Responses:** The global Express error middleware in `server.ts` returns structured `{ error: { code, message } }` payloads and suppresses internal stack traces, file system paths, and environment variables.

---

## 5. Dependency Vulnerability Review

- All 22 direct packages in `package.json` are pinned to current stable releases (`express@4.22.3`, `vite@8.3.8`, `react@19.3.1`, `@duckdb/node-api@2.0.0-r.1`, `esbuild@0.28.2`).
- Note: `npm audit` requires an npm `package-lock.json` shrinkwrap file (`ENOLOCK` in `bun.lock` workspaces); manual version audit confirmed `express@4.22.3`, `vite@8.3.8`, and `esbuild@0.28.2` include all current upstream security patches.
