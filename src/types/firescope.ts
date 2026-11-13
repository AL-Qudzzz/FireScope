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
  calendarMetric: 'detection_count' | 'frp_mw';
  controlDensity: 'overview' | 'analyst';
  selectedBinKey: string | null;
  selectedObservationId: string | null;
}
