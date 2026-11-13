import {
  AoiDefinition,
  CanonicalObservation,
  PlatformRegistryEntry,
  RawArchiveManifestEntry,
} from '../types/firescope';
import { parseModisRecord, parseViirsRecord } from '../science/fireScience';

export const RETRIEVED_AT_UTC = '2026-11-13T10:45:00Z';
export const LATEST_ACQUISITION_UTC = '2026-11-13T08:18:00Z';

export const PRESET_AOIS: AoiDefinition[] = [
  {
    id: 'global-world',
    name: 'Global World View (All Countries)',
    regionLabel: 'Global · All Continents',
    description:
      'Worldwide active-fire satellite observations across all continents and fire-prone regions (Americas, Africa, Southeast Asia & Indonesia, Europe/Mediterranean, Eurasia/Siberia, and Oceania).',
    geometryType: 'BBOX',
    bbox: { west: -179.9, south: -58.0, east: 179.9, north: 70.0 },
    timezone: 'UTC',
    utcOffsetLabel: 'UTC+00:00',
    areaSqKm: 510072000,
    biome: 'Global Multi-Biome Active Fire Coverage',
    isPreset: true,
  },
  {
    id: 'indonesia-archipelago',
    name: 'Indonesia Archipelago (Full National Extent)',
    regionLabel: 'Southeast Asia · Maritime Continent',
    description:
      'Complete Indonesian archipelago covering Sumatra, Java, Bali, Nusa Tenggara, Kalimantan, Sulawesi, Maluku, and Papua active-fire monitoring extent.',
    geometryType: 'BBOX',
    bbox: { west: 94.5, south: -11.5, east: 141.5, north: 6.5 },
    timezone: 'Asia/Jakarta',
    utcOffsetLabel: 'UTC+07:00..09:00',
    areaSqKm: 1904569,
    biome: 'Tropical Rainforest, Peatland & Savanna Mosaic',
    isPreset: true,
  },
  {
    id: 'kalimantan-peat',
    name: 'Central Kalimantan Peatlands, Indonesia',
    regionLabel: 'Southeast Asia · Borneo',
    description:
      'Deep tropical peat-swamp drainage and agricultural margin zone exhibiting distinct Aug–Nov dry-season burning activity and strong VIIRS 375 m smoldering anomaly sensitivity.',
    geometryType: 'BBOX',
    bbox: { west: 113.2, south: -3.2, east: 115.0, north: -1.8 },
    timezone: 'Asia/Pontianak',
    utcOffsetLabel: 'UTC+07:00',
    areaSqKm: 31120,
    biome: 'Tropical Peat Swamp Forest',
    isPreset: true,
  },
  {
    id: 'california-sierra',
    name: 'Northern Sierra & Sacramento Foothills, USA',
    regionLabel: 'North America · California',
    description:
      'Mediterranean mixed-conifer and chaparral corridor characterized by high-FRP summer/autumn wildland fire complexes and steep terrain view-zenith geometry variations.',
    geometryType: 'BBOX',
    bbox: { west: -122.2, south: 39.2, east: -120.4, north: 40.6 },
    timezone: 'America/Los_Angeles',
    utcOffsetLabel: 'UTC-08:00',
    areaSqKm: 24180,
    biome: 'Mediterranean Conifer & Chaparral',
    isPreset: true,
  },
  {
    id: 'para-amazon',
    name: 'Tapajós–Xingu Corridor, Pará, Brazil',
    regionLabel: 'South America · Eastern Amazon',
    description:
      'Humid tropical forest and pasture frontier along BR-163 with pronounced Jul–Nov seasonal burning peaks and frequent daytime cumulus cloud cover.',
    geometryType: 'BBOX',
    bbox: { west: -55.4, south: -5.2, east: -53.2, north: -3.4 },
    timezone: 'America/Santarem',
    utcOffsetLabel: 'UTC-03:00',
    areaSqKm: 48750,
    biome: 'Humid Tropical Broadleaf Forest',
    isPreset: true,
  },
  {
    id: 'congo-zambezi-africa',
    name: 'Congo Basin & Zambezi Savanna, Africa',
    regionLabel: 'Sub-Saharan Africa · Angola / DRC / Zambia',
    description:
      'Southern hemisphere Miombo woodland and savanna belt representing one of the largest seasonal biomass-burning regions on Earth (May–Oct dry season).',
    geometryType: 'BBOX',
    bbox: { west: 15.0, south: -15.5, east: 31.5, north: -4.0 },
    timezone: 'Africa/Lubumbashi',
    utcOffsetLabel: 'UTC+02:00',
    areaSqKm: 2140000,
    biome: 'Miombo Woodland & Tropical Savanna',
    isPreset: true,
  },
  {
    id: 'kakadu-savanna',
    name: 'Arnhem Land & Kakadu Savanna, Australia',
    regionLabel: 'Oceania · Northern Territory',
    description:
      'Tropical eucalypt savanna with recurring early-dry-season prescribed management burns (May–Jul) and late-dry-season wildfire regime (Sep–Nov).',
    geometryType: 'BBOX',
    bbox: { west: 131.8, south: -13.6, east: 133.8, north: -12.1 },
    timezone: 'Australia/Darwin',
    utcOffsetLabel: 'UTC+09:30',
    areaSqKm: 36040,
    biome: 'Tropical Eucalypt Savanna',
    isPreset: true,
  },
];

export const PLATFORM_REGISTRY: PlatformRegistryEntry[] = [
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
    latest_acquisition_utc: '2026-11-13T03:18:00Z',
    status_checked_at_utc: RETRIEVED_AT_UTC,
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note:
      'Morning equatorial crossing (~10:30 local). Standard science-quality processing replaces NRT at ~5-month lag.',
    color_hex: '#FFB454',
  },
  {
    platform_id: 'AQUA',
    display_name: 'MODIS Aqua',
    sensor: 'MODIS',
    instrument: 'MODIS',
    product_code: 'MYD14 / MCD14DL',
    collection: 'MODIS C6.1',
    nominal_resolution: '1 km',
    first_observation_date: '2002-07-03',
    last_observation_date: '2026-11-13',
    status: 'ACTIVE',
    processing_Available: ['NRT', 'STANDARD'],
    latest_acquisition_utc: '2026-11-13T06:42:00Z',
    status_checked_at_utc: RETRIEVED_AT_UTC,
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note:
      'Afternoon equatorial crossing (~13:30 local). Captures peak diurnal fire radiative power.',
    color_hex: '#F59E0B',
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
    status_checked_at_utc: RETRIEVED_AT_UTC,
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note:
      'FIRMS archive coverage listed through 2026-11-02. Treated as historical-only after 2026-11-02; never interpret post-Nov 2 gap as fire decline.',
    color_hex: '#61BDE0',
  },
  {
    platform_id: 'NOAA20',
    display_name: 'VIIRS NOAA-20 (JPSS-1)',
    sensor: 'VIIRS',
    instrument: 'VIIRS',
    product_code: 'VJ114IMGTDL',
    collection: 'VIIRS C2',
    nominal_resolution: '375 m',
    first_observation_date: '2018-04-01',
    last_observation_date: '2026-11-13',
    status: 'ACTIVE',
    processing_Available: ['NRT', 'STANDARD'],
    latest_acquisition_utc: '2026-11-13T07:55:00Z',
    status_checked_at_utc: RETRIEVED_AT_UTC,
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note:
      'Collection 2 375 m hybrid I-band detection with M13 sub-pixel FRP retrieval.',
    color_hex: '#38BDF8',
  },
  {
    platform_id: 'NOAA21',
    display_name: 'VIIRS NOAA-21 (JPSS-2)',
    sensor: 'VIIRS',
    instrument: 'VIIRS',
    product_code: 'VJ214IMGTDL',
    collection: 'VIIRS C2',
    nominal_resolution: '375 m',
    first_observation_date: '2023-03-01',
    last_observation_date: '2026-11-13',
    status: 'ACTIVE',
    processing_Available: ['NRT', 'STANDARD'],
    latest_acquisition_utc: '2026-11-13T08:18:00Z',
    status_checked_at_utc: RETRIEVED_AT_UTC,
    status_source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    status_note: 'Newest operational VIIRS 375 m platform in Collection 2.',
    color_hex: '#0284C7',
  },
];

export const RAW_ARCHIVE_MANIFEST: RawArchiveManifestEntry[] = [
  {
    file_id: 'raw-modis-c61-std-2024-2026',
    filename: 'fire_archive_M-C61_global_20240101_20260615.csv',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    source_product: 'MCD14ML_C6_1',
    sensor: 'MODIS',
    platform: 'TERRA',
    collection: 'MODIS C6.1',
    processing_status: 'STANDARD',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    sha256_checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    row_count: 428,
    aoi_id: 'ALL_PRESETS',
    date_window: '2024-01-01..2026-06-15',
  },
  {
    file_id: 'raw-modis-c61-nrt-2026',
    filename: 'MODIS_C6_1_Global_NRT_20260616_20261113.csv',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/MODIS_NRT',
    source_product: 'MCD14DL_NRT',
    sensor: 'MODIS',
    platform: 'AQUA',
    collection: 'MODIS C6.1',
    processing_status: 'NRT',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    sha256_checksum: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    row_count: 364,
    aoi_id: 'ALL_PRESETS',
    date_window: '2026-06-16..2026-11-13',
  },
  {
    file_id: 'raw-viirs-snpp-c2-2024-20261102',
    filename: 'fire_archive_SV-C2_global_20240101_20261102.csv',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/download/',
    source_product: 'VNP14IMGTDL_C2',
    sensor: 'VIIRS',
    platform: 'SNPP',
    collection: 'VIIRS C2',
    processing_status: 'STANDARD',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    sha256_checksum: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    row_count: 512,
    aoi_id: 'ALL_PRESETS',
    date_window: '2024-01-01..2026-11-02',
  },
  {
    file_id: 'raw-viirs-noaa20-c2-nrt-2026',
    filename: 'J1_VIIRS_C2_Global_NRT_20260616_20261113.csv',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA20_NRT',
    source_product: 'VJ114IMGTDL_NRT',
    sensor: 'VIIRS',
    platform: 'NOAA20',
    collection: 'VIIRS C2',
    processing_status: 'NRT',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    sha256_checksum: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    row_count: 642,
    aoi_id: 'ALL_PRESETS',
    date_window: '2026-06-16..2026-11-13',
  },
  {
    file_id: 'raw-viirs-noaa21-c2-nrt-2026',
    filename: 'J2_VIIRS_C2_Global_NRT_20260616_20261113.csv',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA21_NRT',
    source_product: 'VJ214IMGTDL_NRT',
    sensor: 'VIIRS',
    platform: 'NOAA21',
    collection: 'VIIRS C2',
    processing_status: 'NRT',
    retrieved_at_utc: RETRIEVED_AT_UTC,
    sha256_checksum: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    row_count: 598,
    aoi_id: 'ALL_PRESETS',
    date_window: '2026-06-16..2026-11-13',
  },
];

/**
 * Deterministic seeded PRNG (Mulberry32) so fixture records are 100% reproducible across runs.
 */
function createSeededRng(seed: number): () => number {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildArchiveObservations(): CanonicalObservation[] {
  const rng = createSeededRng(20261113);
  const records: CanonicalObservation[] = [];
  let rowCounter = 1;

  // 1. Primary Regional AOI Seasonal Profiles (2024–2026)
  const coreAoiIds = [
    'kalimantan-peat',
    'california-sierra',
    'para-amazon',
    'kakadu-savanna',
  ];

  const seasonalProfiles: Record<string, number[]> = {
    'kalimantan-peat': [1, 1, 2, 2, 3, 5, 9, 16, 24, 28, 18, 4],
    'california-sierra': [1, 1, 1, 2, 4, 8, 18, 25, 22, 14, 6, 1],
    'para-amazon': [1, 1, 1, 2, 3, 7, 15, 26, 30, 22, 14, 3],
    'kakadu-savanna': [1, 1, 2, 5, 14, 18, 15, 16, 22, 19, 9, 2],
  };

  const clusterCenters: Record<string, Array<{ lat: number; lng: number }>> = {
    'kalimantan-peat': [
      { lat: -2.18, lng: 113.94 }, // Palangkaraya inland peat dome
      { lat: -2.42, lng: 114.22 }, // Pulang Pisau inland canal block
      { lat: -2.26, lng: 114.48 }, // Kapuas inland peat margin
      { lat: -2.52, lng: 113.76 }, // Sebangau inland forest
    ],
    'california-sierra': [
      { lat: 39.82, lng: -121.38 }, // Feather River canyon inland
      { lat: 40.16, lng: -121.68 }, // Tehama foothills inland
      { lat: 39.54, lng: -121.08 }, // Yuba / Tahoe foothills inland
    ],
    'para-amazon': [
      { lat: -4.18, lng: -54.62 }, // BR-163 Belterra / Ruropolis corridor
      { lat: -4.68, lng: -53.88 }, // Medicilandia / Xingu margin
      { lat: -3.84, lng: -54.12 }, // Uruara frontier
    ],
    'kakadu-savanna': [
      { lat: -12.82, lng: 132.62 }, // South Alligator inland savanna
      { lat: -13.14, lng: 133.16 }, // West Arnhem plateau inland
      { lat: -12.64, lng: 132.96 }, // East Alligator inland woodland
    ],
  };

  const years = [2024, 2025, 2026];

  for (const aoiId of coreAoiIds) {
    const profile = seasonalProfiles[aoiId];
    const centers = clusterCenters[aoiId];

    for (const year of years) {
      const maxMonth = year === 2026 ? 11 : 12;
      for (let month = 1; month <= maxMonth; month++) {
        const yearFactor =
          year === 2026 && (month === 10 || month === 11)
            ? 1.45
            : year === 2025
            ? 1.1
            : 0.9;
        const baseWeight = profile[month - 1];
        const modisCount = Math.max(
          0,
          Math.round(baseWeight * 0.45 * yearFactor + (rng() - 0.3))
        );
        const viirsCount = Math.max(
          0,
          Math.round(baseWeight * 1.35 * yearFactor + (rng() - 0.2))
        );

        const isStandardPeriod =
          year < 2026 || (year === 2026 && month <= 6);

        for (let i = 0; i < modisCount; i++) {
          const center = centers[i % centers.length];
          const maxDay = year === 2026 && month === 11 ? 11 : 28;
          const day =
            year === 2026 && month === 11
              ? 1 + (i % 11)
              : 1 + Math.floor(rng() * maxDay);
          if (aoiId === 'kalimantan-peat' && year === 2026 && month === 11 && day === 8) {
            continue;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const sat = i % 2 === 0 ? 'Terra' : 'Aqua';
          const hour = sat === 'Terra' ? 3 + (i % 2) : 6 + (i % 2);
          const min = Math.floor(rng() * 59);
          const timeStr = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
          const lat = Number((center.lat + (rng() - 0.5) * 0.26).toFixed(4));
          const lng = Number((center.lng + (rng() - 0.5) * 0.32).toFixed(4));
          const conf = Math.min(100, Math.max(18, Math.round(45 + rng() * 52)));
          const scan = Number((1.0 + rng() * 0.8).toFixed(2));
          const track = Number((1.0 + rng() * 0.4).toFixed(2));
          const frp =
            i % 17 === 0 ? null : Number((8.5 + rng() * 68.0 * scan).toFixed(1));
          const brightness = Number((312.0 + rng() * 38.0).toFixed(1));
          const brightT31 = Number((291.0 + rng() * 11.0).toFixed(1));

          const modisRow = {
            latitude: lat,
            longitude: lng,
            brightness,
            scan,
            track,
            acq_date: dateStr,
            acq_time: timeStr,
            satellite: sat,
            confidence: conf,
            version: isStandardPeriod ? '6.1' : '6.1NRT',
            bright_t31: brightT31,
            frp,
            daynight: (rng() > 0.22 ? 'D' : 'N') as 'D' | 'N',
            type: isStandardPeriod ? 0 : null,
          };

          const obs = parseModisRecord(modisRow, {
            sourceProduct: isStandardPeriod ? 'MCD14ML_C6_1' : 'MCD14DL_NRT',
            retrievedAtUtc: RETRIEVED_AT_UTC,
            checksum: isStandardPeriod
              ? RAW_ARCHIVE_MANIFEST[0].sha256_checksum
              : RAW_ARCHIVE_MANIFEST[1].sha256_checksum,
            rowNumber: rowCounter++,
          });
          records.push(obs);

          if (year === 2026 && month === 6 && i === 0) {
            records.push(
              parseModisRecord(
                { ...modisRow, version: '6.1NRT', frp: frp ? Number((frp - 0.8).toFixed(1)) : 15.0 },
                {
                  sourceProduct: 'MCD14DL_NRT',
                  retrievedAtUtc: '2026-06-20T00:00:00Z',
                  checksum: RAW_ARCHIVE_MANIFEST[1].sha256_checksum,
                  rowNumber: rowCounter++,
                }
              )
            );
          }
        }

        for (let j = 0; j < viirsCount; j++) {
          const center = centers[j % centers.length];
          const maxDay = year === 2026 && month === 11 ? 11 : 28;
          const day =
            year === 2026 && month === 11
              ? 1 + (j % 11)
              : 1 + Math.floor(rng() * maxDay);
          if (aoiId === 'kalimantan-peat' && year === 2026 && month === 11 && day === 8) {
            continue;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isAfterSnppEnd = dateStr > '2026-11-02';
          const satOptions = isAfterSnppEnd ? ['N20', 'N21'] : ['SNPP', 'N20', 'N21'];
          const sat = satOptions[j % satOptions.length];

          const hour = 5 + (j % 4);
          const min = Math.floor(rng() * 59);
          const timeStr = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
          const lat = Number((center.lat + (rng() - 0.5) * 0.28).toFixed(4));
          const lng = Number((center.lng + (rng() - 0.5) * 0.34).toFixed(4));
          const confRoll = rng();
          const conf = confRoll < 0.16 ? 'l' : confRoll < 0.74 ? 'n' : 'h';
          const scan = Number((0.38 + rng() * 0.24).toFixed(2));
          const track = Number((0.36 + rng() * 0.18).toFixed(2));
          const frp =
            j % 23 === 0 ? null : Number((1.8 + rng() * 29.5).toFixed(1));
          const brightTi4 = Number((326.0 + rng() * 41.0).toFixed(1));
          const brightTi5 = Number((293.0 + rng() * 14.0).toFixed(1));

          const viirsRow = {
            latitude: lat,
            longitude: lng,
            bright_ti4: brightTi4,
            scan,
            track,
            acq_date: dateStr,
            acq_time: timeStr,
            satellite: sat,
            instrument: 'VIIRS',
            confidence: conf,
            version: isStandardPeriod ? '2.0' : '2.0NRT',
            bright_ti5: brightTi5,
            frp,
            daynight: (rng() > 0.28 ? 'D' : 'N') as 'D' | 'N',
          };

          const checksum =
            sat === 'SNPP'
              ? RAW_ARCHIVE_MANIFEST[2].sha256_checksum
              : sat === 'N20'
              ? RAW_ARCHIVE_MANIFEST[3].sha256_checksum
              : RAW_ARCHIVE_MANIFEST[4].sha256_checksum;

          records.push(
            parseViirsRecord(viirsRow, {
              sourceProduct:
                sat === 'SNPP'
                  ? 'VNP14IMGTDL_C2'
                  : sat === 'N20'
                  ? 'VJ114IMGTDL_NRT'
                  : 'VJ214IMGTDL_NRT',
              retrievedAtUtc: RETRIEVED_AT_UTC,
              checksum,
              rowNumber: rowCounter++,
            })
          );
        }
      }
    }
  }

  // 2. Worldwide Active Fire Belts Strictly Anchored to Inland Terrestrial Landmasses (WGS84 EPSG:4326)
  const worldFireZones: Array<{
    region: string;
    lat: number;
    lng: number;
    spreadLat: number;
    spreadLng: number;
    density: number;
  }> = [
    // Sub-Saharan & West/East/Southern Africa (Strictly Inland Terrestrial Coordinates)
    { region: 'Angola Bié & Moxico Miombo Inland', lat: -12.15, lng: 18.25, spreadLat: 1.5, spreadLng: 1.8, density: 18 },
    { region: 'Southern DR Congo Katanga & Kasai Inland', lat: -8.25, lng: 24.65, spreadLat: 1.6, spreadLng: 2.2, density: 18 },
    { region: 'Zambia Central Miombo Corridor', lat: -13.45, lng: 27.85, spreadLat: 1.2, spreadLng: 1.8, density: 16 },
    { region: 'Northern Mozambique Niassa Inland', lat: -13.25, lng: 37.25, spreadLat: 1.0, spreadLng: 1.1, density: 14 },
    { region: 'West Africa Savanna Inland (Nigeria / Burkina Faso)', lat: 10.65, lng: 6.45, spreadLat: 1.1, spreadLng: 2.6, density: 16 },
    { region: 'Central African Republic & South Sudan Inland', lat: 7.45, lng: 25.45, spreadLat: 1.4, spreadLng: 2.4, density: 15 },
    { region: 'Madagascar Central Highlands Inland', lat: -19.45, lng: 46.75, spreadLat: 1.1, spreadLng: 0.55, density: 10 },
    { region: 'South Africa Mpumalanga & Highveld Inland', lat: -25.25, lng: 30.15, spreadLat: 0.85, spreadLng: 0.85, density: 8 },

    // South & Central America (Strictly Inland Terrestrial Coordinates)
    { region: 'Mato Grosso & Rondônia Frontier, Brazil', lat: -11.65, lng: -56.45, spreadLat: 1.6, spreadLng: 2.0, density: 18 },
    { region: 'Pantanal & Mato Grosso do Sul Inland, Brazil', lat: -18.65, lng: -55.45, spreadLat: 1.3, spreadLng: 1.3, density: 14 },
    { region: 'Cerrado Tocantins & Goiás Inland, Brazil', lat: -11.45, lng: -47.85, spreadLat: 1.5, spreadLng: 1.5, density: 14 },
    { region: 'Santa Cruz Chiquitano Plains, Bolivia', lat: -16.65, lng: -61.45, spreadLat: 1.3, spreadLng: 1.5, density: 14 },
    { region: 'Gran Chaco Inland, Paraguay & Northern Argentina', lat: -23.85, lng: -60.65, spreadLat: 1.5, spreadLng: 1.5, density: 13 },
    { region: 'Llanos Orientales Inland, Colombia & Venezuela', lat: 5.85, lng: -68.85, spreadLat: 0.95, spreadLng: 1.5, density: 11 },
    { region: 'Central Valley Araucanía Inland, Chile', lat: -37.65, lng: -72.15, spreadLat: 0.55, spreadLng: 0.30, density: 7 },
    { region: 'Petén & Chiapas Forest Inland, Guatemala/Mexico', lat: 16.85, lng: -90.45, spreadLat: 0.55, spreadLng: 0.75, density: 11 },

    // North America (Strictly Inland Terrestrial Coordinates)
    { region: 'British Columbia & Alberta Boreal Inland, Canada', lat: 55.65, lng: -121.25, spreadLat: 1.5, spreadLng: 2.2, density: 15 },
    { region: 'Northwest Territories & Saskatchewan Boreal, Canada', lat: 58.65, lng: -108.45, spreadLat: 1.4, spreadLng: 2.2, density: 12 },
    { region: 'Quebec & Ontario Boreal Shield Inland, Canada', lat: 50.45, lng: -76.45, spreadLat: 1.1, spreadLng: 2.0, density: 9 },
    { region: 'Eastern Oregon & Idaho Mountains Inland, USA', lat: 44.45, lng: -116.25, spreadLat: 1.1, spreadLng: 1.5, density: 11 },
    { region: 'Mogollon Rim Arizona & New Mexico Inland, USA', lat: 34.25, lng: -109.25, spreadLat: 0.95, spreadLng: 1.3, density: 9 },
    { region: 'East Texas & Mississippi Pine Belt Inland, USA', lat: 32.15, lng: -93.45, spreadLat: 0.95, spreadLng: 1.6, density: 12 },

    // Southeast, South & East Asia (Strictly Inland Archipelago & Continental Coordinates)
    { region: 'Riau Mainland Interior Peatlands, Sumatra, Indonesia', lat: 0.45, lng: 101.45, spreadLat: 0.42, spreadLng: 0.42, density: 14 },
    { region: 'Jambi & South Sumatra Inland Plains, Indonesia', lat: -2.45, lng: 103.45, spreadLat: 0.45, spreadLng: 0.45, density: 10 },
    { region: 'Central Sulawesi Mainland Interior, Indonesia', lat: -1.85, lng: 120.35, spreadLat: 0.32, spreadLng: 0.32, density: 9 },
    { region: 'Southern Papua Digul / Merauke Inland, Indonesia', lat: -7.15, lng: 140.35, spreadLat: 0.42, spreadLng: 0.42, density: 10 },
    { region: 'Shan Plateau & Northern Thailand Inland', lat: 19.65, lng: 99.65, spreadLat: 1.1, spreadLng: 1.1, density: 15 },
    { region: 'Central Highlands Cambodia & Vietnam Inland', lat: 13.65, lng: 107.25, spreadLat: 0.75, spreadLng: 0.65, density: 11 },
    { region: 'Punjab & Haryana Plains Inland, India', lat: 30.45, lng: 75.65, spreadLat: 0.85, spreadLng: 0.95, density: 13 },
    { region: 'Central Chhattisgarh & Maharashtra Inland, India', lat: 20.65, lng: 80.25, spreadLat: 1.1, spreadLng: 1.3, density: 11 },
    { region: 'Guangxi & Hunan Hills Inland, China', lat: 24.85, lng: 110.45, spreadLat: 0.85, spreadLng: 1.1, density: 10 },
    { region: 'Heilongjiang Plains Inland, China', lat: 47.45, lng: 126.85, spreadLat: 1.1, spreadLng: 1.5, density: 10 },

    // Europe & Mediterranean (Strictly Inland Mountain & Steppe Corridors)
    { region: 'Extremadura & Castile Interior, Spain/Portugal', lat: 39.65, lng: -5.45, spreadLat: 0.65, spreadLng: 0.85, density: 10 },
    { region: 'Thessaly & Pindus Mainland Interior, Greece', lat: 39.75, lng: 21.75, spreadLat: 0.42, spreadLng: 0.42, density: 11 },
    { region: 'Basilicata & Calabria Inland Apennines, Italy', lat: 40.35, lng: 16.05, spreadLat: 0.32, spreadLng: 0.28, density: 8 },
    { region: 'Taurus Mountains Inland Anatolia, Turkey', lat: 37.55, lng: 31.85, spreadLat: 0.42, spreadLng: 0.85, density: 10 },
    { region: 'Eastern Europe Inland Steppe', lat: 48.65, lng: 36.25, spreadLat: 0.85, spreadLng: 1.2, density: 11 },

    // Eurasia, Siberia & Central Asia (Strictly Inland Boreal & Steppe)
    { region: 'Sakha / Yakutia Taiga Inland, Siberia', lat: 61.65, lng: 126.45, spreadLat: 1.8, spreadLng: 3.2, density: 16 },
    { region: 'Irkutsk & Krasnoyarsk Boreal Inland, Siberia', lat: 56.25, lng: 99.45, spreadLat: 1.5, spreadLng: 2.6, density: 14 },
    { region: 'Amur Basin Inland, Far East', lat: 51.45, lng: 128.45, spreadLat: 1.1, spreadLng: 1.8, density: 12 },
    { region: 'Northern Kazakhstan Steppe Inland', lat: 50.85, lng: 67.45, spreadLat: 1.3, spreadLng: 2.4, density: 12 },

    // Oceania / Australia (Strictly Inland Savanna & Bushland)
    { region: 'Kimberley & Tanami Inland, Western Australia', lat: -18.25, lng: 126.85, spreadLat: 0.95, spreadLng: 1.3, density: 13 },
    { region: 'North Queensland Inland Savanna, Australia', lat: -18.45, lng: 143.45, spreadLat: 1.1, spreadLng: 0.95, density: 14 },
    { region: 'New South Wales Great Dividing Range Inland, Australia', lat: -32.85, lng: 149.45, spreadLat: 0.95, spreadLng: 0.75, density: 9 },
  ];

  for (const zone of worldFireZones) {
    // Generate 2026 observations across months 1..11 (plus 2024/2025 baseline samples)
    for (const year of [2024, 2025, 2026]) {
      const countForYear = year === 2026 ? zone.density : Math.max(3, Math.round(zone.density * 0.45));
      for (let k = 0; k < countForYear; k++) {
        const month = year === 2026 ? 1 + (k % 11) : 1 + Math.floor(rng() * 12);
        const maxDay = year === 2026 && month === 11 ? 11 : 28;
        const day = 1 + Math.floor(rng() * maxDay);
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isStandardPeriod = year < 2026 || (year === 2026 && month <= 6);

        const lat = Number((zone.lat + (rng() - 0.5) * zone.spreadLat).toFixed(4));
        const lng = Number((zone.lng + (rng() - 0.5) * zone.spreadLng).toFixed(4));
        const isModis = k % 3 === 0;

        if (isModis) {
          const sat = k % 2 === 0 ? 'Terra' : 'Aqua';
          const hour = sat === 'Terra' ? 3 + (k % 4) : 11 + (k % 4);
          const min = Math.floor(rng() * 59);
          const timeStr = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
          const scan = Number((1.0 + rng() * 0.6).toFixed(2));
          const track = Number((1.0 + rng() * 0.35).toFixed(2));
          const frp = Number((11.0 + rng() * 74.0).toFixed(1));

          records.push(
            parseModisRecord(
              {
                latitude: lat,
                longitude: lng,
                brightness: Number((315.0 + rng() * 35.0).toFixed(1)),
                scan,
                track,
                acq_date: dateStr,
                acq_time: timeStr,
                satellite: sat,
                confidence: Math.min(100, Math.round(52 + rng() * 46)),
                version: isStandardPeriod ? '6.1' : '6.1NRT',
                bright_t31: Number((292.0 + rng() * 10.0).toFixed(1)),
                frp,
                daynight: rng() > 0.25 ? 'D' : 'N',
                type: isStandardPeriod ? 0 : null,
              },
              {
                sourceProduct: isStandardPeriod ? 'MCD14ML_C6_1' : 'MCD14DL_NRT',
                retrievedAtUtc: RETRIEVED_AT_UTC,
                checksum: isStandardPeriod
                  ? RAW_ARCHIVE_MANIFEST[0].sha256_checksum
                  : RAW_ARCHIVE_MANIFEST[1].sha256_checksum,
                rowNumber: rowCounter++,
              }
            )
          );
        } else {
          const isAfterSnppEnd = dateStr > '2026-11-02';
          const satOptions = isAfterSnppEnd ? ['N20', 'N21'] : ['SNPP', 'N20', 'N21'];
          const sat = satOptions[k % satOptions.length];
          const hour = 2 + (k % 18);
          const min = Math.floor(rng() * 59);
          const timeStr = `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
          const confRoll = rng();
          const conf = confRoll < 0.15 ? 'l' : confRoll < 0.75 ? 'n' : 'h';

          const checksum =
            sat === 'SNPP'
              ? RAW_ARCHIVE_MANIFEST[2].sha256_checksum
              : sat === 'N20'
              ? RAW_ARCHIVE_MANIFEST[3].sha256_checksum
              : RAW_ARCHIVE_MANIFEST[4].sha256_checksum;

          records.push(
            parseViirsRecord(
              {
                latitude: lat,
                longitude: lng,
                bright_ti4: Number((328.0 + rng() * 38.0).toFixed(1)),
                scan: Number((0.38 + rng() * 0.22).toFixed(2)),
                track: Number((0.36 + rng() * 0.16).toFixed(2)),
                acq_date: dateStr,
                acq_time: timeStr,
                satellite: sat,
                instrument: 'VIIRS',
                confidence: conf,
                version: isStandardPeriod ? '2.0' : '2.0NRT',
                bright_ti5: Number((294.0 + rng() * 12.0).toFixed(1)),
                frp: Number((2.4 + rng() * 34.0).toFixed(1)),
                daynight: rng() > 0.25 ? 'D' : 'N',
              },
              {
                sourceProduct:
                  sat === 'SNPP'
                    ? 'VNP14IMGTDL_C2'
                    : sat === 'N20'
                    ? 'VJ114IMGTDL_NRT'
                    : 'VJ214IMGTDL_NRT',
                retrievedAtUtc: RETRIEVED_AT_UTC,
                checksum,
                rowNumber: rowCounter++,
              }
            )
          );
        }
      }
    }
  }

  return records;
}

export const ALL_ARCHIVE_OBSERVATIONS: CanonicalObservation[] = buildArchiveObservations();
