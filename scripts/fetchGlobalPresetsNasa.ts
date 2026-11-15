import 'dotenv/config';
import crypto from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { PRESET_AOIS } from '../src/data/firmsArchiveData';
import {
  DailyAggregateBucket,
  observationsToDailyBuckets,
} from '../src/science/comparisonScience';
import { deduplicateAndSupersedeObservations } from '../src/science/fireScience';
import { fetchFirmsAreaRangeWithKey } from '../src/services/firmsLiveService';
import { CanonicalObservation, FirmsFeedStatusEntry } from '../src/types/firescope';

const GLOBAL_PRESET_IDS = [
  'california-sierra',
  'para-amazon',
  'congo-zambezi-africa',
  'kakadu-savanna',
];

const SEED_WINDOWS: Array<{ label: string; startDate: string; endDate: string }> = [
  { label: 'oct_nov_2026', startDate: '2026-10-01', endDate: '2026-11-15' },
  { label: 'oct_nov_2025', startDate: '2025-10-15', endDate: '2025-11-14' },
  { label: 'oct_nov_2024', startDate: '2024-10-15', endDate: '2024-11-14' },
];

const MAX_POINTS_PER_DAY_PER_AOI = 80;

function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function selectRepresentativeObservations(
  observations: CanonicalObservation[],
  maxPerDay = MAX_POINTS_PER_DAY_PER_AOI
): CanonicalObservation[] {
  const byDate = new Map<string, CanonicalObservation[]>();
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    let list = byDate.get(obs.acq_date);
    if (!list) {
      list = [];
      byDate.set(obs.acq_date, list);
    }
    list.push(obs);
  }

  const sampled: CanonicalObservation[] = [];
  for (const dayObs of byDate.values()) {
    const modis = dayObs
      .filter((o) => o.sensor === 'MODIS')
      .sort((a, b) => (b.frp_mw ?? 0) - (a.frp_mw ?? 0));
    const viirs = dayObs
      .filter((o) => o.sensor === 'VIIRS')
      .sort((a, b) => (b.frp_mw ?? 0) - (a.frp_mw ?? 0));

    const modisQuota = Math.min(modis.length, Math.ceil(maxPerDay / 2));
    const viirsQuota = Math.min(viirs.length, maxPerDay - modisQuota);
    const extraModis = Math.min(modis.length - modisQuota, maxPerDay - modisQuota - viirsQuota);

    const chosen = [
      ...modis.slice(0, modisQuota + extraModis),
      ...viirs.slice(0, viirsQuota),
    ];

    for (let i = 0; i < chosen.length; i++) {
      const o = chosen[i];
      sampled.push({
        ...o,
        raw_attributes: {},
      });
    }
  }
  return sampled;
}

async function main() {
  const mapKey = (process.env.FIRMS_MAP_KEY ?? '').trim();
  if (!mapKey || mapKey === 'YOUR_NASA_FIRMS_MAP_KEY_HERE') {
    console.error('Error: FIRMS_MAP_KEY is not configured in .env');
    process.exit(1);
  }

  const cacheFilePath = path.resolve(process.cwd(), '.cache/firms_area_cache.json');
  const outPath = path.resolve(process.cwd(), 'data/processed/global_presets_nasa.json.gz');
  const legacyUncompressedPath = path.resolve(
    process.cwd(),
    'data/processed/global_presets_nasa.json'
  );

  const allBuckets: DailyAggregateBucket[] = [];
  const allSampledObs: CanonicalObservation[] = [];
  const seenObsIds = new Set<string>();
  const bucketMergeMap = new Map<string, DailyAggregateBucket>();
  const feedsMap = new Map<string, FirmsFeedStatusEntry>();
  const aoiCounts: Record<string, Record<string, number>> = {};

  let totalRawCanonical = 0;
  let totalSupersededNrt = 0;
  let totalDuplicatesRemoved = 0;
  let totalApiCalls = 0;
  let totalCacheHits = 0;

  for (const aoiId of GLOBAL_PRESET_IDS) {
    const aoi = PRESET_AOIS.find((a) => a.id === aoiId);
    if (!aoi) continue;
    aoiCounts[aoiId] = {};
    const aoiObs: CanonicalObservation[] = [];

    for (const win of SEED_WINDOWS) {
      console.log(`Fetching NASA FIRMS [${aoiId}] ${win.startDate}..${win.endDate}...`);
      const result = await fetchFirmsAreaRangeWithKey({
        mapKey,
        bbox: aoi.bbox,
        startDate: win.startDate,
        endDate: win.endDate,
        sensor: 'ALL',
        maxWindowDays: 60,
        cacheFilePath,
        concurrency: 2,
        hashFn: sha256Hex,
      });

      totalApiCalls += result.apiCalls;
      totalCacheHits += result.cacheHits;
      aoiCounts[aoiId][win.label] = result.observations.length;

      for (let i = 0; i < result.observations.length; i++) {
        aoiObs.push(result.observations[i]);
      }

      for (const f of result.feedStats) {
        const key = `${aoiId}:${f.id}`;
        feedsMap.set(key, {
          id: key,
          product: f.product,
          platform: f.platform,
          row_count: f.row_count,
          sha256: f.sha256,
          source_url: f.source_url,
        });
      }

      console.log(
        `  -> ${result.observations.length} canonical obs (apiCalls=${result.apiCalls}, cacheHits=${result.cacheHits})`
      );
    }

    const dedupedAoi = deduplicateAndSupersedeObservations(aoiObs);
    totalRawCanonical += dedupedAoi.canonical.length;
    totalSupersededNrt += dedupedAoi.supersededNrtCount;
    totalDuplicatesRemoved += dedupedAoi.exactDuplicatesRemoved;

    const aoiBuckets = observationsToDailyBuckets(dedupedAoi.canonical);
    for (let i = 0; i < aoiBuckets.length; i++) {
      const b = aoiBuckets[i];
      const mKey = `${b.acq_date}|${b.lat_bin}|${b.lng_bin}|${b.sensor}|${b.platform}|${b.processing_status}|${b.daynight_native}|${b.confidence_bucket}`;
      if (!bucketMergeMap.has(mKey)) {
        bucketMergeMap.set(mKey, {
          ...b,
          frp_sum_mw: Number(b.frp_sum_mw.toFixed(2)),
          frp_max_mw:
            typeof b.frp_max_mw === 'number' ? Number(b.frp_max_mw.toFixed(2)) : null,
        });
      }
    }

    const rep = selectRepresentativeObservations(dedupedAoi.canonical);
    for (let i = 0; i < rep.length; i++) {
      const o = rep[i];
      if (!seenObsIds.has(o.observation_id)) {
        seenObsIds.add(o.observation_id);
        allSampledObs.push(o);
      }
    }
  }

  for (const b of bucketMergeMap.values()) {
    allBuckets.push(b);
  }
  allBuckets.sort((a, b) => a.acq_date.localeCompare(b.acq_date));
  allSampledObs.sort((a, b) => b.acq_datetime_utc.localeCompare(a.acq_datetime_utc));

  const payload = {
    schema_version: '2.0.0',
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source:
      'NASA FIRMS Area API v4 (MODIS C6.1 _SP/_NRT & VIIRS C2 S-NPP/NOAA-20/NOAA-21 _SP/_NRT)',
    aoi_ids: GLOBAL_PRESET_IDS,
    coverage_windows: SEED_WINDOWS.map((w) => ({
      start_date: w.startDate,
      end_date: w.endDate,
    })),
    aoi_row_summary: aoiCounts,
    canonical_rows_total: totalRawCanonical,
    bucket_rows_total: allBuckets.length,
    representative_observations_total: allSampledObs.length,
    superseded_nrt_count: totalSupersededNrt,
    exact_duplicates_removed: totalDuplicatesRemoved,
    checksums: Array.from(new Set(Array.from(feedsMap.values()).map((f) => f.sha256))),
    daily_buckets: allBuckets,
    observations: allSampledObs,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const jsonText = JSON.stringify(payload);
  const gzBuffer = zlib.gzipSync(Buffer.from(jsonText, 'utf8'), { level: 9 });
  await fs.writeFile(outPath, gzBuffer);
  await fs.rm(legacyUncompressedPath, { force: true });

  const rawMb = (Buffer.byteLength(jsonText, 'utf8') / (1024 * 1024)).toFixed(2);
  const gzMb = (gzBuffer.byteLength / (1024 * 1024)).toFixed(2);
  console.log(
    `\nSaved ${totalRawCanonical.toLocaleString()} total NASA obs (${allBuckets.length.toLocaleString()} lossless 0.25deg daily buckets + ${allSampledObs.length.toLocaleString()} representative point records, raw ${rawMb} MB -> gzipped ${gzMb} MB) to ${outPath}`
  );
  console.log(`Total API calls: ${totalApiCalls}, Total cache hits: ${totalCacheHits}`);
  console.log('Summary by AOI & window:', JSON.stringify(aoiCounts, null, 2));
}

main().catch((err) => {
  console.error('Failed to seed global presets NASA data:', err);
  process.exit(1);
});
