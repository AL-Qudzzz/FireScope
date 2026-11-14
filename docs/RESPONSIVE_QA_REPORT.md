# FireScope Responsive QA Report (`v1.0.0` Pre-Phase 9 Verification)

## 1. Test Environment & Methodology

- **Application Baseline**: FireScope `v1.0.0` (Pre-Phase 9 Responsive Remediation)
- **Browser Engine Actually Executed**: Headless Chromium via Playwright CLI (`playwright-cli`) against live server `http://localhost:3000`
- **Browser Engine vs. Emulated Viewport Distinction**:
  - **Executed Browser Engine**: Headless Chromium (Linux x86_64) with real DOM layout, CSS Flexbox/Grid computation, Leaflet WebGL/Canvas/SVG tile & vector rendering, and live Express + DuckDB API responses (`119,808` active fire records).
  - **Emulated Viewport Sizes**: All 9 target viewports (`1920×1080`, `1440×900`, `1280×800`, `1024×768`, `768×1024`, `430×932`, `390×844`, `360×800`, `844×390`) were tested by resizing the Chromium viewport via `playwright-cli resize <width> <height>` and inspecting both computed DOM geometry (`getBoundingClientRect()`, `scrollWidth <= innerWidth`) and full visual screenshots.
  - **Cross-Browser Note**: Native WebKit (iOS Safari) and Gecko (Firefox) engines were not executed in this Linux container; CSS compatibility for Safari/Firefox was hardened using standard CSS (`100dvh` with `100vh` fallback, `-webkit-backdrop-filter`, `scrollbar-width: none`, and standard Flexbox `shrink-0` rules).

---

## 2. Automated Unit & Scientific Guardrail Regression Suite

| Suite | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Scientific & Unit Tests** | `npm test` | **24 / 24 PASS** | `src/science/fireScience.test.ts` — M0/M1/M2 methodology separation, MODIS/VIIRS confidence separation, NRT/STANDARD supersession, coastal/offshore filter, and FRP aggregation invariants verified untouched. |
| **TypeScript Typecheck** | `npm run lint` (`tsc --noEmit`) | **PASS (0 errors)** | Strict TypeScript compilation across all frontend and backend modules. |
| **Production Bundle Build** | `npm run build` (`vite build`) | **PASS** | Clean production build output in `dist/`. |

---

## 3. Mandatory 9-Viewport Matrix Results

Every required viewport was tested on the live running application (`http://localhost:3000`) across Map Explorer, AOI Analysis (`CalendarHeatmap` & `ComparisonPanels`), Reference Views (`Sources`, `Methods`, `About`), and open tool panels/drawers.

| Viewport | Category | `scrollWidth <= innerWidth` | Header Bounds (`hdrInBounds`) | Map Canvas Size (`px`) | Bottom Dock Bounds (`dockInBounds`) | Primary Touch Target (`Menu` / Controls) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`1920×1080`** | Large Desktop | `1920 <= 1920` (`true`) | `0..1920` (`true`) | `1920 × 991` | `true` (`40px` height) | Desktop `36×36px` | **PASS** |
| **`1440×900`** | Standard Desktop | `1440 <= 1440` (`true`) | `0..1440` (`true`) | `1440 × 811` | `true` (`40px` height) | Desktop `36×36px` | **PASS** |
| **`1280×800`** | Small Laptop | `1280 <= 1280` (`true`) | `0..1280` (`true`) | `1280 × 711` | `true` (`40px` height) | Desktop `36×36px` | **PASS** |
| **`1024×768`** | Tablet Landscape / Compact Desktop | `1024 <= 1024` (`true`) | `0..1024` (`true`) | `1024 × 679` | `true` (`40px` height) | Desktop/Tablet `36–40px` | **PASS** |
| **`768×1024`** | Tablet Portrait | `768 <= 768` (`true`) | `0..768` (`true`) | `768 × 935` | `true` (`40px` height) | Tablet `40–44px` | **PASS** |
| **`430×932`** | Large Mobile Portrait | `430 <= 430` (`true`) | `0..430` (`true`) | `430 × 846` | `true` (`44px` height) | `44 × 44px` | **PASS** |
| **`390×844`** | Standard Mobile Portrait | `390 <= 390` (`true`) | `0..390` (`true`) | `390 × 758` | `true` (`44px` height) | `44 × 44px` | **PASS** |
| **`360×800`** | Narrow Mobile Portrait | `360 <= 360` (`true`) | `0..360` (`true`) | `360 × 714` | `true` (`44px` height) | `44 × 44px` | **PASS** |
| **`844×390`** | Mobile Landscape | `844 <= 844` (`true`) | `0..844` (`true`) | `844 × 301` | `true` (`40px` height) | `40 × 44px` | **PASS** |

---

## 4. Functional, Interactive & Accessibility Verification Matrix

| Verification Area | Test Scenario Executed | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **Header Navigation & Breakpoints** | Inspect header across `1920px`, `1280px`, `1024px`, `768px`, `844px`, and `360px`. | Zero overlapping borders or text clipping. Full 5 tabs at `>=1280px`, compact `[Map \| Analysis]` + AOI/Date triggers at `1024px`, `[Map \| Analysis]` + Live badge + utilities at `768px`, and `Menu (44×44)` + `FireScope` + `[Map \| Analysis]` + `LIVE` + `Theme (44×44)` at `360px`. | **PASS** |
| **Primary Navigation Drawer (`< 1024px`)** | Open `Menu` on `360×800` and `768×1024`; verify Quick Workspace Tools (`Select AOI`, `Date Window`, `Share Link`, `Help & Keys`), workspace tabs, and AOI presets. | Drawer opens cleanly with backdrop scrim, `min-h-[44px]` buttons, and 1-tap access to AOI selector, Timeline tray, Share URL copy, and Keyboard Help modal. | **PASS** |
| **Collapsible Map Controls (`< 1024px`)** | On `360×800`, `768×1024`, and `844×390`, toggle `Map Controls · POINTS` button (`aria-expanded`). | Collapsed by default on `< 1024px` so the map canvas is unobstructed; tapping expands Basemap, `TODAY UTC / 24HRS LIVE`, `Points/Grid/Cluster` + resolution, and Hotspot Legend in a scrollable overlay panel (`max-h-[calc(100dvh-230px)]`). | **PASS** |
| **AOI Selector & Measurement Popovers on `360×800`** | Open `AOI` and `Measure` from `MapToolDock` on `360×800`. | Popover renders at `x=10..350` (`width=340px`, `top=214px`, `bottom=708px`), sitting cleanly between the upper-left zoom cluster (`bottom=186px`) and the bottom `MapToolDock` (`top=724px`) with zero horizontal or vertical overlap. | **PASS** |
| **Slide-Over Drawers (`LayerDrawer` & `ObservationInspector`)** | Open `Layers & Filters` and `ObservationInspector` on `360×800` and `768×1024`; compare with `1440×900`. | Below `1024px`, drawers slide over the right edge (`fixed inset-y-0 right-0 z-40`) with a tap-to-close backdrop scrim while the underlying map retains its full `360×714` / `768×935` size. At `>= 1024px`, drawers dock side-by-side (`relative`) and `ResizeObserver` invalidates the Leaflet map size automatically. | **PASS** |
| **Leaflet Resize & Orientation Change** | Resize viewport from `390×844` (portrait) to `844×390` (landscape) and back to `360×800`. | `window` `resize`/`orientationchange` + `ResizeObserver` immediately update the `.leaflet-container` (`390×758` → `844×301` → `360×714`) with zero gray/missing tile regions or stale coordinates. | **PASS** |
| **Secondary Context & Provenance Strip** | Inspect strip on `360×800` and toggle `Provenance` disclosure button (`aria-expanded`). | Displays AOI name and UTC window cleanly on one line; tapping `Provenance` expands full sensor (`MODIS + VIIRS`), method (`M0 + M1 + M2`), and S-NPP continuity details without horizontal clipping. | **PASS** |
| **AOI Analysis & Reference Pages (`360×800` – `1920×1080`)** | Switch to `AOI Analysis`, `Sources`, `Methods`, and `About` on `360×800`, `768×1024`, and `1440×900`. | KPI cards stack into 1 column on mobile (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`), `CalendarHeatmap` wraps cleanly inside its horizontal scroll container with visible month labels, and Reference pages remain `scrollWidth == innerWidth` (`360 == 360`). | **PASS** |
| **Keyboard Accessibility & `Escape` Dismissal** | Navigate interactive controls via `Tab` / `Shift+Tab` and press `Escape` while drawers, popovers, or modals are open. | Focus rings (`:focus-visible`) are clearly visible in both Warm Paper and Obsidian Dark themes; pressing `Escape` closes open modals, drawers, popovers, timeline tray, and provenance disclosure. | **PASS** |
