---
title: FireScope Project Knowledge & Architecture Graph
product: FireScope
status: Design-level graph synthesized from supplied project documents
last_updated: 2026-11-13
---

# FireScope — Project Graph View

This file is the readable, version-controlled graph specification derived from the supplied Markdown documents. It separates (1) documented knowledge relationships, (2) system architecture/data lineage, and (3) the UI navigation graph.

**Important:** this Markdown graph is a human-authored synthesis of the supplied documents. It is not represented as an already-generated Graphify `graph.json`/`graph.html`. The build prompt instructs the coding agent to run Graphify against the real workspace so its interactive graph and edge provenance are generated from the full corpus.

## 1. Knowledge graph — documents, requirements, and concepts

Solid edges represent relationships stated by the supplied docs. Dashed edges represent a design/implementation dependency inferred from combining those documents and should be verified against the real codebase.

```mermaid
flowchart LR
  subgraph DOCS[Project source documents]
    AG[AGENTS.md]
    PRD[PRD.md]
    ARC[ARCHITECTURE.md]
    DD[DATA_DICTIONARY.md]
    MET[METHODOLOGY.md]
    API[API_CONTRACT.md]
    TR[TECHNICAL_RESEARCH.md]
    NS[NASA_DATA_SOURCES.md]
    TEST[TESTING.md]
    DEC[DECISIONS.md]
    HEX[HACKATHON_EXECUTION.md]
    R[README.md]
  end

  subgraph DOMAIN[Product and scientific concepts]
    AOI[Area of Interest]
    CAL[Burning Activity Calendar]
    M0[M0 Raw Observations]
    M1[M1 Aggregated]
    M2[M2 Comparative]
    M3[M3 Harmonized]
    SENSOR[MODIS / VIIRS]
    PROV[Provenance & Processing State]
    FRP[FRP in MW]
    BASE[Seasonal Baseline / Unusual Activity]
    GAP[Observation Opportunity & Missingness]
  end

  subgraph SYSTEM[Implementation concepts]
    ING[Ingestion and Validation]
    CAN[Canonical Observations]
    AGG[Sensor-specific Aggregation]
    STORE[DuckDB + Parquet]
    FAST[FastAPI]
    UI[React + MapLibre + ECharts]
  end

  PRD -->|defines P0| AOI
  PRD -->|defines core experience| CAL
  MET -->|defines levels| M0
  MET -->|defines levels| M1
  MET -->|defines levels| M2
  MET -->|defines optional validated level| M3
  TR -->|explains sensor differences| SENSOR
  DD -->|defines native schema| SENSOR
  DD -->|defines canonical fields| PROV
  DD -->|defines FRP field and units| FRP
  NS -->|documents source products and access| ING
  TR -->|sets MVP at M1/M2| M1
  TR -->|sets MVP at M1/M2| M2
  MET -->|defines missingness caveat| GAP
  TR -->|constrains baseline interpretation| BASE
  API -->|exposes calendar query| CAL
  ARC -->|defines pipeline and storage| ING
  ARC -->|defines backend and frontend| FAST
  AG -->|enforces scientific guardrails| MET
  AG -->|requires tests| TEST
  TEST -->|validates transformations| AGG
  DEC -->|accepts sensor provenance| PROV
  DEC -->|prioritizes calendar-first| CAL
  HEX -->|plans ingestion and demo| ING
  R -->|indexes project docs| PRD

  ING --> CAN
  CAN --> PROV
  CAN --> AGG
  SENSOR --> AGG
  AOI --> AGG
  GAP -.->|availability caveat| AGG
  FRP -.->|separate summary| AGG
  AGG --> STORE
  STORE --> FAST
  FAST --> UI
  CAL --> UI
  BASE -.->|P1 only| UI

  classDef doc fill:#F1F5F9,stroke:#64748B,color:#17212B;
  classDef domain fill:#ECFDF5,stroke:#0F766E,color:#134E4A;
  classDef system fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A;
  class DOCS doc;
  class DOMAIN domain;
  class SYSTEM system;
```

## 2. System architecture graph

```mermaid
flowchart TB
  NASA[NASA FIRMS / Verified Challenge Resources]
  subgraph BACKEND[Backend processing boundary]
    CLIENT[FIRMS API / Download Client]
    RAW[(Immutable Raw Files + SHA-256)]
    PARSE[Product-specific CSV Parsers]
    VALID[Schema, Value, Coordinate & Time Validation]
    CANON[Canonical Observation Schema]
    LIFECYCLE[NRT / RT / URT / Standard Lifecycle + Exact Duplicate Handling]
    QA[Sensor / Platform-specific QA]
    AGG[AOI + UTC Time-bin Aggregation]
    FRP[FRP Summary with Valid-value Count]
    BASE[Optional Seasonal Baseline — P1]
    DB[(DuckDB + Parquet)]
    API[FastAPI /api/v1]
  end
  subgraph FRONTEND[Frontend application]
    WEB[React + TypeScript + Vite]
    MAP[MapLibre Map & AOI Selection]
    CAL[Activity Calendar]
    CHART[ECharts Time Series]
    DETAIL[Bin Detail & Provenance]
    STATUS[Source / Platform Status]
  end
  NASA --> CLIENT --> RAW
  RAW --> PARSE --> VALID --> CANON --> LIFECYCLE --> QA --> AGG
  AGG --> DB
  QA --> FRP --> DB
  AGG -.-> BASE -.-> DB
  DB --> API
  API --> WEB
  WEB --> MAP
  WEB --> CAL
  WEB --> CHART
  WEB --> DETAIL
  WEB --> STATUS
  MAP -->|AOI / bbox / date filters| API
  CAL -->|calendar query| API
  CHART -->|series query| API
  DETAIL -->|bounded cursor-paginated query| API
  STATUS -->|dynamic status query| API
```

### 2.1 Key trust boundaries

- **NASA/source boundary:** raw source files are immutable, checksummed, and accompanied by source/product/collection/retrieval metadata.
- **Processing boundary:** parsers and canonicalization preserve the original native attributes; transformations are deterministic and method-versioned.
- **Scientific boundary:** MODIS and VIIRS stay separate through QA and aggregation. Pooled counts, if displayed, remain explicitly pooled observation records.
- **API boundary:** validate AOI/date inputs, preserve UTC, expose method/provenance, and paginate raw observations.
- **Browser boundary:** request bounded summaries; do not download all global raw observation points.

## 3. Data-flow and lifecycle graph

```mermaid
flowchart TD
  A[Download NASA source product] --> B[Store exact raw file]
  B --> C[Checksum + immutable manifest]
  C --> D[Detect product / platform / collection / version]
  D --> E[Parse acquisition date + HHMM as UTC]
  E --> F[Validate required columns, coordinates, finite values]
  F --> G[Canonicalize field names; retain raw_attributes]
  G --> H[Preserve native confidence, FRP, scan/track, platform]
  H --> I[Resolve exact duplicate ingestion copies]
  I --> J{Processing lifecycle}
  J -->|NRT/RT/URT| K[Low-latency monitoring dataset]
  J -->|Standard available| L[Use Standard for retrospective analysis]
  K --> M[Sensor/platform-specific QA]
  L --> M
  M --> N[Filter by AOI and UTC time bin]
  N --> O[Aggregate MODIS and VIIRS separately]
  O --> P[Persist aggregate + method + provenance]
  P --> Q[FastAPI calendar / status / observations]
  Q --> R[Calendar, map, chart, detail]
```

**Lifecycle rule:** do not add NRT and Standard copies of the same source observation as independent detections. Keep snapshot provenance for audit; use a documented supersession strategy and recompute affected aggregates idempotently.

## 4. UI interaction graph

```mermaid
flowchart TD
  HOME[Overview] --> AOI[Select or search AOI]
  AOI --> MAP[Map fits AOI]
  AOI --> FILTERS[Set date range and granularity]
  FILTERS --> CAL[Calendar refreshes]
  FILTERS --> CHART[Sensor-separated time series refreshes]
  FILTERS --> MAP
  FILTERS --> STATUS[Data status refreshes]
  CAL --> CELL[Select calendar cell]
  MAP --> POINT[Select map point or cluster]
  CELL --> DETAIL[Time-bin detail panel]
  POINT --> DETAIL
  DETAIL --> RECORDS[Paginated observation records]
  DETAIL --> PROV[Native confidence / FRP / provenance]
  HOME --> METHODS[Methodology & limitations]
  STATUS --> SOURCES[Data source and platform status]
```

## 5. Graphify knowledge-graph expectations

Run Graphify on the project documentation and implementation repository after the source documents are in the workspace.

Expected output folder: `graphify-out/`

| Output | Why it matters |
|---|---|
| `graph.html` | Interactive knowledge graph with searchable/filterable concepts and communities |
| `graph.json` | Persistent graph structure for future agent queries |
| `GRAPH_REPORT.md` | Central concepts, high-connectivity nodes, surprising links, and suggested questions |
| `wiki/` (optional) | Navigable Markdown articles grouped around concepts/communities |

Graphify edges must retain their origin labels:
- `EXTRACTED`: explicitly found in source files/code.
- `INFERRED`: plausible relationship suggested by extraction; verify before treating as a project fact.
- `AMBIGUOUS`: insufficient or conflicting source evidence; keep visible as unresolved.

Do not hand-edit `graph.json` to fabricate extraction provenance. Treat this document’s Mermaid diagrams as a readable architecture brief, and Graphify’s output as the actual generated knowledge graph.

### Useful Graphify queries after generation

- `What connects the PRD calendar-first requirement to the frontend components and API endpoints?`
- `Which scientific constraints affect each displayed metric?`
- `Where are MODIS and VIIRS kept separate throughout ingestion, QA, aggregation, and display?`
- `Which API fields are required to preserve source provenance in the selected-bin detail?`
- `Which assumptions or unresolved items are marked inferred or ambiguous?`

## 6. Archify diagram deliverables

Use Archify for system diagrams, not for the dashboard UI itself. Generate at minimum:

1. **Architecture diagram:** frontend, backend, NASA/source boundary, ingestion stages, storage, API, and user-facing modules.
2. **Dataflow diagram:** NASA source acquisition → immutable raw storage → parse/validate → canonicalize → lifecycle/QA → sensor-specific aggregation → persistence → API → UI.

Recommended artifact location:

```text
.archify/
  firescope-architecture/
    candidate.json
    firescope-architecture.html
  firescope-dataflow/
    candidate.json
    firescope-dataflow.html
```

The actual Archify candidate must follow the installed skill’s schema and pass its `finalize` validation/delivery/browser checks. Do not pretend a Mermaid diagram has been validated by Archify.

## 7. Provenance and open questions for the graph

- The complete client-rendered NASA Space Apps Resources-tab list still requires a human/browser verification step in the supplied research register.
- The exact AOI shape contract beyond `aoi_id` or `bbox` is not yet defined.
- Map tile source and license must be selected and attributed.
- Historical anomaly calculations depend on platform availability and processing-state continuity.
- The graph should be refreshed after meaningful source-doc or code changes; do not treat a stale graph as the latest architecture.
