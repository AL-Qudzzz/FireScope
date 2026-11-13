export type SensorId = 'MODIS' | 'VIIRS';
export type SensorFilter = 'ALL' | 'MODIS' | 'VIIRS';

export type PlatformId = 'TERRA' | 'AQUA' | 'SNPP' | 'NOAA20' | 'NOAA21';

export type ProcessingStatus = 'URT' | 'RT' | 'NRT' | 'STANDARD' | 'UNKNOWN';

export type ConfidenceScheme = 'MODIS_NUMERIC_0_100' | 'VIIRS_C2_CATEGORICAL';

export type Granularity = 'day' | 'week' | 'month';

export type MethodLevelId = 'M0_RAW' | 'M1_AGGREGATED' | 'M2_COMPARATIVE';

export type BinCoverageState =
  | 'OBSERVED_ACTIVE'
  | 'NO_DETECTIONS_IN_AVAILABLE_RECORDS'
  | 'PARTIAL_COVERAGE'
  | 'NO_SOURCE_DATA'
  | 'COVERAGE_UNKNOWN';

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeoPoint {
  lng: number;
  lat: number;
}

export interface AoiDefinition {
  id: string;
  name: string;
  regionLabel: string;
  description: string;
  geometryType: 'BBOX' | 'POLYGON';
  bbox: BoundingBox;
  polygon?: GeoPoint[];
  timezone: string;
  utcOffsetLabel: string;
  areaSqKm: number;
  biome: string;
  isPreset?: boolean;
}

export interface CanonicalObservation {
  observation_id: string;
  source_product: string;
  sensor: SensorId;
  platform: PlatformId;
  instrument: 'MODIS' | 'VIIRS';
  latitude: number;
  longitude: number;
  acq_datetime_utc: string;
  acq_date: string;
  acq_time_native: string;
  frp_mw: number | null;
  brightness_native: number | null;
  bright_ti4_native: number | null;
  bright_ti5_native: number | null;
  bright_t31_native: number | null;
  scan_native: number | null;
  track_native: number | null;
  confidence_native: number | string | null;
  confidence_scheme: ConfidenceScheme;
  daynight_native: 'D' | 'N' | null;
  type_native: number | string | null;
  processing_version: string;
  processing_status: ProcessingStatus;
  collection: string;
  source_retrieved_at_utc: string;
  source_file_checksum: string;
  source_row_number: number | null;
  raw_attributes: Record<string, string | number | null>;
}

export interface PlatformRegistryEntry {
  platform_id: PlatformId;
  display_name: string;
  sensor: SensorId;
  instrument: 'MODIS' | 'VIIRS';
  product_code: string;
  collection: string;
  nominal_resolution: string;
  first_observation_date: string;
  last_observation_date: string;
  status: 'ACTIVE' | 'NO_RECENT_DATA' | 'HISTORICAL_ONLY';
  processing_Available: ProcessingStatus[];
  latest_acquisition_utc: string;
  status_checked_at_utc: string;
  status_source_url: string;
  status_note: string;
  color_hex: string;
}

export interface RawArchiveManifestEntry {
  file_id: string;
  filename: string;
  source_url: string;
  source_product: string;
  sensor: SensorId;
  platform: PlatformId;
  collection: string;
  processing_status: ProcessingStatus;
  retrieved_at_utc: string;
  sha256_checksum: string;
  row_count: number;
  aoi_id: string;
  date_window: string;
}

export interface FrpSummaryStats {
  sensor: SensorId;
  platform?: PlatformId | 'ALL';
  unit: 'MW';
  sum_mw: number | null;
  mean_mw: number | null;
  median_mw: number | null;
  p90_mw: number | null;
  max_mw?: number | null;
  valid_count: number;
  null_count: number;
  processing_status_note: string;
}

export interface SeasonalBaselineComparison {
  sensor: SensorId;
  baseline_years: number[];
  baseline_median: number;
  baseline_mad: number;
  observed_value: number;
  delta_from_median: number;
  robust_z: number | null;
  mad_zero_fallback_used: boolean;
  percentile_rank: number;
  status_label:
    | 'Within historical baseline'
    | 'Elevated relative to this baseline'
    | 'Unusual relative to this baseline'
    | 'Below historical median'
    | 'Baseline unavailable (insufficient history)';
  method_formula: string;
  caveat_note: string;
}

export interface CalendarBinRecord {
  bin_key: string;
  label: string;
  time_bin_start_utc: string;
  time_bin_end_utc: string;
  granularity: Granularity;
  coverage_state: BinCoverageState;
  values: {
    MODIS: number | null;
    VIIRS: number | null;
  };
  platform_breakdown: Record<PlatformId, number>;
  processing_breakdown: Record<ProcessingStatus, number>;
  frp_summary: {
    MODIS: FrpSummaryStats;
    VIIRS: FrpSummaryStats;
  };
  confidence_breakdown: {
    MODIS_numeric_bins: { low_0_29: number; nominal_30_79: number; high_80_100: number };
    VIIRS_categorical: { low: number; nominal: number; high: number };
  };
  pooled_observation_count: number | null;
  pooled_caveat: string;
  quality: {
    coverage_note: string;
    active_platforms: PlatformId[];
    unavailable_platforms: PlatformId[];
    superseded_nrt_count: number;
    exact_duplicates_removed: number;
  };
  seasonal_baseline?: {
    MODIS: SeasonalBaselineComparison;
    VIIRS: SeasonalBaselineComparison;
  };
}

export type DataMode = 'LIVE_NASA_FIRMS' | 'LIVE_NASA_EONET_HYBRID' | 'DEMO_SNAPSHOT';

export interface CalendarAnalyticsResponse {
  data_mode: DataMode;
  demo_notice: string;
  aoi: {
    id: string;
    name: string;
    bbox: BoundingBox;
    timezone: string;
    area_sq_km: number;
  };
  query: {
    start_date: string;
    end_date: string;
    granularity: Granularity;
    metric: 'detection_count' | 'frp_mw';
    sensor: SensorFilter;
    platforms: PlatformId[];
    processing_status: ProcessingStatus | 'ALL';
    daynight: 'ALL' | 'D' | 'N';
  };
  method: {
    id: MethodLevelId;
    version: string;
    description: string;
    formula: string;
    non_claims: string[];
  };
  totals: {
    MODIS_detections: number;
    VIIRS_detections: number;
    pooled_observation_count: number;
    platform_totals: Record<PlatformId, number>;
    MODIS_frp: FrpSummaryStats;
    VIIRS_frp: FrpSummaryStats;
    superseded_nrt_total: number;
    duplicates_removed_total: number;
  };
  thresholds: {
    MODIS: [number, number, number, number];
    VIIRS: [number, number, number, number];
  };
  series: CalendarBinRecord[];
  provenance: {
    sources: string[];
    collections: string[];
    retrieved_at_utc: string;
    latest_acquisition_utc: string;
    archive_checksums: string[];
  };
}

export interface PaginatedObservationsResponse {
  data_mode: DataMode;
  items: CanonicalObservation[];
  total_matching: number;
  limit: number;
  next_cursor: string | null;
  method: {
    id: 'M0_RAW';
    version: string;
    note: string;
  };
  provenance: {
    sources: string[];
    retrieved_at_utc: string;
  };
}

export interface MapHotspotsResponse {
  data_mode: DataMode;
  total_global_24h: number;
  total_in_viewport: number;
  returned_count: number;
  excluded_offshore_count?: number;
  exclude_offshore?: boolean;
  sampled: boolean;
  synced_at_utc: string;
  latest_acquisition_utc: string;
  min_date: string;
  max_date: string;
  items: CanonicalObservation[];
}

export interface FirmsFeedStatusEntry {
  id: string;
  product: string;
  platform: string;
  row_count: number;
  sha256: string;
  source_url: string;
}

export type DataSourceBacking =
  | 'LIVE_NASA_FIRMS'
  | 'REAL_NASA_ARCHIVE_PARQUET'
  | 'HYBRID_PARQUET_AND_LIVE'
  | 'DEMO_FIXTURE_BASELINE';

export interface ParquetArchiveSourceFile {
  file_id: string;
  filename: string;
  zip_filename: string;
  zip_sha256: string;
  source_url: string;
  source_product: string;
  sensor: SensorId;
  collection: string;
  processing_status: ProcessingStatus;
  sha256_checksum: string;
  row_count: number;
  date_window: string;
  platforms: PlatformId[];
}

export interface ParquetArchiveManifest {
  available: boolean;
  schema_version: string;
  generated_at_utc: string;
  spatial_grid_resolution_deg: number;
  crs: string;
  coverage_bbox: BoundingBox;
  region_label: string;
  date_range: {
    min_date: string;
    max_date: string;
  };
  raw_rows_total: number;
  canonical_rows_total: number;
  superseded_nrt_count: number;
  exact_duplicates_removed: number;
  daily_aggregates_parquet: {
    path: string;
    rows: number;
    bytes: number;
  };
  recent_observations_parquet?: {
    path: string;
    min_date: string;
    rows: number;
    bytes: number;
  };
  platform_coverage: Array<{
    platform: PlatformId;
    sensor: SensorId;
    first_date: string;
    last_date: string;
    canonical_count: number;
  }>;
  source_files: ParquetArchiveSourceFile[];
}

export interface DataStatusResponse {
  status: 'OK' | 'PARTIAL_PLATFORM_GAP';
  data_mode: DataMode;
  demo_banner_text: string;
  retrieved_at_utc: string;
  latest_acquisition_utc: string;
  live_firms_connected?: boolean;
  live_firms_count?: number;
  live_firms_synced_at_utc?: string;
  live_firms_min_date?: string;
  live_firms_max_date?: string;
  live_firms_feeds?: FirmsFeedStatusEntry[];
  firms_map_key_configured?: boolean;
  live_eonet_connected?: boolean;
  live_eonet_event_count?: number;
  live_eonet_synced_at_utc?: string;
  parquet_archive?: ParquetArchiveManifest | null;
  firms_area_api_constraints: {
    day_range_min: number;
    day_range_max: number;
    transactions_per_10_min: number;
    nrt_to_standard_lag_months: number;
    rt_urt_retention_hours: number;
  };
  platforms: PlatformRegistryEntry[];
  raw_archive_manifest: RawArchiveManifestEntry[];
}

export type MapDisplayMode = 'points' | 'grid' | 'cluster';

export interface MapGridCell {
  cell_id: string;
  lat_bin: number;
  lng_bin: number;
  cell_size_deg: number;
  centroid_lat: number;
  centroid_lng: number;
  modis_detections: number;
  viirs_detections: number;
  pooled_observation_count: number;
  modis_frp_sum_mw: number;
  viirs_frp_sum_mw: number;
  platforms: PlatformId[];
  source_backing: 'PARQUET' | 'LIVE' | 'MIXED';
}

export interface MapGridResponse {
  mode: 'grid' | 'cluster';
  cell_size_deg: number;
  data_backing: DataSourceBacking;
  total_detections_modis: number;
  total_detections_viirs: number;
  excluded_offshore_count?: number;
  exclude_offshore?: boolean;
  cell_count: number;
  cells: MapGridCell[];
  method_note: string;
  spatial_caveat: string;
  synced_at_utc: string;
}

export interface PeriodBinValue {
  bin_key: string;
  label: string;
  modis_detections: number | null;
  viirs_detections: number | null;
  modis_frp_sum_mw: number | null;
  modis_frp_mean_mw: number | null;
  viirs_frp_sum_mw: number | null;
  viirs_frp_mean_mw: number | null;
  coverage_state: BinCoverageState;
  active_platforms: PlatformId[];
  processing_statuses: ProcessingStatus[];
}

export interface PeriodComparisonRow {
  aligned_index: number;
  aligned_label: string;
  period_a: PeriodBinValue | null;
  period_b: PeriodBinValue | null;
  modis_delta: number | null;
  viirs_delta: number | null;
}

export interface YoyYearSummary {
  year: number;
  start_date: string;
  end_date: string;
  modis_detections: number;
  viirs_detections: number;
  modis_frp_sum_mw: number | null;
  modis_frp_mean_mw: number | null;
  viirs_frp_sum_mw: number | null;
  viirs_frp_mean_mw: number | null;
  active_platforms: PlatformId[];
  processing_statuses: ProcessingStatus[];
  data_backing: DataSourceBacking;
}

export interface PeriodComparisonResponse {
  aoi: {
    id: string;
    name: string;
    bbox: BoundingBox;
    timezone: string;
    area_sq_km: number;
  };
  period_a: { label: string; start_date: string; end_date: string };
  period_b: { label: string; start_date: string; end_date: string };
  granularity: Granularity;
  sensor: SensorFilter;
  metric: 'detection_count' | 'frp_mw';
  data_backing: DataSourceBacking;
  totals: {
    period_a_modis: number;
    period_b_modis: number;
    modis_delta: number;
    modis_pct_change: number | null;
    period_a_viirs: number;
    period_b_viirs: number;
    viirs_delta: number;
    viirs_pct_change: number | null;
    period_a_modis_frp_mean_mw: number | null;
    period_b_modis_frp_mean_mw: number | null;
    period_a_viirs_frp_mean_mw: number | null;
    period_b_viirs_frp_mean_mw: number | null;
  };
  availability_warnings: string[];
  aligned_series: PeriodComparisonRow[];
  yoy_summary: YoyYearSummary[];
  method: {
    id: MethodLevelId;
    version: string;
    description: string;
    formula: string;
    non_claims: string[];
  };
  provenance: {
    sources: string[];
    retrieved_at_utc: string;
    archive_checksums: string[];
  };
}

export interface AoiComparisonSummary {
  aoi: {
    id: string;
    name: string;
    regionLabel: string;
    bbox: BoundingBox;
    timezone: string;
    area_sq_km: number;
    biome: string;
  };
  data_backing: DataSourceBacking;
  modis_detections: number;
  viirs_detections: number;
  pooled_observation_count: number;
  modis_per_1000_sq_km: number;
  viirs_per_1000_sq_km: number;
  modis_frp: FrpSummaryStats;
  viirs_frp: FrpSummaryStats;
  platform_totals: Record<PlatformId, number>;
  peak_bin_label: string | null;
  peak_bin_viirs: number | null;
  peak_bin_modis: number | null;
}

export interface AoiComparisonResponse {
  query: {
    start_date: string;
    end_date: string;
    granularity: Granularity;
    sensor: SensorFilter;
    metric: 'detection_count' | 'frp_mw';
  };
  aoi_a: AoiComparisonSummary;
  aoi_b: AoiComparisonSummary;
  aligned_series: Array<{
    bin_key: string;
    label: string;
    aoi_a_modis: number | null;
    aoi_a_viirs: number | null;
    aoi_b_modis: number | null;
    aoi_b_viirs: number | null;
  }>;
  comparability_warnings: string[];
  method: {
    id: MethodLevelId;
    version: string;
    description: string;
    caveat: string;
  };
  provenance: {
    sources: string[];
    retrieved_at_utc: string;
    archive_checksums: string[];
  };
}

export interface SavedAoiRecord {
  aoi: AoiDefinition;
  savedAtUtc: string;
}

export type AutoRefreshIntervalMs = 0 | 300000 | 600000;

export interface SharedQueryState {
  aoiId: string;
  customAoi: AoiDefinition | null;
  startDate: string;
  endDate: string;
  granularity: Granularity;
  sensor: SensorFilter;
  platforms: PlatformId[];
  processingStatus: ProcessingStatus | 'ALL';
  dayNight: 'ALL' | 'D' | 'N';
  modisMinConfidence: number; // 0..100 native MODIS filter
  viirsCategories: Array<'low' | 'nominal' | 'high'>; // native VIIRS filter
  excludeOffshore: boolean; // hide verified offshore marine flares (e.g. oil/gas rigs & NASA type=3)
  calendarMetric: 'detection_count' | 'frp_mw';
  controlDensity: 'overview' | 'analyst';
  selectedBinKey: string | null;
  selectedObservationId: string | null;
}

