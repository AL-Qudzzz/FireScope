import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCalendarAnalytics,
  calculateGeometryMeasurement,
  computeFrpSummary,
  computeSeasonalBaseline,
  deduplicateAndSupersedeObservations,
  deriveProcessingStatus,
  isPointInAoi,
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



