import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  aggregateCalendarAnalytics,
  calculateGeometryMeasurement,
  computeFrpSummary,
  computeSeasonalBaseline,
  deduplicateAndSupersedeObservations,
  deriveProcessingStatus,
  isOffshoreMarineObservation,
  isPointInAoi,
  isVerifiedOffshoreMarineCoordinate,
  parseModisRecord,
  parseUtcAcquisitionTime,
  parseViirsRecord,
  validateBoundingBox,
} from './fireScience';
import { AoiDefinition, CalendarBinRecord, PlatformRegistryEntry } from '../types/firescope';
import {
  clusterCrossSensorObservations,
  computeBucketSpatialConcordance,
  computeHarmonizedSeries,
  getExpectedActivePlatforms,
} from './harmonizationScience';
import {
  canonicalizeEonetEvents,
  isTerrestrialWgs84Coordinate,
} from '../services/eonetLiveService';
import { ALL_ARCHIVE_OBSERVATIONS } from '../data/firmsArchiveData';

const SAMPLE_AOI: AoiDefinition = {
  id: 'kalimantan-peat',
  name: 'Central Kalimantan Peatlands, Indonesia',
  regionLabel: 'Southeast Asia · Borneo',
  description: 'Tropical peatland swamp forest monitoring zone',
  geometryType: 'BBOX',
  bbox: { west: 113.2, south: -3.2, east: 115.0, north: -1.8 },
  timezone: 'Asia/Pontianak',
  utcOffsetLabel: 'UTC+07:00',
  areaSqKm: 31120,
  biome: 'Tropical Peat Swamp Forest',
  isPreset: true,
};

const TEST_PLATFORM_REGISTRY: PlatformRegistryEntry[] = [
  {
    platform_id: 'TERRA',
    display_name: 'MODIS Terra',
    sensor: 'MODIS',
    instrument: 'MODIS',
    product_code: 'MOD14 / MCD14DL',
    collection: 'MODIS C6.1',
    nominal_resolution: '1 km',
    first_observation_date: '2000-11-01',
    last_observation_date: '2026-11-13',
    status: 'ACTIVE',
    processing_Available: ['NRT', 'STANDARD'],
    latest_acquisition_utc: '2026-11-13T03:15:00Z',
    status_checked_at_utc: '2026-11-13T04:00:00Z',
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note: 'Operational archive and NRT feed active.',
    color_hex: '#FFB454',
  },
  {
    platform_id: 'SNPP',
    display_name: 'VIIRS Suomi-NPP',
    sensor: 'VIIRS',
    instrument: 'VIIRS',
    product_code: 'VNP14IMGTDL',
    collection: 'VIIRS C2',
    nominal_resolution: '375 m',
    first_observation_date: '2012-01-20',
    last_observation_date: '2026-11-02',
    status: 'NO_RECENT_DATA',
    processing_Available: ['STANDARD', 'NRT'],
    latest_acquisition_utc: '2026-11-02T18:40:00Z',
    status_checked_at_utc: '2026-11-13T04:00:00Z',
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note: 'FIRMS archive coverage currently listed through 2026-11-02.',
    color_hex: '#61BDE0',
  },
  {
    platform_id: 'NOAA20',
    display_name: 'VIIRS NOAA-20',
    sensor: 'VIIRS',
    instrument: 'VIIRS',
    product_code: 'VJ114IMGTDL',
    collection: 'VIIRS C2',
    nominal_resolution: '375 m',
    first_observation_date: '2018-04-01',
    last_observation_date: '2026-11-13',
    status: 'ACTIVE',
    processing_Available: ['NRT', 'STANDARD'],
    latest_acquisition_utc: '2026-11-13T06:22:00Z',
    status_checked_at_utc: '2026-11-13T04:00:00Z',
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note: 'Operational archive and NRT feed active.',
    color_hex: '#38BDF8',
  },
];

test('parseUtcAcquisitionTime handles zero-padded and unpadded HHMM strings in UTC', () => {
  const r1 = parseUtcAcquisitionTime('2026-11-05', '42');
  assert.equal(r1.paddedHhmm, '0042');
  assert.equal(r1.acqDatetimeUtc, '2026-11-05T00:42:00Z');

  const r2 = parseUtcAcquisitionTime('2026-11-05', '0315');
  assert.equal(r2.paddedHhmm, '0315');
  assert.equal(r2.acqDatetimeUtc, '2026-11-05T03:15:00Z');

  assert.throws(() => parseUtcAcquisitionTime('2026-11-05', '2599'));
  assert.throws(() => parseUtcAcquisitionTime('invalid-date', '1200'));
});

test('parseModisRecord and parseViirsRecord preserve native confidence schemes without conversion', () => {
  const modisObs = parseModisRecord(
    {
      latitude: -2.5123,
      longitude: 114.1045,
      brightness: 328.4,
      scan: 1.1,
      track: 1.0,
      acq_date: '2026-11-01',
      acq_time: '315',
      satellite: 'Terra',
      confidence: 84,
      version: '6.1NRT',
      bright_t31: 294.2,
      frp: 34.6,
      daynight: 'D',
      type: 0,
    },
    {
      retrievedAtUtc: '2026-11-13T01:00:00Z',
      checksum: 'sha256-modis-test',
      rowNumber: 1,
    }
  );

  assert.equal(modisObs.sensor, 'MODIS');
  assert.equal(modisObs.platform, 'TERRA');
  assert.equal(modisObs.confidence_native, 84);
  assert.equal(modisObs.confidence_scheme, 'MODIS_NUMERIC_0_100');
  assert.equal(modisObs.processing_status, 'NRT');

  const viirsObs = parseViirsRecord(
    {
      latitude: -2.5128,
      longitude: 114.1051,
      bright_ti4: 346.8,
      scan: 0.39,
      track: 0.36,
      acq_date: '2026-11-01',
      acq_time: '0640',
      satellite: 'N20',
      instrument: 'VIIRS',
      confidence: 'h',
      version: '2.0NRT',
      bright_ti5: 296.1,
      frp: 12.4,
      daynight: 'D',
    },
    {
      retrievedAtUtc: '2026-11-13T01:00:00Z',
      checksum: 'sha256-viirs-test',
      rowNumber: 1,
    }
  );

  assert.equal(viirsObs.sensor, 'VIIRS');
  assert.equal(viirsObs.platform, 'NOAA20');
  assert.equal(viirsObs.confidence_native, 'high');
  assert.equal(viirsObs.confidence_scheme, 'VIIRS_C2_CATEGORICAL');
  assert.equal(viirsObs.processing_status, 'NRT');
});

test('AOI inclusion includes boundary points and validates bounding boxes', () => {
  assert.equal(validateBoundingBox(SAMPLE_AOI.bbox).valid, true);
  assert.equal(
    validateBoundingBox({ west: 120, south: -1, east: 110, north: 2 }).valid,
    false
  );

  // Exact south-west boundary corner
  assert.equal(isPointInAoi(-3.2, 113.2, SAMPLE_AOI), true);
  // Interior point
  assert.equal(isPointInAoi(-2.5, 114.0, SAMPLE_AOI), true);
  // Exterior point
  assert.equal(isPointInAoi(-4.0, 114.0, SAMPLE_AOI), false);
});

test('deduplicateAndSupersedeObservations removes exact duplicates and supersedes NRT with STANDARD without proximity deduplication', () => {
  const baseRow = {
    latitude: -2.45,
    longitude: 114.25,
    brightness: 330.1,
    scan: 1.0,
    track: 1.0,
    acq_date: '2026-05-10',
    acq_time: '0630',
    satellite: 'Aqua',
    confidence: 91,
    version: '6.1NRT',
    bright_t31: 295.0,
    frp: 42.0,
    daynight: 'D',
  };

  const nrtObs = parseModisRecord(baseRow, {
    retrievedAtUtc: '2026-05-10T10:00:00Z',
    checksum: 'chk-nrt',
    rowNumber: 1,
  });
  const duplicateNrtObs = parseModisRecord(baseRow, {
    retrievedAtUtc: '2026-05-10T12:00:00Z',
    checksum: 'chk-nrt-dup',
    rowNumber: 2,
  });
  const standardObs = parseModisRecord(
    { ...baseRow, version: '6.1', frp: 43.5 },
    {
      retrievedAtUtc: '2026-10-15T00:00:00Z',
      checksum: 'chk-std',
      rowNumber: 10,
    }
  );
  // Nearby distinct pixel (0.002 deg away) must NOT be deduplicated
  const nearbyObs = parseModisRecord(
    { ...baseRow, latitude: -2.452, version: '6.1', frp: 18.0 },
    {
      retrievedAtUtc: '2026-10-15T00:00:00Z',
      checksum: 'chk-std',
      rowNumber: 11,
    }
  );

  const result = deduplicateAndSupersedeObservations([
    nrtObs,
    duplicateNrtObs,
    standardObs,
    nearbyObs,
  ]);

  assert.equal(result.exactDuplicatesRemoved, 1);
  assert.equal(result.supersededNrtCount, 1);
  assert.equal(result.canonical.length, 2);
  const supersededRecord = result.canonical.find((r) => Math.abs(r.latitude - -2.45) < 1e-6);
  assert.ok(supersededRecord);
  assert.equal(supersededRecord.processing_status, 'STANDARD');
  assert.equal(supersededRecord.frp_mw, 43.5);
});

test('computeFrpSummary handles valid and null FRP records accurately', () => {
  const obs1 = parseViirsRecord(
    {
      latitude: -2.4,
      longitude: 114.1,
      bright_ti4: 340,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-11-01',
      acq_time: '0600',
      satellite: 'N20',
      confidence: 'n',
      version: '2.0NRT',
      bright_ti5: 295,
      frp: 10.0,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'c1', rowNumber: 1 }
  );
  const obs2 = { ...obs1, observation_id: 'v2', frp_mw: 30.0 };
  const obs3Null = { ...obs1, observation_id: 'v3', frp_mw: null };

  const stats = computeFrpSummary([obs1, obs2, obs3Null], 'VIIRS');
  assert.equal(stats.unit, 'MW');
  assert.equal(stats.valid_count, 2);
  assert.equal(stats.null_count, 1);
  assert.equal(stats.sum_mw, 40.0);
  assert.equal(stats.mean_mw, 20.0);
  assert.equal(stats.median_mw, 20.0);
});

test('computeSeasonalBaseline calculates robust_z and handles MAD=0 safely', () => {
  const normalCase = computeSeasonalBaseline(35, [10, 12, 14, 16, 18], [2021, 2022, 2023, 2024, 2025], 'VIIRS');
  assert.equal(normalCase.baseline_median, 14);
  assert.equal(normalCase.baseline_mad, 2);
  assert.equal(normalCase.mad_zero_fallback_used, false);
  assert.ok(normalCase.robust_z !== null && normalCase.robust_z > 5);
  assert.equal(normalCase.status_label, 'Unusual relative to this baseline');

  const madZeroCase = computeSeasonalBaseline(15, [5, 5, 5, 5, 10], [2021, 2022, 2023, 2024, 2025], 'MODIS');
  assert.equal(madZeroCase.baseline_median, 5);
  assert.equal(madZeroCase.baseline_mad, 0);
  assert.equal(madZeroCase.mad_zero_fallback_used, true);
  assert.equal(madZeroCase.robust_z, null);
  assert.equal(madZeroCase.status_label, 'Unusual relative to this baseline');
});

test('aggregateCalendarAnalytics separates MODIS and VIIRS and distinguishes NO_SOURCE_DATA for SNPP after 2026-11-02', () => {
  const modisRec = parseModisRecord(
    {
      latitude: -2.5,
      longitude: 114.2,
      brightness: 325,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-11-05',
      acq_time: '0310',
      satellite: 'Terra',
      confidence: 76,
      version: '6.1NRT',
      bright_t31: 293,
      frp: 25.5,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T01:00:00Z', checksum: 'chk1', rowNumber: 1 }
  );

  // Query only SNPP for 2026-11-05..2026-11-06 (after SNPP archive end 2026-11-02)
  const snppOnlyResponse = aggregateCalendarAnalytics({
    allRawRecords: [modisRec],
    aoi: SAMPLE_AOI,
    startDate: '2026-11-05',
    endDate: '2026-11-06',
    granularity: 'day',
    sensor: 'VIIRS',
    platforms: ['SNPP'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    retrievedAtUtc: '2026-11-13T04:00:00Z',
    latestAcquisitionUtc: '2026-11-13T03:15:00Z',
    archiveChecksums: ['chk1'],
  });

  assert.equal(snppOnlyResponse.series.length, 2);
  assert.equal(snppOnlyResponse.series[0].coverage_state, 'NO_SOURCE_DATA');
  assert.equal(snppOnlyResponse.series[0].values.VIIRS, null);

  // Query ALL sensors for 2026-11-05..2026-11-06
  const allResponse = aggregateCalendarAnalytics({
    allRawRecords: [modisRec],
    aoi: SAMPLE_AOI,
    startDate: '2026-11-05',
    endDate: '2026-11-06',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    retrievedAtUtc: '2026-11-13T04:00:00Z',
    latestAcquisitionUtc: '2026-11-13T03:15:00Z',
    archiveChecksums: ['chk1'],
  });

  assert.equal(allResponse.method.id, 'M2_COMPARATIVE');
  assert.equal(allResponse.series[0].values.MODIS, 1);
  assert.equal(allResponse.series[0].values.VIIRS, 0);
  assert.equal(allResponse.series[1].coverage_state, 'NO_DETECTIONS_IN_AVAILABLE_RECORDS');
  assert.equal(allResponse.series[1].values.MODIS, 0);
  assert.equal(allResponse.series[1].values.VIIRS, 0);

  // Verify geometry measurement helper
  const geom = calculateGeometryMeasurement([
    { lat: -2.0, lng: 114.0 },
    { lat: -2.0, lng: 115.0 },
    { lat: -3.0, lng: 115.0 },
    { lat: -3.0, lng: 114.0 },
  ]);
  assert.ok(geom.distanceKm > 300);
  assert.ok(geom.areaSqKm > 10000);
});

test('deriveProcessingStatus maps FIRMS version strings accurately', () => {
  assert.equal(deriveProcessingStatus('6.1'), 'STANDARD');
  assert.equal(deriveProcessingStatus('6.1NRT'), 'NRT');
  assert.equal(deriveProcessingStatus('2.0URT'), 'URT');
  assert.equal(deriveProcessingStatus('2.0RT'), 'RT');
});

test('canonicalizeEonetEvents maps NASA EONET v3 wildfire events while keeping acres distinct from FRP MW', () => {
  const events = [
    {
      id: 'EONET_12345',
      title: 'Wildfire Red Hill, Perry, Mississippi',
      description: null,
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_12345',
      closed: null,
      sources: [{ id: 'IRWIN', url: 'https://example.gov/irwin/12345' }],
      geometry: [
        {
          magnitudeValue: 519,
          magnitudeUnit: 'acres',
          date: '2026-11-12T00:22:00Z',
          type: 'Point' as const,
          coordinates: [-89.063853, 31.130069],
        },
      ],
    },
  ];

  const canonical = canonicalizeEonetEvents(events, '2026-11-13T08:00:00Z');
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].observation_id, 'EONET-EONET_12345');
  assert.equal(canonical[0].source_product, 'NASA_EONET_V3_LIVE');
  assert.equal(canonical[0].frp_mw, null); // acres must never be conflated with MW
  assert.equal(canonical[0].raw_attributes.eonet_magnitude, '519 acres');
  assert.equal(canonical[0].raw_attributes.eonet_title, 'Wildfire Red Hill, Perry, Mississippi');
});

import {
  parseFirmsActiveFireCsv,
  queryLiveFirmsViewport,
} from '../services/firmsLiveService';

test('all archive observations reside strictly on terrestrial WGS84 coordinates with zero ocean anomalies', () => {
  assert.ok(ALL_ARCHIVE_OBSERVATIONS.length > 500);
  for (const obs of ALL_ARCHIVE_OBSERVATIONS) {
    assert.equal(
      isTerrestrialWgs84Coordinate(obs.latitude, obs.longitude),
      true,
      `Coordinate (${obs.latitude}, ${obs.longitude}) failed terrestrial check`
    );
  }
});

test('parseFirmsActiveFireCsv parses official NASA MODIS C6.1 and VIIRS C2 rows without coordinate distortion', () => {
  const modisCsv = [
    'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight',
    '-8.4215,115.6312,331.4,1.1,1.0,2026-11-13,245,T,89,6.1NRT,295.2,24.8,D',
    '-2.1544,113.9102,318.0,1.0,1.0,2026-11-12,1310,A,62,6.1NRT,292.1,12.1,N',
  ].join('\n');

  const modisObs = parseFirmsActiveFireCsv(modisCsv, {
    sensor: 'MODIS',
    defaultPlatform: 'TERRA',
    sourceProduct: 'MCD14DL_NRT',
    collection: 'MODIS C6.1',
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    checksum: 'sha-modis',
  });

  assert.equal(modisObs.length, 2);
  assert.equal(modisObs[0].platform, 'TERRA');
  assert.equal(modisObs[0].acq_time_native, '0245');
  assert.equal(modisObs[0].acq_datetime_utc, '2026-11-13T02:45:00Z');
  assert.equal(modisObs[0].confidence_native, 89);
  assert.equal(modisObs[0].frp_mw, 24.8);
  assert.equal(modisObs[1].platform, 'AQUA');

  const viirsCsv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight',
    '-4.5123,120.1456,349.1,0.4,0.37,2026-11-13,532,N20,h,2.0NRT,296.4,9.3,D',
    '-9.6122,124.2105,332.5,0.42,0.38,2026-11-12,1815,N21,nominal,2.0NRT,291.0,4.2,N',
  ].join('\n');

  const viirsObs = parseFirmsActiveFireCsv(viirsCsv, {
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGTDL_NRT',
    collection: 'VIIRS C2',
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    checksum: 'sha-viirs',
  });

  assert.equal(viirsObs.length, 2);
  assert.equal(viirsObs[0].platform, 'NOAA20');
  assert.equal(viirsObs[0].confidence_native, 'high');
  assert.equal(viirsObs[1].platform, 'NOAA21');
  assert.equal(viirsObs[1].confidence_native, 'nominal');
});

test('queryLiveFirmsViewport filters by TODAY vs 24HRS date window and supports wrapped longitudes', () => {
  const viirsCsv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight',
    '-4.5123,120.1456,349.1,0.4,0.37,2026-11-13,0532,N20,h,2.0NRT,296.4,9.3,D',
    '-8.6122,116.2105,332.5,0.42,0.38,2026-11-12,1815,N21,n,2.0NRT,291.0,4.2,N',
    '39.8122,-121.4105,341.0,0.4,0.37,2026-11-13,0910,N20,h,2.0NRT,292.0,15.0,N',
  ].join('\n');

  const parsed = parseFirmsActiveFireCsv(viirsCsv, {
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGTDL_NRT',
    collection: 'VIIRS C2',
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    checksum: 'sha-v',
  });

  // TODAY filter in Indonesia bbox
  const todayIndo = queryLiveFirmsViewport({
    observations: parsed,
    bounds: { west: 94.5, south: -11.5, east: 141.5, north: 6.5 },
    startDate: '2026-11-13',
    endDate: '2026-11-13',
  });
  assert.equal(todayIndo.totalInViewport, 1);
  assert.equal(todayIndo.sampled, false);

  // 24HRS filter in Indonesia bbox
  const day24Indo = queryLiveFirmsViewport({
    observations: parsed,
    bounds: { west: 94.5, south: -11.5, east: 141.5, north: 6.5 },
    startDate: '2026-11-12',
    endDate: '2026-11-13',
  });
  assert.equal(day24Indo.totalInViewport, 2);

  // Wrapped world copy longitudes (e.g., scrolled +360 degrees east)
  const wrappedIndo = queryLiveFirmsViewport({
    observations: parsed,
    bounds: { west: 94.5 + 360, south: -11.5, east: 141.5 + 360, north: 6.5 },
    startDate: '2026-11-12',
    endDate: '2026-11-13',
  });
  assert.equal(wrappedIndo.totalInViewport, 2);
});

import {
  aggregateCalendarFromBuckets,
  aggregateObservationsToGrid,
  buildAoiComparisonResponse,
  buildPeriodComparisonResponse,
  computeSolarTerminatorPolygon,
  generateAoiComparisonCsv,
  generatePeriodComparisonCsv,
  observationsToDailyBuckets,
} from './comparisonScience';
import {
  deleteSavedAoi,
  loadSavedAois,
  renameSavedAoi,
  saveAoiRecord,
} from '../utils/savedAois';
import {
  getParquetManifest,
  queryParquetDailyBuckets,
  queryParquetHistoricalMonthlyTotals,
} from '../services/parquetService';

test('aggregateCalendarFromBuckets separates sensors and reports unavailable baseline when history < 3 periods', () => {
  const obs1 = parseModisRecord(
    {
      latitude: -2.5,
      longitude: 114.2,
      brightness: 326,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-11-05',
      acq_time: '0310',
      satellite: 'Terra',
      confidence: 82,
      version: '6.1NRT',
      bright_t31: 294,
      frp: 22.0,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T01:00:00Z', checksum: 'chk1', rowNumber: 1 }
  );
  const obs2 = parseViirsRecord(
    {
      latitude: -2.52,
      longitude: 114.22,
      bright_ti4: 344,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-11-06',
      acq_time: '0640',
      satellite: 'N20',
      confidence: 'h',
      version: '2.0NRT',
      bright_ti5: 295,
      frp: 11.5,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T01:00:00Z', checksum: 'chk2', rowNumber: 1 }
  );

  const buckets = observationsToDailyBuckets([obs1, obs2]);
  const res = aggregateCalendarFromBuckets({
    buckets,
    historicalMonthTotals: [], // Fewer than 3 historical years/bins -> must NOT fabricate fallback array
    aoi: SAMPLE_AOI,
    startDate: '2026-11-05',
    endDate: '2026-11-06',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Test notice',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-06T06:40:00Z',
    archiveChecksums: ['chk1', 'chk2'],
  });

  assert.equal(res.series.length, 2);
  assert.equal(res.series[0].values.MODIS, 1);
  assert.equal(res.series[0].values.VIIRS, 0);
  assert.equal(res.series[1].values.MODIS, 0);
  assert.equal(res.series[1].values.VIIRS, 1);
  // Ensure FR-09 baseline does NOT fabricate fake median/MAD when <3 bins exist
  assert.equal(
    res.series[0].seasonal_baseline?.MODIS.status_label,
    'Baseline unavailable (insufficient history)'
  );
  assert.equal(res.series[0].seasonal_baseline?.MODIS.robust_z, null);
});

test('FR-08 buildPeriodComparisonResponse computes unpooled deltas, era warnings, and CSV provenance', () => {
  const makeCal = (
    startDate: string,
    endDate: string,
    platforms: ('TERRA' | 'SNPP' | 'NOAA20' | 'NOAA21')[],
    modisCount: number,
    viirsCount: number,
    isStd: boolean
  ) => {
    const recs = [];
    for (let i = 0; i < modisCount; i++) {
      recs.push(
        parseModisRecord(
          {
            latitude: -2.4,
            longitude: 114.1,
            brightness: 328,
            scan: 1.0,
            track: 1.0,
            acq_date: startDate,
            acq_time: '0300',
            satellite: 'Terra',
            confidence: 80,
            version: isStd ? '6.1' : '6.1NRT',
            bright_t31: 294,
            frp: 20,
            daynight: 'D',
          },
          { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'm', rowNumber: i + 1 }
        )
      );
    }
    for (let i = 0; i < viirsCount; i++) {
      recs.push(
        parseViirsRecord(
          {
            latitude: -2.45,
            longitude: 114.15,
            bright_ti4: 345,
            scan: 0.4,
            track: 0.4,
            acq_date: endDate,
            acq_time: '0600',
            satellite: platforms.includes('NOAA20') ? 'N20' : 'SNPP',
            confidence: 'h',
            version: isStd ? '2.0' : '2.0NRT',
            bright_ti5: 295,
            frp: 10,
            daynight: 'D',
          },
          { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'v', rowNumber: i + 1 }
        )
      );
    }

    return aggregateCalendarFromBuckets({
      buckets: observationsToDailyBuckets(recs),
      aoi: SAMPLE_AOI,
      startDate,
      endDate,
      granularity: 'month',
      sensor: 'ALL',
      platforms,
      processingStatus: 'ALL',
      dayNight: 'ALL',
      metric: 'detection_count',
      platformRegistry: TEST_PLATFORM_REGISTRY,
      archiveCoverageStart: '2012-01-01',
      archiveCoverageEnd: '2026-11-13',
      dataMode: 'LIVE_NASA_FIRMS',
      demoNotice: 'Parquet test',
      sources: ['NASA FIRMS Parquet'],
      retrievedAtUtc: '2026-11-13T10:00:00Z',
      latestAcquisitionUtc: `${endDate}T06:00:00Z`,
      archiveChecksums: ['sha-test'],
    });
  };

  const calA = makeCal('2015-09-01', '2015-09-30', ['TERRA', 'SNPP'], 10, 5, true);
  const calB = makeCal('2026-11-01', '2026-11-13', ['TERRA', 'SNPP', 'NOAA20'], 4, 15, false);

  const comp = buildPeriodComparisonResponse({
    aoi: SAMPLE_AOI,
    periodA: calA,
    periodB: calB,
    periodALabel: '2015 Sep',
    periodBLabel: '2026 Nov',
    yoySummary: [],
    dataBacking: 'REAL_NASA_ARCHIVE_PARQUET',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    archiveChecksums: ['sha-test'],
  });

  assert.equal(comp.method.id, 'M2_COMPARATIVE');
  assert.equal(comp.totals.modis_delta, -6);
  assert.equal(comp.totals.viirs_delta, 10);
  // Platform continuity & NRT/STANDARD warnings must fire
  assert.ok(comp.availability_warnings.some((w) => w.includes('Sensor-era platform availability')));
  assert.ok(comp.availability_warnings.some((w) => w.includes('Suomi-NPP')));

  const csv = generatePeriodComparisonCsv(comp);
  assert.ok(csv.includes('MODIS and VIIRS counts are kept strictly separate'));
  assert.ok(csv.includes('period_a_modis_detections,period_b_modis_detections,modis_delta'));
});

test('Multi-AOI comparison computes extent rates per 1000 sq km and flags unequal AOI sizes', () => {
  const largeAoi: AoiDefinition = {
    ...SAMPLE_AOI,
    id: 'large-test',
    name: 'Large Test Region',
    areaSqKm: 150000,
  };
  const emptyBuckets = observationsToDailyBuckets([]);
  const calA = aggregateCalendarFromBuckets({
    buckets: emptyBuckets,
    aoi: SAMPLE_AOI,
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Test',
    sources: ['NASA FIRMS'],
    retrievedAtUtc: '2026-11-13T00:00:00Z',
    latestAcquisitionUtc: '2026-11-10T00:00:00Z',
    archiveChecksums: ['c1'],
  });
  const calB = { ...calA, aoi: { id: largeAoi.id, name: largeAoi.name, bbox: largeAoi.bbox, timezone: largeAoi.timezone, area_sq_km: largeAoi.areaSqKm } };

  const aoiComp = buildAoiComparisonResponse({
    aoiA: SAMPLE_AOI,
    analyticsA: calA,
    backingA: 'REAL_NASA_ARCHIVE_PARQUET',
    aoiB: largeAoi,
    analyticsB: calB,
    backingB: 'DEMO_FIXTURE_BASELINE',
    retrievedAtUtc: '2026-11-13T10:00:00Z',
  });

  assert.ok(aoiComp.comparability_warnings.some((w) => w.includes('extents differ substantially')));
  assert.ok(aoiComp.comparability_warnings.some((w) => w.includes('Data source backing differs')));

  const aoiCsv = generateAoiComparisonCsv(aoiComp);
  assert.ok(aoiCsv.includes('# FireScope Multi-AOI Side-by-Side Comparison Export'));
});

test('aggregateObservationsToGrid and computeSolarTerminatorPolygon execute deterministically', () => {
  const obs = parseViirsRecord(
    {
      latitude: -2.41,
      longitude: 114.32,
      bright_ti4: 344,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-11-13',
      acq_time: '0530',
      satellite: 'N20',
      confidence: 'h',
      version: '2.0NRT',
      bright_ti5: 294,
      frp: 14.5,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T10:00:00Z', checksum: 'chk', rowNumber: 1 }
  );

  const grid = aggregateObservationsToGrid({
    observations: [obs],
    cellSizeDeg: 0.5,
    bounds: { west: 113 + 360, south: -3, east: 115 + 360, north: -1 },
  });
  assert.equal(grid.length, 1);
  assert.equal(grid[0].lat_bin, -2.5);
  assert.equal(grid[0].lng_bin, 114);
  assert.equal(grid[0].viirs_detections, 1);

  const terminator = computeSolarTerminatorPolygon(new Date('2026-11-13T06:00:00Z'));
  assert.ok(terminator.length > 70);
});

test('savedAois CRUD saves, loads, renames, and deletes custom AOIs cleanly', () => {
  const mem: Record<string, string> = {};
  const mockStorage = {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
  };

  assert.equal(loadSavedAois(mockStorage).length, 0);
  const afterSave = saveAoiRecord(SAMPLE_AOI, 'My Peat Watch', mockStorage);
  assert.equal(afterSave.length, 1);
  assert.equal(afterSave[0].aoi.name, 'My Peat Watch');
  const savedId = afterSave[0].aoi.id;

  const afterRename = renameSavedAoi(savedId, 'Central Borneo Peat', mockStorage);
  assert.equal(afterRename[0].aoi.name, 'Central Borneo Peat');

  const afterDelete = deleteSavedAoi(savedId, mockStorage);
  assert.equal(afterDelete.length, 0);
});

test('DuckDB Parquet query service retrieves real NASA 2015 El Nino detections for Kalimantan Peatlands', async () => {
  const manifest = getParquetManifest();
  assert.ok(manifest && manifest.available, 'Parquet manifest must be built and available');
  assert.ok(manifest.daily_aggregates_parquet.rows > 2_000_000);
  assert.ok(manifest.canonical_rows_total > 8_000_000);

  const buckets = await queryParquetDailyBuckets({
    bbox: SAMPLE_AOI.bbox,
    startDate: '2015-09-01',
    endDate: '2015-10-31',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });

  const totalDetections = buckets.reduce((acc, b) => acc + b.detection_count, 0);
  assert.ok(totalDetections > 10_000, `Expected >10,000 real 2015 Kalimantan detections, got ${totalDetections}`);

  const hist = await queryParquetHistoricalMonthlyTotals({
    bbox: SAMPLE_AOI.bbox,
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });
  assert.ok(hist.some((r) => r.year === 2015 && r.modis_count > 0));
  assert.ok(hist.some((r) => r.year === 2023 && r.viirs_count > 0));
});

test('isTerrestrialWgs84Coordinate & isOffshoreMarineObservation accurately separate offshore oil rigs from mainland/volcanic islands', () => {
  // Mainland & legitimate island fires must remain terrestrial (NOT flagged as offshore)
  const validTerrestrialCoords: Array<[number, number, string]> = [
    [-9.24, -35.56, 'Mainland Northeast Brazil'],
    [-5.50, -44.82, 'Mainland Maranhao Brazil'],
    [14.40, -15.07, 'Mainland Senegal'],
    [35.05, 32.88, 'Cyprus Island'],
    [25.64, 50.08, 'Saudi Mainland Abqaiq/Ghawar'],
    [-11.43, 130.55, 'Tiwi Islands Australia'],
    [-7.80, 126.40, 'Wetar Island Indonesia'],
    [-7.92, 129.75, 'Babar Island Indonesia'],
    [-7.60, 131.50, 'Yamdena Tanimbar Indonesia'],
    [-3.40, 126.50, 'Buru Island Indonesia'],
    [19.41, -155.27, 'Hawaii Big Island'],
    [-20.49, 57.59, 'Mauritius'],
    [-53.11, 73.52, 'Heard Island'],
    [-19.73, -175.07, 'Tonga'],
    [-2.51, 114.10, 'Central Kalimantan Peatlands'],
  ];

  for (const [lat, lng, label] of validTerrestrialCoords) {
    assert.equal(
      isVerifiedOffshoreMarineCoordinate(lat, lng),
      false,
      `${label} (${lat}, ${lng}) must NOT be classified as offshore marine`
    );
    assert.equal(
      isTerrestrialWgs84Coordinate(lat, lng),
      true,
      `${label} (${lat}, ${lng}) must remain terrestrial`
    );
  }

  // Verified offshore marine oil/gas flare zones must be detected
  const offshoreRigCoords: Array<[number, number, string]> = [
    [4.1637, 106.22475, 'West Natuna Sea Offshore Platform'],
    [4.97657, 112.98037, 'Sarawak Luconia Offshore Platform'],
    [-6.31778, 113.005, 'East Java Sea Poleng Offshore Platform'],
    [-9.82, 130.27, 'Timor Sea Offshore LNG Flare'],
    [57.01, 1.83, 'North Sea Offshore Oil Rig'],
    [46.54, -48.50, 'Grand Banks Offshore Platform'],
    [19.29, -92.19, 'Bay of Campeche Offshore Platform'],
    [4.14, 7.97, 'Gulf of Guinea Niger Delta Offshore'],
    [28.37, 49.63, 'Persian Gulf Central Offshore Rig'],
  ];

  for (const [lat, lng, label] of offshoreRigCoords) {
    assert.equal(
      isVerifiedOffshoreMarineCoordinate(lat, lng),
      true,
      `${label} (${lat}, ${lng}) should be classified as verified offshore flare`
    );
    assert.equal(
      isTerrestrialWgs84Coordinate(lat, lng),
      false,
      `${label} (${lat}, ${lng}) should not pass terrestrial filter`
    );
  }

  // Explicit NASA type=3 must always be flagged as offshore regardless of coordinates
  assert.equal(
    isOffshoreMarineObservation({ latitude: -2.51, longitude: 114.1, type_native: 3 }),
    true
  );
  assert.equal(
    isOffshoreMarineObservation({ latitude: -2.51, longitude: 114.1, type_native: 0 }),
    false
  );
});

test('queryLiveFirmsViewport excludes offshore flares only when excludeOffshore is true and reports excludedOffshoreCount', () => {
  const mixedCsv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight',
    '-2.5123,114.1051,346.8,0.39,0.36,2026-11-13,0640,N20,h,2.0NRT,296.1,12.4,D',
    '4.1637,106.2248,351.2,0.40,0.38,2026-11-13,0642,N20,h,2.0NRT,295.0,18.2,D',
    '-6.3178,113.0050,342.0,0.41,0.37,2026-11-13,0645,N21,n,2.0NRT,294.4,7.5,D',
  ].join('\n');

  const parsed = parseFirmsActiveFireCsv(mixedCsv, {
    sensor: 'VIIRS',
    defaultPlatform: 'NOAA20',
    sourceProduct: 'VJ114IMGTDL_NRT',
    collection: 'VIIRS C2',
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    checksum: 'sha-offshore-test',
  });

  const indoBounds = { west: 94.5, south: -11.5, east: 141.5, north: 6.5 };

  const unfiltered = queryLiveFirmsViewport({
    observations: parsed,
    bounds: indoBounds,
    excludeOffshore: false,
  });
  assert.equal(unfiltered.totalInViewport, 3);
  assert.equal(unfiltered.excludedOffshoreCount, 0);

  const filtered = queryLiveFirmsViewport({
    observations: parsed,
    bounds: indoBounds,
    excludeOffshore: true,
  });
  assert.equal(filtered.totalInViewport, 1);
  assert.equal(filtered.excludedOffshoreCount, 2);
  assert.equal(filtered.items[0].latitude, -2.5123);
});

test('summarizeBucketFrp via aggregateCalendarFromBuckets returns null median/p90 and exact max_mw', () => {
  const mkModis = (frp: number, rowNumber: number) =>
    parseModisRecord(
      {
        latitude: -2.4,
        longitude: 114.1,
        brightness: 325,
        scan: 1.0,
        track: 1.0,
        acq_date: '2026-11-10',
        acq_time: '0410',
        satellite: 'Terra',
        confidence: 80,
        version: '6.1',
        bright_t31: 294,
        frp,
        daynight: 'D',
      },
      { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'sha-frp', rowNumber }
    );

  const buckets = observationsToDailyBuckets([mkModis(5, 1), mkModis(15, 2), mkModis(40, 3)]);
  const cal = aggregateCalendarFromBuckets({
    buckets,
    aoi: SAMPLE_AOI,
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    granularity: 'day',
    sensor: 'MODIS',
    platforms: ['TERRA'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'frp_mw',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'FRP test',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-10T04:10:00Z',
    archiveChecksums: ['sha-frp'],
  });

  const frp = cal.series[0].frp_summary.MODIS;
  assert.equal(frp.sum_mw, 60);
  assert.equal(frp.mean_mw, 20);
  assert.equal(frp.max_mw, 40);
  assert.equal(frp.median_mw, null);
  assert.equal(frp.p90_mw, null);
  assert.ok(frp.processing_status_note.includes('pre-aggregated daily Parquet buckets'));
});

test('FR-09 aggregateCalendarFromBuckets excludes pre-2012 VIIRS zero rows, flags incomplete months, and scopes monthly baselines cleanly', () => {
  const fullRegistry: PlatformRegistryEntry[] = [
    ...TEST_PLATFORM_REGISTRY,
    {
      platform_id: 'AQUA',
      display_name: 'MODIS Aqua',
      sensor: 'MODIS',
      instrument: 'MODIS',
      product_code: 'MYD14',
      collection: 'MODIS C6.1',
      nominal_resolution: '1 km',
      first_observation_date: '2002-07-04',
      last_observation_date: '2026-11-13',
      status: 'ACTIVE',
      processing_Available: ['NRT', 'STANDARD'],
      latest_acquisition_utc: '2026-11-13T05:00:00Z',
      status_checked_at_utc: '2026-11-13T05:00:00Z',
      status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
      status_note: 'Active',
      color_hex: '#D97706',
    },
    {
      platform_id: 'NOAA20',
      display_name: 'VIIRS NOAA-20',
      sensor: 'VIIRS',
      instrument: 'VIIRS',
      product_code: 'VJ114',
      collection: 'VIIRS C2',
      nominal_resolution: '375 m',
      first_observation_date: '2020-01-01',
      last_observation_date: '2026-11-13',
      status: 'ACTIVE',
      processing_Available: ['NRT', 'STANDARD'],
      latest_acquisition_utc: '2026-11-13T05:00:00Z',
      status_checked_at_utc: '2026-11-13T05:00:00Z',
      status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
      status_note: 'Active',
      color_hex: '#61BDE0',
    },
    {
      platform_id: 'NOAA21',
      display_name: 'VIIRS NOAA-21',
      sensor: 'VIIRS',
      instrument: 'VIIRS',
      product_code: 'VJ214',
      collection: 'VIIRS C2',
      nominal_resolution: '375 m',
      first_observation_date: '2024-01-17',
      last_observation_date: '2026-11-13',
      status: 'ACTIVE',
      processing_Available: ['NRT', 'STANDARD'],
      latest_acquisition_utc: '2026-11-13T05:00:00Z',
      status_checked_at_utc: '2026-11-13T05:00:00Z',
      status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
      status_note: 'Active',
      color_hex: '#0284C7',
    },
  ];

  const obs = parseViirsRecord(
    {
      latitude: -2.45,
      longitude: 114.15,
      bright_ti4: 345,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-11-10',
      acq_time: '0600',
      satellite: 'N20',
      confidence: 'h',
      version: '2.0NRT',
      bright_ti5: 295,
      frp: 10,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'v', rowNumber: 1 }
  );

  const hist = [
    { year: 2005, month: '11', modis_count: 100, viirs_count: 0, modis_frp_sum: 500, viirs_frp_sum: 0 },
    { year: 2010, month: '11', modis_count: 120, viirs_count: 0, modis_frp_sum: 600, viirs_frp_sum: 0 },
    { year: 2015, month: '11', modis_count: 200, viirs_count: 400, modis_frp_sum: 1000, viirs_frp_sum: 1200 },
    { year: 2020, month: '11', modis_count: 150, viirs_count: 350, modis_frp_sum: 750, viirs_frp_sum: 1100 },
    { year: 2023, month: '11', modis_count: 180, viirs_count: 380, modis_frp_sum: 900, viirs_frp_sum: 1150 },
    { year: 2024, month: '11', modis_count: 140, viirs_count: 300, modis_frp_sum: 700, viirs_frp_sum: 950 },
    { year: 2025, month: '11', modis_count: 130, viirs_count: 310, modis_frp_sum: 650, viirs_frp_sum: 980 },
  ];

  // With TERRA + SNPP selected (full coverage since 2012 for VIIRS), pre-2012 rows must be excluded from VIIRS baseline
  const monthlyCal = aggregateCalendarFromBuckets({
    buckets: observationsToDailyBuckets([obs]),
    historicalMonthTotals: hist,
    aoi: SAMPLE_AOI,
    startDate: '2026-11-01',
    endDate: '2026-11-13',
    granularity: 'month',
    sensor: 'ALL',
    platforms: ['TERRA', 'SNPP', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: fullRegistry,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'FR-09 test',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-10T06:00:00Z',
    archiveChecksums: ['v'],
  });

  const sb = monthlyCal.series[0].seasonal_baseline;
  assert.ok(sb);
  assert.ok(sb.MODIS.baseline_years.every((y) => y >= 2005 && y < 2026));
  assert.ok(sb.VIIRS.baseline_years.every((y) => y >= 2015 && y < 2026));
  assert.ok(!sb.VIIRS.baseline_years.includes(2005));
  assert.ok(!sb.VIIRS.baseline_years.includes(2010));
  assert.ok(sb.VIIRS.caveat_note.includes('Incomplete UTC period'));

  // Daily granularity must NOT treat monthly historical totals as daily baseline
  const dailyCal = aggregateCalendarFromBuckets({
    buckets: observationsToDailyBuckets([obs]),
    historicalMonthTotals: hist,
    aoi: SAMPLE_AOI,
    startDate: '2026-11-09',
    endDate: '2026-11-10',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'SNPP', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: fullRegistry,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Daily baseline test',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-10T06:00:00Z',
    archiveChecksums: ['v'],
  });

  assert.equal(dailyCal.series[1].seasonal_baseline?.VIIRS.baseline_years.length, 0);
  assert.equal(
    dailyCal.series[1].seasonal_baseline?.VIIRS.status_label,
    'Baseline unavailable (insufficient history)'
  );
});

test('Empty platforms=[] strictly returns 0 detections across calendar and live viewport helpers', () => {
  const obs = parseModisRecord(
    {
      latitude: -2.4,
      longitude: 114.1,
      brightness: 325,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-11-12',
      acq_time: '0410',
      satellite: 'Terra',
      confidence: 80,
      version: '6.1',
      bright_t31: 294,
      frp: 22,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'sha-p0', rowNumber: 1 }
  );

  const calRaw = aggregateCalendarAnalytics({
    allRawRecords: [obs],
    aoi: SAMPLE_AOI,
    startDate: '2026-11-12',
    endDate: '2026-11-12',
    granularity: 'day',
    sensor: 'ALL',
    platforms: [],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-12T04:10:00Z',
    archiveChecksums: ['sha-p0'],
  });
  assert.equal(calRaw.totals.MODIS_detections, 0);
  assert.equal(calRaw.totals.VIIRS_detections, 0);

  const calBuckets = aggregateCalendarFromBuckets({
    buckets: observationsToDailyBuckets([obs]),
    aoi: SAMPLE_AOI,
    startDate: '2026-11-12',
    endDate: '2026-11-12',
    granularity: 'day',
    sensor: 'ALL',
    platforms: [],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Empty platforms test',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-13T10:00:00Z',
    latestAcquisitionUtc: '2026-11-12T04:10:00Z',
    archiveChecksums: ['sha-p0'],
  });
  assert.equal(calBuckets.totals.MODIS_detections, 0);
  assert.equal(calBuckets.totals.VIIRS_detections, 0);

  const vp = queryLiveFirmsViewport({
    observations: [obs],
    bounds: SAMPLE_AOI.bbox,
    platforms: [],
  });
  assert.equal(vp.totalInViewport, 0);
});

test('queryParquetDailyBuckets partitions adjacent 0.25deg cells additively without boundary double-counting', async () => {
  const sumCounts = (rows: Array<{ detection_count: number }>) =>
    rows.reduce((acc, r) => acc + r.detection_count, 0);

  const baseParams = {
    startDate: '2015-09-01',
    endDate: '2015-09-30',
    sensor: 'MODIS' as const,
    platforms: ['TERRA' as const, 'AQUA' as const],
    processingStatus: 'ALL' as const,
    dayNight: 'ALL' as const,
    modisMinConfidence: 0,
    viirsCategories: ['low' as const, 'nominal' as const, 'high' as const],
  };

  const [whole, qSW, qSE, qNW, qNE] = await Promise.all([
    queryParquetDailyBuckets({ ...baseParams, bbox: { west: 114.0, south: -3.0, east: 114.5, north: -2.5 } }),
    queryParquetDailyBuckets({ ...baseParams, bbox: { west: 114.0, south: -3.0, east: 114.25, north: -2.75 } }),
    queryParquetDailyBuckets({ ...baseParams, bbox: { west: 114.25, south: -3.0, east: 114.5, north: -2.75 } }),
    queryParquetDailyBuckets({ ...baseParams, bbox: { west: 114.0, south: -2.75, east: 114.25, north: -2.5 } }),
    queryParquetDailyBuckets({ ...baseParams, bbox: { west: 114.25, south: -2.75, east: 114.5, north: -2.5 } }),
  ]);

  const wholeTotal = sumCounts(whole);
  const quadSum = sumCounts(qSW) + sumCounts(qSE) + sumCounts(qNW) + sumCounts(qNE);
  assert.ok(wholeTotal > 0, 'Expected non-zero 2015-09 MODIS detections in [114.0..114.5, -3.0..-2.5]');
  assert.equal(quadSum, wholeTotal, `4 quadrant cells (${quadSum}) must equal whole bbox (${wholeTotal}) without boundary overlap`);
});

test('aggregateCalendarAnalytics supports dynamic live archiveCoverageEnd and keeps MODIS_detections equal to TERRA + AQUA', () => {
  const liveTerra = parseModisRecord(
    {
      latitude: -2.45,
      longitude: 114.15,
      brightness: 329.5,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-11-14',
      acq_time: '0320',
      satellite: 'Terra',
      confidence: 82,
      version: '6.1NRT',
      bright_t31: 294.1,
      frp: 31.4,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-14T06:00:00Z', checksum: 'chk-live', rowNumber: 1 }
  );
  const liveAqua = parseModisRecord(
    {
      latitude: -2.55,
      longitude: 114.25,
      brightness: 334.0,
      scan: 1.1,
      track: 1.0,
      acq_date: '2026-11-14',
      acq_time: '0615',
      satellite: 'Aqua',
      confidence: 88,
      version: '6.1NRT',
      bright_t31: 295.0,
      frp: 42.6,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-14T06:30:00Z', checksum: 'chk-live', rowNumber: 2 }
  );

  const dynamicRegistry = TEST_PLATFORM_REGISTRY.map((p) =>
    p.platform_id === 'SNPP' ? p : { ...p, last_observation_date: '2026-11-14' }
  );

  const res = aggregateCalendarAnalytics({
    allRawRecords: [liveTerra, liveAqua],
    aoi: SAMPLE_AOI,
    startDate: '2026-11-13',
    endDate: '2026-11-14',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: dynamicRegistry,
    archiveCoverageStart: '2024-01-01',
    archiveCoverageEnd: '2026-11-14',
    retrievedAtUtc: '2026-11-14T07:00:00Z',
    latestAcquisitionUtc: '2026-11-14T06:15:00Z',
    archiveChecksums: ['chk-live'],
  });

  const nov14 = res.series.find((b) => b.bin_key === '2026-11-14');
  assert.ok(nov14, 'Expected 2026-11-14 bin');
  assert.notEqual(nov14.coverage_state, 'NO_SOURCE_DATA');
  assert.equal(nov14.values.MODIS, 2);
  assert.equal(res.totals.MODIS_detections, 2);
  assert.equal(
    res.totals.MODIS_detections,
    res.totals.platform_totals.TERRA + res.totals.platform_totals.AQUA
  );
  assert.equal(res.totals.MODIS_frp.valid_count, 2);
  assert.equal(res.totals.MODIS_frp.sum_mw, 74.0);
});

test('CSV export helpers escape embedded quotes and neutralize spreadsheet formula prefixes', () => {
  const emptyBuckets = observationsToDailyBuckets([]);
  const cal = aggregateCalendarFromBuckets({
    buckets: emptyBuckets,
    aoi: SAMPLE_AOI,
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2001-01-01',
    archiveCoverageEnd: '2026-11-13',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'CSV escape test',
    sources: ['NASA FIRMS'],
    retrievedAtUtc: '2026-11-13T00:00:00Z',
    latestAcquisitionUtc: '2026-11-10T00:00:00Z',
    archiveChecksums: ['c1'],
  });

  const comp = buildPeriodComparisonResponse({
    aoi: SAMPLE_AOI,
    periodA: cal,
    periodB: cal,
    periodALabel: 'A',
    periodBLabel: 'B',
    yoySummary: [],
    dataBacking: 'REAL_NASA_ARCHIVE_PARQUET',
    sources: ['NASA FIRMS'],
    retrievedAtUtc: '2026-11-13T00:00:00Z',
    archiveChecksums: ['c1'],
  });
  comp.aligned_series[0].aligned_label = '=SUM("A1", "B1")';

  const csv = generatePeriodComparisonCsv(comp);
  assert.ok(csv.includes('"\'=SUM(""A1"", ""B1"")"'));
});

test('Concurrent DuckDB Parquet bucket and map-grid queries complete cleanly without connection races', async () => {
  const { queryParquetMapGrid } = await import('../services/parquetService');
  const results = await Promise.all([
    queryParquetDailyBuckets({
      bbox: SAMPLE_AOI.bbox,
      startDate: '2015-09-01',
      endDate: '2015-09-10',
      sensor: 'ALL',
      platforms: ['TERRA', 'AQUA', 'SNPP'],
      processingStatus: 'ALL',
      dayNight: 'ALL',
      modisMinConfidence: 0,
      viirsCategories: ['low', 'nominal', 'high'],
    }),
    queryParquetMapGrid({
      bbox: SAMPLE_AOI.bbox,
      cellSizeDeg: 0.5,
      startDate: '2015-09-01',
      endDate: '2015-09-10',
      sensor: 'ALL',
      platforms: ['TERRA', 'AQUA', 'SNPP'],
      processingStatus: 'ALL',
      dayNight: 'ALL',
      modisMinConfidence: 0,
      viirsCategories: ['low', 'nominal', 'high'],
    }),
    queryParquetDailyBuckets({
      bbox: SAMPLE_AOI.bbox,
      startDate: '2023-09-01',
      endDate: '2023-09-10',
      sensor: 'ALL',
      platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20'],
      processingStatus: 'ALL',
      dayNight: 'ALL',
      modisMinConfidence: 0,
      viirsCategories: ['low', 'nominal', 'high'],
    }),
  ]);

  assert.ok(results[0].length > 0);
  assert.ok(results[1].length > 0);
  assert.ok(results[2].length > 0);
});

test('computeHarmonizedSeries normalizes multi-satellite VIIRS eras, fits OLS log bridge with 70/30 holdout, and guards zero-overlap windows', () => {
  const mkBin = (
    binKey: string,
    startDate: string,
    endDate: string,
    kViirs: 1 | 2 | 3,
    modisTotal: number,
    viirsPerSat: number
  ): CalendarBinRecord => {
    const activePlats: CalendarBinRecord['quality']['active_platforms'] = ['TERRA', 'AQUA', 'SNPP'];
    const pBreakdown: CalendarBinRecord['platform_breakdown'] = {
      TERRA: Math.floor(modisTotal / 2),
      AQUA: Math.ceil(modisTotal / 2),
      SNPP: viirsPerSat,
      NOAA20: 0,
      NOAA21: 0,
    };
    if (kViirs >= 2) {
      activePlats.push('NOAA20');
      pBreakdown.NOAA20 = viirsPerSat;
    }
    if (kViirs === 3) {
      activePlats.push('NOAA21');
      pBreakdown.NOAA21 = viirsPerSat;
    }
    const viirsTotal = kViirs * viirsPerSat;
    return {
      bin_key: binKey,
      label: binKey,
      time_bin_start_utc: `${startDate}T00:00:00Z`,
      time_bin_end_utc: `${endDate}T23:59:59Z`,
      granularity: 'month',
      coverage_state: 'OBSERVED_ACTIVE',
      values: { MODIS: modisTotal, VIIRS: viirsTotal },
      platform_breakdown: pBreakdown,
      processing_breakdown: { STANDARD: modisTotal + viirsTotal, NRT: 0, RT: 0, URT: 0, UNKNOWN: 0 },
      frp_summary: {
        MODIS: {
          sensor: 'MODIS',
          unit: 'MW',
          sum_mw: modisTotal * 25,
          mean_mw: 25,
          median_mw: 20,
          p90_mw: 40,
          valid_count: modisTotal,
          null_count: 0,
          processing_status_note: 'test',
        },
        VIIRS: {
          sensor: 'VIIRS',
          unit: 'MW',
          sum_mw: viirsTotal * 10,
          mean_mw: 10,
          median_mw: 8,
          p90_mw: 18,
          valid_count: viirsTotal,
          null_count: 0,
          processing_status_note: 'test',
        },
      },
      confidence_breakdown: {
        MODIS_numeric_bins: { low_0_29: 0, nominal_30_79: modisTotal, high_80_100: 0 },
        VIIRS_categorical: { low: 0, nominal: viirsTotal, high: 0 },
      },
      pooled_observation_count: modisTotal + viirsTotal,
      pooled_caveat: 'test',
      quality: {
        coverage_note: 'test',
        active_platforms: activePlats,
        unavailable_platforms: [],
        superseded_nrt_count: 0,
        exact_duplicates_removed: 0,
      },
    };
  };

  // Construct 14 overlap bins spanning 1-, 2-, and 3-satellite VIIRS eras where per-sat ratio = 2.5
  const bins: CalendarBinRecord[] = [
    mkBin('2014-08', '2014-08-01', '2014-08-31', 1, 40, 50),
    mkBin('2014-09', '2014-09-01', '2014-09-30', 1, 80, 100),
    mkBin('2015-09', '2015-09-01', '2015-09-30', 1, 200, 250),
    mkBin('2016-09', '2016-09-01', '2016-09-30', 1, 60, 75),
    mkBin('2019-08', '2019-08-01', '2019-08-31', 2, 100, 125),
    mkBin('2019-09', '2019-09-01', '2019-09-30', 2, 240, 300),
    mkBin('2020-09', '2020-09-01', '2020-09-30', 2, 50, 62),
    mkBin('2021-09', '2021-09-01', '2021-09-30', 2, 70, 88),
    mkBin('2023-09', '2023-09-01', '2023-09-30', 3, 180, 225),
    mkBin('2024-09', '2024-09-01', '2024-09-30', 3, 120, 150),
    mkBin('2025-09', '2025-09-01', '2025-09-30', 3, 90, 112),
    mkBin('2026-08', '2026-08-01', '2026-08-31', 3, 140, 175),
    mkBin('2026-09', '2026-09-01', '2026-09-30', 3, 160, 200),
    mkBin('2026-10', '2026-10-01', '2026-10-31', 3, 30, 38),
  ];

  const summary = computeHarmonizedSeries(bins, 'detection_count');
  assert.equal(summary.diagnostics.calibrated, true);
  assert.equal(summary.diagnostics.calibration_mode, 'OLS_LOG_BRIDGE');
  assert.equal(summary.diagnostics.validation_scheme, 'CHRONOLOGICAL_70_30_HOLDOUT');
  assert.equal(summary.diagnostics.active_overlap_bin_count, 14);
  assert.ok(summary.diagnostics.log_pearson_r !== null && summary.diagnostics.log_pearson_r > 0.99);
  assert.ok(summary.diagnostics.per_platform_median_ratio !== null);
  assert.ok(
    Math.abs(summary.diagnostics.per_platform_median_ratio - 2.5) < 0.1,
    `Expected per-sat ratio ~2.5 despite 1/2/3 VIIRS satellite expansion, got ${summary.diagnostics.per_platform_median_ratio}`
  );
  assert.ok(summary.diagnostics.holdout_mae !== null && summary.diagnostics.holdout_mae < 5);

  // Confirm raw counts were preserved without mutation and 80% prediction interval brackets estimate
  assert.equal(summary.points[0].modis_raw, 40);
  assert.equal(summary.points[0].viirs_raw, 50);
  assert.equal(summary.points[12].viirs_raw, 600);
  for (const pt of summary.points) {
    assert.ok(pt.bridged_modis_equiv !== null && pt.bridged_lower_80 !== null && pt.bridged_upper_80 !== null);
    assert.ok(pt.bridged_lower_80 <= pt.bridged_modis_equiv + 1e-6);
    assert.ok(pt.bridged_modis_equiv <= pt.bridged_upper_80 + 1e-6);
  }

  // Zero-overlap guard: must refuse to invent uncalibrated cross-sensor scaling
  const viirsOnlyBin: CalendarBinRecord = {
    ...mkBin('2026-11-12', '2026-11-12', '2026-11-12', 2, 0, 20),
    values: { MODIS: null, VIIRS: 40 },
    platform_breakdown: { TERRA: 0, AQUA: 0, SNPP: 0, NOAA20: 20, NOAA21: 20 },
  };
  const uncalibrated = computeHarmonizedSeries([viirsOnlyBin], 'detection_count');
  assert.equal(uncalibrated.diagnostics.calibrated, false);
  assert.equal(uncalibrated.diagnostics.calibration_mode, 'PLATFORM_NORMALIZED_ONLY');
  assert.equal(uncalibrated.points[0].viirs_calibrated_modis_equiv, null);
});

test('clusterCrossSensorObservations groups co-located MODIS+VIIRS thermal events and separates distant/temporal outliers', () => {
  const mCo = parseModisRecord(
    {
      latitude: -2.2,
      longitude: 114.0,
      brightness: 325,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-10-15',
      acq_time: '0330',
      satellite: 'T',
      confidence: 82,
      version: '6.1',
      bright_t31: 295,
      frp: 45,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 1 }
  );
  // Two VIIRS detections within ~0.5 km and 2h of mCo -> CO_DETECTED_BOTH
  const vCo1 = parseViirsRecord(
    {
      latitude: -2.203,
      longitude: 114.002,
      bright_ti4: 335,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-10-15',
      acq_time: '0520',
      satellite: 'N20',
      instrument: 'VIIRS',
      confidence: 'h',
      version: '2.0NRT',
      bright_ti5: 292,
      frp: 12,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 2 }
  );
  const vCo2 = parseViirsRecord(
    {
      latitude: -2.198,
      longitude: 113.997,
      bright_ti4: 332,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-10-15',
      acq_time: '0521',
      satellite: 'N21',
      instrument: 'VIIRS',
      confidence: 'n',
      version: '2.0NRT',
      bright_ti5: 291,
      frp: 8,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 3 }
  );
  // Distant small fire (~15 km away) -> VIIRS_ONLY_SMALL_OR_GAP
  const vFar = parseViirsRecord(
    {
      latitude: -2.35,
      longitude: 114.15,
      bright_ti4: 328,
      scan: 0.4,
      track: 0.4,
      acq_date: '2026-10-15',
      acq_time: '0522',
      satellite: 'N20',
      instrument: 'VIIRS',
      confidence: 'n',
      version: '2.0NRT',
      bright_ti5: 290,
      frp: 5,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 4 }
  );
  // Same location as mCo but >8h later (outside +-6h window) -> MODIS_ONLY_OVERPASS
  const mLate = parseModisRecord(
    {
      latitude: -2.2,
      longitude: 114.0,
      brightness: 321,
      scan: 1.0,
      track: 1.0,
      acq_date: '2026-10-15',
      acq_time: '1400',
      satellite: 'A',
      confidence: 75,
      version: '6.1',
      bright_t31: 294,
      frp: 30,
      daynight: 'D',
    },
    { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 5 }
  );

  const summary = clusterCrossSensorObservations([mCo, vCo1, vCo2, vFar, mLate], 6);
  assert.equal(summary.total_observations, 5);
  assert.equal(summary.total_clusters, 3);
  assert.equal(summary.co_detected_clusters, 1);
  assert.equal(summary.viirs_only_clusters, 1);
  assert.equal(summary.modis_only_clusters, 1);
  assert.equal(summary.empirical_co_detected_viirs_per_modis, 2);
  assert.equal(summary.co_detected_modis_frp_mw, 45);
  assert.equal(summary.co_detected_viirs_frp_mw, 20);
});

test('globalPresetsService loads real compressed NASA FIRMS global archive cleanly', async () => {
  const {
    getGlobalPresetsManifest,
    queryGlobalPresetBuckets,
    queryGlobalPresetObservations,
  } = await import('../services/globalPresetsService');
  const manifest = getGlobalPresetsManifest();
  assert.ok(manifest && manifest.available, 'global_presets_nasa.json.gz manifest must be available');
  assert.ok(manifest.canonical_rows_total > 600_000);
  assert.ok(manifest.aoi_ids.includes('california-sierra'));
  assert.ok(manifest.aoi_ids.includes('para-amazon'));
  assert.ok(manifest.aoi_ids.includes('congo-zambezi-africa'));
  assert.ok(manifest.aoi_ids.includes('kakadu-savanna'));

  const caBuckets = queryGlobalPresetBuckets({
    bbox: { west: -122.2, south: 39.2, east: -120.4, north: 40.6 },
    startDate: '2026-10-01',
    endDate: '2026-11-15',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });
  const totalCa = caBuckets.reduce((acc, b) => acc + b.detection_count, 0);
  assert.ok(totalCa > 500, `Expected >500 real NASA California detections, got ${totalCa}`);

  const caObs = queryGlobalPresetObservations({
    aoi: {
      id: 'california-sierra',
      name: 'CA',
      regionLabel: 'US',
      description: '',
      geometryType: 'BBOX',
      bbox: { west: -122.2, south: 39.2, east: -120.4, north: 40.6 },
      timezone: 'UTC',
      utcOffsetLabel: 'UTC',
      areaSqKm: 24180,
      biome: 'Conifer',
    },
    startDate: '2026-10-01',
    endDate: '2026-11-15',
  });
  assert.ok(caObs.length > 100);
});

test('Regression #31 (Step 1): M3 harmonization is disabled by default unless explicitly opted in', () => {
  const sampleRecs = [
    parseModisRecord(
      {
        latitude: -2.2,
        longitude: 114.0,
        brightness: 325,
        scan: 1.0,
        track: 1.0,
        acq_date: '2026-10-15',
        acq_time: '0330',
        satellite: 'T',
        confidence: 82,
        version: '6.1',
        bright_t31: 295,
        frp: 45,
        daynight: 'D',
      },
      { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 1 }
    ),
    parseViirsRecord(
      {
        latitude: -2.2,
        longitude: 114.0,
        bright_ti4: 335,
        scan: 0.4,
        track: 0.4,
        acq_date: '2026-10-15',
        acq_time: '0520',
        satellite: 'N20',
        instrument: 'VIIRS',
        confidence: 'h',
        version: '2.0NRT',
        bright_ti5: 292,
        frp: 15,
        daynight: 'D',
      },
      { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'test-sha', rowNumber: 2 }
    ),
  ];

  const rawDefault = aggregateCalendarAnalytics({
    allRawRecords: sampleRecs,
    aoi: SAMPLE_AOI,
    startDate: '2026-10-15',
    endDate: '2026-10-15',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    latestAcquisitionUtc: '2026-10-15T05:20:00Z',
    archiveChecksums: ['test-sha'],
  });
  assert.equal(rawDefault.harmonization, undefined);

  const rawOptedIn = aggregateCalendarAnalytics({
    allRawRecords: sampleRecs,
    aoi: SAMPLE_AOI,
    startDate: '2026-10-15',
    endDate: '2026-10-15',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    latestAcquisitionUtc: '2026-10-15T05:20:00Z',
    archiveChecksums: ['test-sha'],
    enableExperimentalM3: true,
  });
  assert.ok(rawOptedIn.harmonization !== undefined);
});

test('Regression #32 (Step 2): Client fallback returns explicit NO_SOURCE_DATA without synthetic archive data', async () => {
  const { createEmptyCalendarAnalytics, getLocalDataStatus } = await import(
    '../services/firescopeApi'
  );
  const emptyCal = createEmptyCalendarAnalytics({
    aoiId: 'california-sierra',
    customAoi: null,
    startDate: '2026-10-15',
    endDate: '2026-10-17',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
    excludeOffshore: true,
    calendarMetric: 'detection_count',
    controlDensity: 'overview',
    selectedBinKey: null,
    selectedObservationId: null,
  });
  assert.equal(emptyCal.series.length, 3);
  assert.ok(emptyCal.series.every((b) => b.coverage_state === 'NO_SOURCE_DATA'));
  assert.ok(
    emptyCal.series.every(
      (b) =>
        b.values.MODIS === null &&
        b.values.VIIRS === null &&
        b.pooled_observation_count === null
    )
  );
  assert.equal(emptyCal.provenance.sources.length, 0);

  const localStatus = getLocalDataStatus();
  assert.equal(localStatus.data_mode, 'NASA_ARCHIVE_BASELINE');
  assert.equal(localStatus.raw_archive_manifest.length, 0);
  assert.equal(localStatus.live_firms_connected, false);
});

test('Regression #33 (Step 4): coveredDateWindows marks uncovered bins as NO_SOURCE_DATA and straddling bins as PARTIAL_COVERAGE instead of false zeros', async () => {
  const { aggregateCalendarFromBuckets } = await import('./comparisonScience');
  const cal = aggregateCalendarFromBuckets({
    buckets: [],
    historicalMonthTotals: [],
    aoi: SAMPLE_AOI,
    startDate: '2026-10-08',
    endDate: '2026-10-16',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2026-10-10',
    archiveCoverageEnd: '2026-10-14',
    coveredDateWindows: [{ startDate: '2026-10-10', endDate: '2026-10-14' }],
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Coverage boundary test',
    sources: ['Test Coverage Window'],
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    latestAcquisitionUtc: '2026-10-14T23:59:59Z',
    archiveChecksums: [],
  });

  const beforeBin = cal.series.find((b) => b.bin_key === '2026-10-09');
  const coveredEmptyBin = cal.series.find((b) => b.bin_key === '2026-10-12');
  const afterBin = cal.series.find((b) => b.bin_key === '2026-10-15');

  assert.equal(beforeBin?.coverage_state, 'NO_SOURCE_DATA');
  assert.equal(beforeBin?.values.MODIS, null);
  assert.equal(beforeBin?.values.VIIRS, null);

  assert.equal(coveredEmptyBin?.coverage_state, 'NO_DETECTIONS_IN_AVAILABLE_RECORDS');
  assert.equal(coveredEmptyBin?.values.MODIS, 0);
  assert.equal(coveredEmptyBin?.values.VIIRS, 0);

  assert.equal(afterBin?.coverage_state, 'NO_SOURCE_DATA');
  assert.equal(afterBin?.values.MODIS, null);
  assert.equal(afterBin?.values.VIIRS, null);

  const weekly = aggregateCalendarFromBuckets({
    buckets: [],
    historicalMonthTotals: [],
    aoi: SAMPLE_AOI,
    startDate: '2026-10-12',
    endDate: '2026-10-18',
    granularity: 'week',
    sensor: 'ALL',
    platforms: ['TERRA', 'NOAA20'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2026-10-10',
    archiveCoverageEnd: '2026-10-14',
    coveredDateWindows: [{ startDate: '2026-10-10', endDate: '2026-10-14' }],
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'Partial week boundary test',
    sources: ['Test Coverage Window'],
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    latestAcquisitionUtc: '2026-10-14T23:59:59Z',
    archiveChecksums: [],
  });
  assert.equal(weekly.series[0]?.coverage_state, 'PARTIAL_COVERAGE');
});

test('Regression #34 (Step 5): Full-bin spatial concordance evaluates 100% of >150 detections and grid buckets', async () => {
  const bucketConcordance = computeBucketSpatialConcordance([
    {
      acq_date: '2026-10-15',
      lat_bin: -2.25,
      lng_bin: 114.0,
      sensor: 'MODIS',
      platform: 'TERRA',
      detection_count: 5,
      frp_sum_mw: 120,
    },
    {
      acq_date: '2026-10-15',
      lat_bin: -2.25,
      lng_bin: 114.0,
      sensor: 'VIIRS',
      platform: 'NOAA20',
      detection_count: 20,
      frp_sum_mw: 210,
    },
    {
      acq_date: '2026-10-15',
      lat_bin: -2.5,
      lng_bin: 114.25,
      sensor: 'VIIRS',
      platform: 'NOAA21',
      detection_count: 140,
      frp_sum_mw: 400,
    },
  ]);
  assert.ok(bucketConcordance);
  assert.equal(bucketConcordance.evaluation_scope, 'FULL_BIN_GRID_BUCKETS');
  assert.equal(bucketConcordance.total_observations, 165);
  assert.equal(bucketConcordance.co_detected_clusters, 1);
  assert.equal(bucketConcordance.viirs_only_clusters, 1);
  assert.equal(bucketConcordance.empirical_co_detected_viirs_per_modis, 4);

  const { queryParquetBinSpatialConcordance } = await import('../services/parquetService');
  const oneDayPts = await queryParquetBinSpatialConcordance({
    bbox: { west: 109.5, south: -3.5, east: 117.5, north: 2.5 },
    startUtc: '2026-10-15T00:00:00Z',
    endUtc: '2026-10-15T23:59:59Z',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });
  assert.ok(oneDayPts);
  assert.equal(oneDayPts.evaluation_scope, 'FULL_BIN_POINTS');
  assert.ok(oneDayPts.total_observations > 150);

  const largeRangeBuckets = await queryParquetBinSpatialConcordance({
    bbox: { west: 113.2, south: -3.2, east: 115.0, north: -1.8 },
    startUtc: '2026-10-01T00:00:00Z',
    endUtc: '2026-10-15T23:59:59Z',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });
  assert.ok(largeRangeBuckets);
  assert.equal(largeRangeBuckets.evaluation_scope, 'FULL_BIN_GRID_BUCKETS');
  assert.ok(largeRangeBuckets.total_observations > 25000);
});

test('Regression #35 (Step 3 & Step 6): Express API exposes accurate /api/v1/data/status, M3 gate, and Global Presets provenance', async () => {
  const { createApiApp } = await import('../../server');
  const app = createApiApp({ preloadLiveFeeds: false, offlineMode: true });
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const { port } = srv.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. /api/v1/data/status (Step 6): no DEMO_SNAPSHOT, exposes global_presets_archive & parquet_archive
    const statusRes = await fetch(`${baseUrl}/api/v1/data/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.notEqual(statusJson.data_mode, 'DEMO_SNAPSHOT');
    assert.equal(statusJson.data_mode, 'NASA_ARCHIVE_BASELINE');
    assert.equal(statusJson.parquet_archive?.available, true);
    assert.equal(statusJson.global_presets_archive?.available, true);

    // 2. /api/v1/analytics/calendar M3 default disabled even with include_harmonized=true (Step 1)
    const calM3Res = await fetch(
      `${baseUrl}/api/v1/analytics/calendar?aoi_id=kalimantan-peat&start_date=2026-10-15&end_date=2026-10-20&granularity=day&include_harmonized=true`
    );
    assert.equal(calM3Res.status, 200);
    const calM3Json = await calM3Res.json();
    assert.equal(calM3Json.harmonization, undefined);

    // 3. /api/v1/map/hotspots & /api/v1/map/grid provenance for California Global Presets (Step 3)
    const hotspotsRes = await fetch(
      `${baseUrl}/api/v1/map/hotspots?aoi_id=california-sierra&west=-122.2&south=39.2&east=-120.4&north=40.6&start_date=2026-10-15&end_date=2026-10-25`
    );
    assert.equal(hotspotsRes.status, 200);
    const hotspotsJson = await hotspotsRes.json();
    assert.equal(hotspotsJson.data_backing, 'GLOBAL_PRESETS_ARCHIVE');
    assert.ok(Array.isArray(hotspotsJson.sources) && hotspotsJson.sources.length > 0);
    assert.ok(hotspotsJson.items.length > 0);

    const gridRes = await fetch(
      `${baseUrl}/api/v1/map/grid?aoi_id=california-sierra&west=-122.2&south=39.2&east=-120.4&north=40.6&start_date=2026-10-15&end_date=2026-10-25&mode=grid`
    );
    assert.equal(gridRes.status, 200);
    const gridJson = await gridRes.json();
    assert.equal(gridJson.data_backing, 'GLOBAL_PRESETS_ARCHIVE');
    assert.ok(gridJson.cells.length > 0);
    assert.ok(gridJson.cells.every((c: { source_backing: string }) => c.source_backing === 'GLOBAL_PRESETS'));
  } finally {
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
  }
});

test('Regression #36 (Step 4 & Step 5): Express API emits NO_SOURCE_DATA for uncovered historical ranges and 100%-bin co_location on paginated observations', async () => {
  const { createApiApp } = await import('../../server');
  const app = createApiApp({ preloadLiveFeeds: false, offlineMode: true });
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const { port } = srv.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // /api/v1/analytics/calendar uncovered 2020 California window emits NO_SOURCE_DATA & nulls, not zeros (Step 4)
    const uncoveredRes = await fetch(
      `${baseUrl}/api/v1/analytics/calendar?aoi_id=california-sierra&start_date=2020-01-01&end_date=2020-01-05&granularity=day`
    );
    assert.equal(uncoveredRes.status, 200);
    const uncoveredJson = await uncoveredRes.json();
    assert.ok(uncoveredJson.demo_notice.startsWith('NO_SOURCE_DATA:'));
    assert.equal(uncoveredJson.series.length, 5);
    assert.ok(
      uncoveredJson.series.every(
        (b: CalendarBinRecord) =>
          b.coverage_state === 'NO_SOURCE_DATA' &&
          b.values.MODIS === null &&
          b.values.VIIRS === null &&
          b.pooled_observation_count === null
      )
    );

    // /api/v1/observations returns bounded 10-row page + full-bin co_location over 100% of matching bin points (Step 5)
    const obsRes = await fetch(
      `${baseUrl}/api/v1/observations?aoi_id=indonesia-archipelago&start_datetime_utc=2026-10-15T00:00:00Z&end_datetime_utc=2026-10-15T23:59:59Z&limit=10`
    );
    assert.equal(obsRes.status, 200);
    const obsJson = await obsRes.json();
    assert.equal(obsJson.items.length, 10);
    assert.ok(obsJson.total_matching > 150);
    assert.ok(obsJson.co_location);
    assert.equal(obsJson.co_location.evaluation_scope, 'FULL_BIN_POINTS');
    assert.equal(obsJson.co_location.total_observations, obsJson.total_matching);
  } finally {
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
  }
});

test('Regression #37 (Gap #3): FR-08 exposes constellation-normalized per-satellite rates across totals, YoY summary, and CSV export', () => {
  const buildEraCal = (
    startDate: string,
    endDate: string,
    viirsPlatforms: ('SNPP' | 'NOAA20' | 'NOAA21')[],
    modisCount: number,
    viirsPerSatCount: number
  ) => {
    const recs = [];
    for (let i = 0; i < modisCount; i++) {
      recs.push(
        parseModisRecord(
          {
            latitude: -2.4,
            longitude: 114.1,
            brightness: 328,
            scan: 1.0,
            track: 1.0,
            acq_date: startDate,
            acq_time: '0300',
            satellite: i % 2 === 0 ? 'Terra' : 'Aqua',
            confidence: 80,
            version: '6.1',
            bright_t31: 294,
            frp: 20,
            daynight: 'D',
          },
          { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'm-era', rowNumber: i + 1 }
        )
      );
    }
    let rowIdx = 1;
    for (const vPlat of viirsPlatforms) {
      const satCode = vPlat === 'SNPP' ? 'N' : vPlat === 'NOAA20' ? 'J1' : 'J2';
      for (let i = 0; i < viirsPerSatCount; i++) {
        recs.push(
          parseViirsRecord(
            {
              latitude: -2.45,
              longitude: 114.15,
              bright_ti4: 345,
              scan: 0.4,
              track: 0.4,
              acq_date: endDate,
              acq_time: '0600',
              satellite: satCode,
              confidence: 'h',
              version: '2.0',
              bright_ti5: 295,
              frp: 10,
              daynight: 'D',
            },
            { retrievedAtUtc: '2026-11-13T00:00:00Z', checksum: 'v-era', rowNumber: rowIdx++ }
          )
        );
      }
    }

    return aggregateCalendarFromBuckets({
      buckets: observationsToDailyBuckets(recs),
      aoi: SAMPLE_AOI,
      startDate,
      endDate,
      granularity: 'month',
      sensor: 'ALL',
      platforms: ['TERRA', 'AQUA', ...viirsPlatforms],
      processingStatus: 'ALL',
      dayNight: 'ALL',
      metric: 'detection_count',
      platformRegistry: TEST_PLATFORM_REGISTRY,
      archiveCoverageStart: '2012-01-01',
      archiveCoverageEnd: '2026-11-13',
      dataMode: 'LIVE_NASA_FIRMS',
      demoNotice: 'Era rate test',
      sources: ['NASA FIRMS Parquet'],
      retrievedAtUtc: '2026-11-13T10:00:00Z',
      latestAcquisitionUtc: `${endDate}T06:00:00Z`,
      archiveChecksums: ['sha-era'],
    });
  };

  // 2015: 1 VIIRS satellite (SNPP), 10 detections -> 10.0/sat
  // 2024: 3 VIIRS satellites (SNPP + NOAA20 + NOAA21), 30 detections -> 10.0/sat
  const cal2015 = buildEraCal('2015-09-01', '2015-09-10', ['SNPP'], 20, 10);
  const cal2024 = buildEraCal('2024-09-01', '2024-09-10', ['SNPP', 'NOAA20', 'NOAA21'], 20, 10);

  const comp = buildPeriodComparisonResponse({
    aoi: SAMPLE_AOI,
    periodA: cal2015,
    periodB: cal2024,
    periodALabel: '2015 Sep (1 VIIRS sat)',
    periodBLabel: '2024 Sep (3 VIIRS sats)',
    yoySummary: [
      {
        year: 2015,
        start_date: '2015-09-01',
        end_date: '2015-09-10',
        modis_detections: 20,
        viirs_detections: 10,
        modis_frp_sum_mw: 400,
        modis_frp_mean_mw: 20,
        viirs_frp_sum_mw: 100,
        viirs_frp_mean_mw: 10,
        active_platforms: ['TERRA', 'AQUA', 'SNPP'],
        processing_statuses: ['STANDARD'],
        data_backing: 'REAL_NASA_ARCHIVE_PARQUET',
      },
      {
        year: 2024,
        start_date: '2024-09-01',
        end_date: '2024-09-10',
        modis_detections: 20,
        viirs_detections: 30,
        modis_frp_sum_mw: 400,
        modis_frp_mean_mw: 20,
        viirs_frp_sum_mw: 300,
        viirs_frp_mean_mw: 10,
        active_platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
        processing_statuses: ['STANDARD'],
        data_backing: 'REAL_NASA_ARCHIVE_PARQUET',
      },
    ],
    dataBacking: 'REAL_NASA_ARCHIVE_PARQUET',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    archiveChecksums: ['sha-era'],
  });

  assert.equal(comp.totals.period_a_viirs, 10);
  assert.equal(comp.totals.period_b_viirs, 30);
  assert.equal(comp.totals.viirs_delta, 20);
  assert.equal(comp.totals.period_a_viirs_satellites, 1);
  assert.equal(comp.totals.period_b_viirs_satellites, 3);
  assert.equal(comp.totals.period_a_viirs_per_satellite, 10);
  assert.equal(comp.totals.period_b_viirs_per_satellite, 10);
  assert.equal(comp.totals.viirs_per_satellite_delta, 0);
  assert.equal(comp.totals.viirs_per_satellite_pct_change, 0);
  assert.equal(comp.totals.period_a_modis_satellites, 2);
  assert.equal(comp.totals.period_a_modis_per_satellite, 10);

  assert.equal(comp.yoy_summary[0]?.viirs_expected_satellites, 1);
  assert.equal(comp.yoy_summary[0]?.viirs_per_satellite, 10);
  assert.equal(comp.yoy_summary[1]?.viirs_expected_satellites, 3);
  assert.equal(comp.yoy_summary[1]?.viirs_per_satellite, 10);

  const csv = generatePeriodComparisonCsv(comp);
  assert.ok(
    csv.includes(
      'period_a_modis_per_sat,period_b_modis_per_sat,modis_per_sat_delta,period_a_viirs_per_sat,period_b_viirs_per_sat,viirs_per_sat_delta'
    )
  );
  assert.ok(csv.includes(',10,10,0,10,10,0'));
});

test('Regression #38 (Gap #1): Global World View merges Indonesia Parquet in covered windows and preserves NO_SOURCE_DATA outside them', async () => {
  const { queryGlobalPresetBuckets } = await import('../services/globalPresetsService');
  const { createApiApp } = await import('../../server');

  const presetOnlyBuckets = queryGlobalPresetBuckets({
    bbox: { west: -180, south: -90, east: 180, north: 90 },
    startDate: '2026-10-15',
    endDate: '2026-10-20',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    modisMinConfidence: 0,
    viirsCategories: ['low', 'nominal', 'high'],
  });
  const presetOnlyTotal = presetOnlyBuckets.reduce((acc, b) => acc + b.detection_count, 0);

  const app = createApiApp({ preloadLiveFeeds: false, offlineMode: true });
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const { port } = srv.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Covered window merges 4 global presets + Indonesia Parquet archive
    const calRes = await fetch(
      `${baseUrl}/api/v1/analytics/calendar?aoi_id=global-world&start_date=2026-10-15&end_date=2026-10-20&granularity=day`
    );
    assert.equal(calRes.status, 200);
    const calJson = await calRes.json();
    const combinedTotal =
      (calJson.totals?.MODIS_detections ?? 0) + (calJson.totals?.VIIRS_detections ?? 0);
    assert.ok(
      combinedTotal > presetOnlyTotal,
      `Expected global-world combined total (${combinedTotal}) > preset-only total (${presetOnlyTotal})`
    );
    assert.ok(
      Array.isArray(calJson.provenance?.sources) &&
        calJson.provenance.sources.some((s: string) => /Parquet|Indonesia/i.test(s)),
      'Expected global-world sources to include Indonesia Parquet archive'
    );

    // 2. Uncovered historical gap remains NO_SOURCE_DATA with null counts
    const gapRes = await fetch(
      `${baseUrl}/api/v1/analytics/calendar?aoi_id=global-world&start_date=2024-05-01&end_date=2024-05-03&granularity=day`
    );
    assert.equal(gapRes.status, 200);
    const gapJson = await gapRes.json();
    assert.ok(gapJson.series.length === 3);
    assert.ok(
      gapJson.series.every(
        (b: CalendarBinRecord) =>
          b.coverage_state === 'NO_SOURCE_DATA' &&
          b.values.MODIS === null &&
          b.values.VIIRS === null
      )
    );

    // 3. /api/v1/analytics/compare for global-world returns multi-year YoY summary with per-sat rates
    const cmpRes = await fetch(
      `${baseUrl}/api/v1/analytics/compare?aoi_id=global-world&period_a_start=2024-10-15&period_a_end=2024-10-20&period_b_start=2025-10-15&period_b_end=2025-10-20`
    );
    assert.equal(cmpRes.status, 200);
    const cmpJson = await cmpRes.json();
    assert.ok(Array.isArray(cmpJson.yoy_summary) && cmpJson.yoy_summary.length >= 2);
    assert.ok(
      cmpJson.yoy_summary.every(
        (yr: { viirs_per_satellite?: number; viirs_expected_satellites?: number }) =>
          typeof yr.viirs_per_satellite === 'number' &&
          typeof yr.viirs_expected_satellites === 'number'
      )
    );

    // 4. /api/v1/observations returns merged total_matching and real observations for global-world
    const obsRes = await fetch(
      `${baseUrl}/api/v1/observations?aoi_id=global-world&start_date=2026-10-15&end_date=2026-10-15&limit=10`
    );
    assert.equal(obsRes.status, 200);
    const obsJson = await obsRes.json();
    assert.ok(obsJson.total_matching > 0);
    assert.ok(Array.isArray(obsJson.items) && obsJson.items.length > 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
  }
});

test('Regression #39 (Gap #2): generateProvenanceCsv exports per-satellite columns always and gates M3 columns behind analytics.harmonization', async () => {
  const { generateProvenanceCsv } = await import('../services/firescopeApi');

  const sampleRecs = [];
  for (let d = 15; d <= 17; d++) {
    const dayStr = `2024-10-${d}`;
    sampleRecs.push(
      parseModisRecord(
        {
          latitude: -2.2,
          longitude: 114.0,
          brightness: 325,
          scan: 1.0,
          track: 1.0,
          acq_date: dayStr,
          acq_time: '0300',
          satellite: 'Terra',
          confidence: 80,
          version: '6.1',
          bright_t31: 294,
          frp: 30,
          daynight: 'D',
        },
        { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'csv-m', rowNumber: d }
      ),
      parseViirsRecord(
        {
          latitude: -2.2,
          longitude: 114.0,
          bright_ti4: 342,
          scan: 0.4,
          track: 0.4,
          acq_date: dayStr,
          acq_time: '0600',
          satellite: 'N20',
          confidence: 'h',
          version: '2.0',
          bright_ti5: 292,
          frp: 15,
          daynight: 'D',
        },
        { retrievedAtUtc: '2026-11-15T00:00:00Z', checksum: 'csv-v', rowNumber: d }
      )
    );
  }

  const cal = aggregateCalendarFromBuckets({
    buckets: observationsToDailyBuckets(sampleRecs),
    aoi: SAMPLE_AOI,
    startDate: '2024-10-15',
    endDate: '2024-10-17',
    granularity: 'day',
    sensor: 'ALL',
    platforms: ['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21'],
    processingStatus: 'ALL',
    dayNight: 'ALL',
    metric: 'detection_count',
    platformRegistry: TEST_PLATFORM_REGISTRY,
    archiveCoverageStart: '2024-10-01',
    archiveCoverageEnd: '2024-10-31',
    dataMode: 'LIVE_NASA_FIRMS',
    demoNotice: 'CSV provenance test',
    sources: ['NASA FIRMS Parquet'],
    retrievedAtUtc: '2026-11-15T00:00:00Z',
    latestAcquisitionUtc: '2024-10-17T06:00:00Z',
    archiveChecksums: ['sha-csv'],
  });

  // Default (M3 disabled): includes per-sat columns, omits M3 columns & header
  const csvDefault = generateProvenanceCsv(cal);
  assert.ok(
    csvDefault.includes(
      'modis_active_satellites,viirs_active_satellites,modis_per_satellite,viirs_per_satellite'
    )
  );
  assert.equal(csvDefault.includes('m3_bridged_modis_equiv'), false);
  assert.equal(csvDefault.includes('# M3 Harmonization Method:'), false);

  // Experimental M3 enabled: appends M3 diagnostic header comments and 5 M3 columns
  const calWithM3 = {
    ...cal,
    harmonization: computeHarmonizedSeries(cal.series, 'detection_count'),
  };
  const csvWithM3 = generateProvenanceCsv(calWithM3);
  assert.ok(csvWithM3.includes('# M3 Harmonization Method: M3_EMPIRICAL_PLATFORM_BRIDGE'));
  assert.ok(
    csvWithM3.includes(
      'm3_bridged_modis_equiv,m3_bridged_lower_80,m3_bridged_upper_80,m3_bridged_source,m3_viirs_calibrated_modis_equiv'
    )
  );
});

test('Regression #40 (Gap #4): CalendarHeatmap inspector per-satellite rates and M3 bin lookup align across 1-sat and 3-sat VIIRS eras', () => {
  const mkOverlapBin = (
    binKey: string,
    startDate: string,
    endDate: string,
    viirsPlats: ('SNPP' | 'NOAA20' | 'NOAA21')[],
    modisTotal: number,
    viirsPerSat: number
  ): CalendarBinRecord => {
    const pBreakdown: CalendarBinRecord['platform_breakdown'] = {
      TERRA: Math.floor(modisTotal / 2),
      AQUA: Math.ceil(modisTotal / 2),
      SNPP: viirsPlats.includes('SNPP') ? viirsPerSat : 0,
      NOAA20: viirsPlats.includes('NOAA20') ? viirsPerSat : 0,
      NOAA21: viirsPlats.includes('NOAA21') ? viirsPerSat : 0,
    };
    const viirsTotal = viirsPlats.length * viirsPerSat;
    return {
      bin_key: binKey,
      label: binKey,
      time_bin_start_utc: `${startDate}T00:00:00Z`,
      time_bin_end_utc: `${endDate}T23:59:59Z`,
      granularity: 'month',
      coverage_state: 'OBSERVED_ACTIVE',
      values: { MODIS: modisTotal, VIIRS: viirsTotal },
      platform_breakdown: pBreakdown,
      processing_breakdown: { STANDARD: modisTotal + viirsTotal, NRT: 0, RT: 0, URT: 0, UNKNOWN: 0 },
      frp_summary: {
        MODIS: {
          sensor: 'MODIS',
          unit: 'MW',
          sum_mw: modisTotal * 20,
          mean_mw: 20,
          median_mw: 18,
          p90_mw: 35,
          valid_count: modisTotal,
          null_count: 0,
          processing_status_note: 'test',
        },
        VIIRS: {
          sensor: 'VIIRS',
          unit: 'MW',
          sum_mw: viirsTotal * 10,
          mean_mw: 10,
          median_mw: 8,
          p90_mw: 18,
          valid_count: viirsTotal,
          null_count: 0,
          processing_status_note: 'test',
        },
      },
      confidence_breakdown: {
        MODIS_numeric_bins: { low_0_29: 0, nominal_30_79: modisTotal, high_80_100: 0 },
        VIIRS_categorical: { low: 0, nominal: viirsTotal, high: 0 },
      },
      pooled_observation_count: modisTotal + viirsTotal,
      pooled_caveat: 'test',
      quality: {
        coverage_note: 'test',
        active_platforms: ['TERRA', 'AQUA', ...viirsPlats],
        unavailable_platforms: [],
        superseded_nrt_count: 0,
        exact_duplicates_removed: 0,
      },
    };
  };

  const bins: CalendarBinRecord[] = [
    mkOverlapBin('2015-08', '2015-08-01', '2015-08-31', ['SNPP'], 20, 25),
    mkOverlapBin('2015-09', '2015-09-01', '2015-09-30', ['SNPP'], 40, 50),
    mkOverlapBin('2016-09', '2016-09-01', '2016-09-30', ['SNPP'], 60, 75),
    mkOverlapBin('2024-08', '2024-08-01', '2024-08-31', ['SNPP', 'NOAA20', 'NOAA21'], 20, 25),
    mkOverlapBin('2024-09', '2024-09-01', '2024-09-30', ['SNPP', 'NOAA20', 'NOAA21'], 40, 50),
    mkOverlapBin('2024-10', '2024-10-01', '2024-10-31', ['SNPP', 'NOAA20', 'NOAA21'], 60, 75),
  ];

  const sats2015 = getExpectedActivePlatforms(
    bins[1].time_bin_start_utc,
    bins[1].time_bin_end_utc,
    bins[1].quality.active_platforms,
    bins[1].platform_breakdown
  );
  const sats2024 = getExpectedActivePlatforms(
    bins[4].time_bin_start_utc,
    bins[4].time_bin_end_utc,
    bins[4].quality.active_platforms,
    bins[4].platform_breakdown
  );
  assert.deepEqual(sats2015, { modis: 2, viirs: 1 });
  assert.deepEqual(sats2024, { modis: 2, viirs: 3 });

  // Both 2015-09 and 2024-09 produce 50.0 VIIRS detections/sat despite 3x raw VIIRS total in 2024
  assert.equal((bins[1].values.VIIRS ?? 0) / sats2015.viirs, 50);
  assert.equal((bins[4].values.VIIRS ?? 0) / sats2024.viirs, 50);

  const harmonization = computeHarmonizedSeries(bins, 'detection_count');
  const m3Point2015 = harmonization.points.find((p) => p.bin_key === bins[1].bin_key);
  const m3Point2024 = harmonization.points.find((p) => p.bin_key === bins[4].bin_key);
  assert.ok(m3Point2015 && m3Point2015.bridged_modis_equiv !== null);
  assert.ok(m3Point2024 && m3Point2024.bridged_modis_equiv !== null);
  assert.equal(m3Point2015.viirs_active_platforms, 1);
  assert.equal(m3Point2024.viirs_active_platforms, 3);
  assert.ok(
    Math.abs(m3Point2015.bridged_modis_equiv - m3Point2024.bridged_modis_equiv) < 0.1,
    'Equal per-satellite rates should yield aligned M3 MODIS-eq estimates across 1-sat vs 3-sat eras'
  );
});
