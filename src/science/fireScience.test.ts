import test from 'node:test';
import assert from 'node:assert/strict';
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
import { AoiDefinition, PlatformRegistryEntry } from '../types/firescope';
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






