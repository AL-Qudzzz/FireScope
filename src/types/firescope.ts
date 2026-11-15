export type SensorId = 'MODIS' | 'VIIRS';
export type SensorFilter = 'ALL' | 'MODIS' | 'VIIRS';

export type PlatformId = 'TERRA' | 'AQUA' | 'SNPP' | 'NOAA20' | 'NOAA21';

export type ProcessingStatus = 'URT' | 'RT' | 'NRT' | 'STANDARD' | 'UNKNOWN';

export type ConfidenceScheme = 'MODIS_NUMERIC_0_100' | 'VIIRS_C2_CATEGORICAL';

export type Granularity = 'day' | 'week' | 'month';

export type MethodLevelId = 'M0_RAW' | 'M1_AGGREGATED' | 'M2_COMPARATIVE';

export type GatedMethodLevelId =
  | 'M3_HARMONIZED'
  | 'M3_CALIBRATED'
  | 'M3_EMPIRICAL_PLATFORM_BRIDGE'
  | 'M4_BIAS_AWARE';

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

export type CrossSensorRegime =
  | 'DUAL_SENSOR_PEAK'
  | 'DUAL_SENSOR_ACTIVE'
  | 'VIIRS_375M_DOMINATED'
  | 'MODIS_1KM_ONLY'
  | 'QUIET_VERIFIED'
  | 'COVERAGE_GAP';

export type M2MethodId =
  | 'M2_POINT_PROXIMITY_6H'
  | 'M2_GRID_DAILY_025_DEG'
  | 'M2_UNAVAILABLE';

export interface BinSpatialConcordance {
  method_id?: M2MethodId;
  m2_method_id?: M2MethodId;
  method_name?: string;
  spatial_resolution?: string;
  temporal_resolution?: string;
  spatial_threshold_km?: number | null;
  temporal_threshold_hours?: number | null;
  aggregation_method?: string;
  grid_resolution_deg: number;
  active_cells_total: number;
  total_active_cells: number;
  co_located_cells_count: number;
  co_located_cells: number;
  modis_only_cells_count: number;
  modis_only_cells: number;
  viirs_only_cells_count: number;
  viirs_only_cells: number;
  modis_eligible_cells_count?: number;
  modis_eligible_count?: number;
  viirs_eligible_cells_count?: number;
  viirs_eligible_count?: number;
  intersection_count?: number;
  union_count?: number;
  spatial_co_located_cells_pct: number | null;
  spatial_concordance_pct?: number | null;
  cell_concordance_pct: number | null;
  jaccard_index?: number | null;
  modis_cell_co_detection_pct?: number | null;
  modis_cell_co_detected_pct: number | null;
  modis_co_detected_by_viirs_pct?: number | null;
  modis_conditional_rate?: number | null;
  viirs_cell_co_detection_pct?: number | null;
  viirs_cell_co_detected_pct: number | null;
  viirs_co_detected_by_modis_pct?: number | null;
  viirs_conditional_rate?: number | null;
  coverage_state?: BinCoverageState;
  source_backing?: DataSourceBacking | string;
  note?: string;
}

export interface ViirsPlatformNormalizationSummary {
  method_id: 'M2_COMPARATIVE';
  normalization_formula: string;
  formula?: string;
  total_viirs_detections: number;
  raw_viirs_total: number;
  raw_viirs_detections?: number;
  available_viirs_platforms: Array<'SNPP' | 'NOAA20' | 'NOAA21'>;
  active_viirs_platforms: Array<'SNPP' | 'NOAA20' | 'NOAA21'>;
  per_platform_counts: {
    SNPP: number;
    NOAA20: number;
    NOAA21: number;
  };
  per_platform_covered_bins: {
    SNPP: number;
    NOAA20: number;
    NOAA21: number;
  };
  per_platform_covered_days?: {
    SNPP: number;
    NOAA20: number;
    NOAA21: number;
  };
  covered_bins_total: number;
  requested_bins_total: number;
  window_days?: number;
  eligible_days?: number;
  viirs_platform_days?: number;
  effective_k_viirs: number | null;
  effective_active_platforms: number;
  effective_viirs_platforms?: number | null;
  expected_viirs_platforms?: number;
  viirs_effective_platform_count?: number | null;
  viirs_per_active_platform: number | null;
  viirs_per_effective_platform?: number | null;
  normalized_viirs_per_platform?: number | null;
  viirs_per_platform_bin: number | null;
  coverage_completeness_pct: number | null;
  platform_status_note?: string;
  scientific_caveat: string;
}

export interface SourceContributionProvenance {
  source_id: string;
  source_label?: string;
  label?: string;
  backing?: DataSourceBacking;
  source_type?:
    | 'PARQUET_ARCHIVE'
    | 'NASA_AREA_API'
    | 'NASA_LIVE_24H_FEED'
    | 'DEMO_FIXTURE'
    | 'EONET_EVENTS';
  sensors?: SensorId[];
  platforms?: PlatformId[];
  first_available_date?: string | null;
  last_available_date?: string | null;
  temporal_coverage?: {
    start_date: string | null;
    end_date: string | null;
  };
  requested_period?: {
    start_date: string;
    end_date: string;
  };
  returned_period?: {
    start_date: string | null;
    end_date: string | null;
  };
  spatial_scope?: string;
  spatial_coverage_note?: string;
  record_count: number;
  retrieved_at_utc?: string;
  coverage_completeness:
    | 'COMPLETE'
    | 'PARTIAL_REGIONAL'
    | 'PARTIAL_TEMPORAL'
    | 'LIVE_ONLY'
    | 'UNAVAILABLE';
  note?: string;
  missing_intervals?: Array<{
    start_date: string;
    end_date: string;
    reason: string;
  }>;
}

export interface CrossSensorHarmonizationSummary {
  method_id: 'M2_COMPARATIVE' | M2MethodId;
  m2_spatial_method_id?: M2MethodId;
  m2_spatial_method_name?: string;
  method_version: string;
  formula: string;
  spatial_unit: string;
  time_window: string;
  spatial_resolution?: string;
  temporal_resolution?: string;
  spatial_threshold_km?: number | null;
  temporal_threshold_hours?: number | null;
  aggregation_method?: string;
  source_backing?: DataSourceBacking | string;
  active_bins_total: number;
  co_detected_bins_count: number;
  viirs_only_bins_count: number;
  modis_only_bins_count: number;
  quiet_verified_bins_count: number;
  temporal_concordance_pct: number | null;
  temporal_concordance: {
    total_active_bins: number;
    co_active_bins: number;
    co_detected_bins: number;
    modis_only_bins: number;
    viirs_only_bins: number;
    temporal_jaccard_pct: number | null;
    log_pearson_r: number | null;
  };
  spatial_co_located_cells_pct: number | null;
  spatial_concordance: BinSpatialConcordance;
  active_cells_total?: number;
  co_located_cells_count?: number;
  modis_only_cells_count?: number;
  viirs_only_cells_count?: number;
  modis_eligible_cells_count?: number;
  viirs_eligible_cells_count?: number;
  intersection_count?: number;
  union_count?: number;
  jaccard_index?: number | null;
  modis_cell_co_detection_pct?: number | null;
  modis_co_detected_by_viirs_pct?: number | null;
  modis_conditional_rate?: number | null;
  viirs_cell_co_detection_pct?: number | null;
  viirs_co_detected_by_modis_pct?: number | null;
  viirs_conditional_rate?: number | null;
  coverage_completeness_pct?: number | null;
  viirs_to_modis_ratio: number | null;
  empirical_viirs_to_modis_ratio: number | null;
  dominant_regime_note: string;
  scientific_caveat: string;
}

export interface CalendarBinRecord {
  bin_key: string;
  label: string;
  time_bin_start_utc: string;
  time_bin_end_utc: string;
  granularity: Granularity;
  coverage_state: BinCoverageState;
  source_backing?: DataSourceBacking;
  cross_sensor_regime?: CrossSensorRegime;
  spatial_concordance?: BinSpatialConcordance;
  k_viirs_active?: number;
  viirs_platform_days?: number;
  eligible_days?: number;
  viirs_effective_platform_count?: number | null;
  viirs_per_platform?: number | null;
  viirs_per_effective_platform?: number | null;
  m3_status?: 'M3_DISABLED';
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
  co_location?: CoLocationSummary;
}

export type DataMode =
  | 'LIVE_NASA_FIRMS'
  | 'LIVE_NASA_EONET_HYBRID'
  | 'NASA_ARCHIVE_BASELINE'
  | 'PARTIAL_COVERAGE'
  | 'NO_SOURCE_DATA'
  | 'SERVER_UNAVAILABLE'
  | 'DEMO_FIXTURE_BASELINE'
  | 'DEMO_SNAPSHOT';

export interface CalendarAnalyticsResponse {
  data_mode: DataMode;
  data_backing?: DataSourceBacking;
  demo_notice: string;
  requested_window?: {
    start_date: string;
    end_date: string;
  };
  actual_coverage_window?: {
    start_date: string | null;
    end_date: string | null;
  };
  incomplete_coverage?: boolean;
  coverage_warning?: string | null;
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
  cross_sensor_harmonization?: CrossSensorHarmonizationSummary;
  viirs_platform_normalization?: ViirsPlatformNormalizationSummary;
  source_provenance?: SourceContributionProvenance[];
  m3_production_status?: 'M3_DISABLED';
  thresholds: {
    MODIS: [number, number, number, number];
    VIIRS: [number, number, number, number];
  };
  series: CalendarBinRecord[];
  harmonization?: HarmonizationSummary;
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
  co_location?: CoLocationSummary;
  grid_concordance?: CoLocationSummary;
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

export interface LivePipelineReconciliation {
  raw_csv_rows: number;
  parsed_valid_rows: number;
  exact_duplicates_removed: number;
  superseded_nrt_count: number;
  canonical_observations: number;
  in_global_world_bbox_count: number;
  excluded_offshore_count: number;
  onshore_map_eligible_count: number;
  default_map_sample_limit: number;
  reconciliation_note: string;
}

export interface MapHotspotsResponse {
  data_mode: DataMode;
  data_backing?: DataSourceBacking;
  sources?: string[];
  method_note?: string;
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
  live_reconciliation?: LivePipelineReconciliation;
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
  | 'GLOBAL_PRESETS_ARCHIVE'
  | 'FIRMS_AREA_API'
  | 'HYBRID_PARQUET_AND_LIVE'
  | 'HYBRID_ARCHIVE_AND_LIVE'
  | 'NO_SOURCE_DATA'
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

export interface GlobalPresetsArchiveStatus {
  available: boolean;
  schema_version: string;
  generated_at_utc: string;
  source: string;
  aoi_ids: string[];
  coverage_windows: Array<{ start_date: string; end_date: string }>;
  canonical_rows_total: number;
  bucket_rows_total: number;
  representative_observations_total: number;
  superseded_nrt_count: number;
  exact_duplicates_removed: number;
  checksums: string[];
}

export interface IndonesiaGapBackfillStatus {
  available: boolean;
  gap_date: string;
  target_date: string;
  coverage_date: string;
  source: string;
  retrieved_at_utc?: string;
  canonical_count: number;
  canonical_observations: number;
  canonical_rows_total: number;
  bucket_count: number;
  daily_buckets_count: number;
  bucket_rows_total: number;
  modis_count: number;
  modis_detections: number;
  viirs_count: number;
  viirs_detections: number;
  checksums: string[];
  sha256_checksums: string[];
  feed_stats?: unknown[];
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
  live_reconciliation?: LivePipelineReconciliation;
  firms_map_key_configured?: boolean;
  live_eonet_connected?: boolean;
  live_eonet_event_count?: number;
  live_eonet_synced_at_utc?: string;
  parquet_archive?: ParquetArchiveManifest | null;
  indonesia_gap_backfill?: IndonesiaGapBackfillStatus | null;
  global_presets_archive?: GlobalPresetsArchiveStatus | null;
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
  source_backing: 'PARQUET' | 'GLOBAL_PRESETS' | 'AREA_API' | 'LIVE' | 'MIXED';
}

export interface MapGridResponse {
  mode: 'grid' | 'cluster';
  cell_size_deg: number;
  data_backing: DataSourceBacking;
  sources?: string[];
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
  modis_expected_satellites?: number;
  viirs_expected_satellites?: number;
  modis_effective_satellites?: number;
  viirs_effective_satellites?: number;
  viirs_platform_days?: number;
  eligible_days?: number;
  modis_per_satellite?: number | null;
  viirs_per_satellite?: number | null;
  viirs_per_effective_satellite?: number | null;
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
  modis_per_satellite_delta?: number | null;
  viirs_per_satellite_delta?: number | null;
}

export interface YoyYearSummary {
  year: number;
  start_date: string;
  end_date: string;
  modis_detections: number;
  viirs_detections: number;
  modis_expected_satellites?: number;
  viirs_expected_satellites?: number;
  modis_effective_satellites?: number;
  viirs_effective_satellites?: number;
  viirs_platform_days?: number;
  eligible_days?: number;
  modis_per_satellite?: number;
  viirs_per_satellite?: number;
  viirs_per_effective_satellite?: number;
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
    period_a_modis_satellites?: number;
    period_b_modis_satellites?: number;
    period_a_modis_effective_satellites?: number;
    period_b_modis_effective_satellites?: number;
    period_a_modis_per_satellite?: number | null;
    period_b_modis_per_satellite?: number | null;
    modis_per_satellite_delta?: number | null;
    modis_per_satellite_pct_change?: number | null;
    period_a_viirs_satellites?: number;
    period_b_viirs_satellites?: number;
    period_a_viirs_effective_satellites?: number;
    period_b_viirs_effective_satellites?: number;
    period_a_viirs_platform_days?: number;
    period_b_viirs_platform_days?: number;
    period_a_eligible_days?: number;
    period_b_eligible_days?: number;
    period_a_viirs_per_satellite?: number | null;
    period_b_viirs_per_satellite?: number | null;
    period_a_viirs_per_effective_satellite?: number | null;
    period_b_viirs_per_effective_satellite?: number | null;
    viirs_per_satellite_delta?: number | null;
    viirs_per_satellite_pct_change?: number | null;
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
    aoi_a_modis_density_per_1000_km2?: number | null;
    aoi_a_viirs_density_per_1000_km2?: number | null;
    aoi_b_modis_density_per_1000_km2?: number | null;
    aoi_b_viirs_density_per_1000_km2?: number | null;
    aoi_a_modis_frp_sum_mw?: number | null;
    aoi_a_viirs_frp_sum_mw?: number | null;
    aoi_b_modis_frp_sum_mw?: number | null;
    aoi_b_viirs_frp_sum_mw?: number | null;
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

export type CalendarMetricId = 'detection_count' | 'frp_mw';

export interface HarmonizedBinPoint {
  bin_key: string;
  label: string;
  time_bin_start_utc: string;
  time_bin_end_utc: string;
  modis_active_platforms: number;
  viirs_active_platforms: number;
  modis_raw: number | null;
  viirs_raw: number | null;
  modis_per_platform: number | null;
  viirs_per_platform: number | null;
  viirs_calibrated_modis_equiv: number | null;
  bridged_modis_equiv: number | null;
  bridged_lower_80: number | null;
  bridged_upper_80: number | null;
  bridged_source: 'MODIS_OBSERVED' | 'OVERLAP_BLENDED' | 'VIIRS_CALIBRATED' | 'NO_DATA';
  modis_robust_z: number | null;
  viirs_robust_z: number | null;
  composite_robust_z: number | null;
}

export interface HarmonizationDiagnostics {
  method_id: 'M3_EMPIRICAL_PLATFORM_BRIDGE';
  method_version: '1.0.0';
  metric_id: CalendarMetricId;
  calibrated: boolean;
  calibration_mode: 'OLS_LOG_BRIDGE' | 'ROBUST_MEDIAN_RATIO' | 'PLATFORM_NORMALIZED_ONLY';
  overlap_bin_count: number;
  active_overlap_bin_count: number;
  alpha_intercept: number;
  beta_slope: number;
  per_platform_median_ratio: number | null;
  per_platform_iqr_ratio: [number, number] | null;
  raw_median_ratio: number | null;
  log_pearson_r: number | null;
  log_r_squared: number | null;
  validation_scheme: 'CHRONOLOGICAL_70_30_HOLDOUT' | 'LEAVE_ONE_OUT_CV' | 'INSUFFICIENT_OVERLAP';
  holdout_sample_count: number;
  holdout_mae: number | null;
  holdout_rmse: number | null;
  residual_sigma_log: number;
  formula_summary: string;
  scientific_caveat: string;
}

export interface HarmonizationSummary {
  diagnostics: HarmonizationDiagnostics;
  points: HarmonizedBinPoint[];
}

export type CoLocationClassification =
  | 'CO_DETECTED_BOTH'
  | 'VIIRS_ONLY_SMALL_OR_GAP'
  | 'MODIS_ONLY_OVERPASS';

export interface CoLocationCluster {
  cluster_id: string;
  classification: CoLocationClassification;
  centroid_lat: number;
  centroid_lon: number;
  earliest_utc: string;
  latest_utc: string;
  time_span_minutes: number;
  modis_count: number;
  viirs_count: number;
  viirs_to_modis_ratio: number | null;
  modis_frp_sum_mw: number;
  viirs_frp_sum_mw: number;
  platforms: PlatformId[];
  observation_ids: string[];
}

export interface CoLocationSummary {
  method_id?: M2MethodId;
  method_name?: string;
  spatial_resolution?: string;
  temporal_resolution?: string;
  spatial_threshold_km?: number | null;
  temporal_threshold_hours?: number | null;
  aggregation_method?: string;
  eligible_observation_count?: number;
  modis_eligible_count?: number;
  viirs_eligible_count?: number;
  intersection_count?: number;
  union_count?: number;
  jaccard_index?: number | null;
  modis_conditional_rate?: number | null;
  viirs_conditional_rate?: number | null;
  spatial_concordance_pct?: number | null;
  modis_co_detection_pct?: number | null;
  viirs_co_detection_pct?: number | null;
  coverage_state?: BinCoverageState;
  source_backing?: DataSourceBacking | string;
  note?: string;
  evaluation_scope?: 'FULL_BIN_POINTS' | 'FULL_BIN_GRID_BUCKETS';
  spatial_radius_km_rule: string;
  temporal_window_hours: number;
  total_observations: number;
  modis_total_detections?: number;
  viirs_total_detections?: number;
  total_clusters: number;
  co_detected_clusters: number;
  viirs_only_clusters: number;
  modis_only_clusters: number;
  co_detected_modis_obs: number;
  co_detected_viirs_obs: number;
  empirical_co_detected_viirs_per_modis: number | null;
  co_detected_modis_frp_mw: number;
  co_detected_viirs_frp_mw: number;
  clusters: CoLocationCluster[];
}



