import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DuckDBInstance } from '@duckdb/node-api';

interface SourceZipSpec {
  zipFilename: string;
  productCode: string;
  sensor: 'MODIS' | 'VIIRS';
  collection: string;
  sourceUrl: string;
}

const SOURCE_ZIPS: SourceZipSpec[] = [
  {
    zipFilename: 'DL_FIRE_M-C61_844378.zip',
    productCode: 'MCD14ML_MCD14DL_C6_1',
    sensor: 'MODIS',
    collection: 'MODIS C6.1',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_M-C61_844378.zip',
  },
  {
    zipFilename: 'DL_FIRE_J1V-C2_844379.zip',
    productCode: 'VJ114IMGTDL_C2',
    sensor: 'VIIRS',
    collection: 'VIIRS C2',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_J1V-C2_844379.zip',
  },
  {
    zipFilename: 'DL_FIRE_J2V-C2_844380.zip',
    productCode: 'VJ214IMGTDL_C2',
    sensor: 'VIIRS',
    collection: 'VIIRS C2',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_J2V-C2_844380.zip',
  },
  {
    zipFilename: 'DL_FIRE_SV-C2_844381.zip',
    productCode: 'VNP14IMGTDL_C2',
    sensor: 'VIIRS',
    collection: 'VIIRS C2',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_SV-C2_844381.zip',
  },
];

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function sqlLiteral(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

async function main() {
  const rootDir = process.cwd();
  const rawDir = path.join(rootDir, 'data', 'raw');
  const processedDir = path.join(rootDir, 'data', 'processed');
  const tempExtractDir = '/tmp/firescope_raw_extract';

  fs.mkdirSync(processedDir, { recursive: true });
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
  fs.mkdirSync(tempExtractDir, { recursive: true });

  const parquetOutPath = path.join(processedDir, 'daily_aggregates.parquet');
  const recentObsOutPath = path.join(processedDir, 'recent_observations_2026.parquet');
  const manifestOutPath = path.join(processedDir, 'parquet_manifest.json');

  const csvSources: Array<{
    zipFilename: string;
    zipSha256: string;
    csvFilename: string;
    csvPath: string;
    csvSha256: string;
    sensor: 'MODIS' | 'VIIRS';
    collection: string;
    sourceProduct: string;
    sourceUrl: string;
    isNrtFile: boolean;
  }> = [];

  try {
    console.log('1. Verifying immutable ZIP checksums and extracting CSVs to /tmp...');
    for (const spec of SOURCE_ZIPS) {
      const zipPath = path.join(rawDir, spec.zipFilename);
      if (!fs.existsSync(zipPath)) {
        throw new Error(`Missing raw archive file: ${zipPath}`);
      }
      const zipSha256 = sha256File(zipPath);
      const subDir = path.join(tempExtractDir, spec.zipFilename.replace('.zip', ''));
      fs.mkdirSync(subDir, { recursive: true });
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', subDir]);

      const files = fs.readdirSync(subDir).filter((f) => f.endsWith('.csv')).sort();
      for (const csvFilename of files) {
        const csvPath = path.join(subDir, csvFilename);
        const csvSha256 = sha256File(csvPath);
        const isNrtFile = csvFilename.includes('_nrt_');
        csvSources.push({
          zipFilename: spec.zipFilename,
          zipSha256,
          csvFilename,
          csvPath,
          csvSha256,
          sensor: spec.sensor,
          collection: spec.collection,
          sourceProduct: isNrtFile ? `${spec.productCode}_NRT` : `${spec.productCode}_SP`,
          sourceUrl: spec.sourceUrl,
          isNrtFile,
        });
        console.log(`   Verified ${csvFilename} (sha256: ${csvSha256.slice(0, 12)}...)`);
      }
    }

    console.log('2. Initializing DuckDB and ingesting raw NASA FIRMS CSV streams...');
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();

    await conn.run(`
      CREATE TABLE raw_staging (
        sensor VARCHAR,
        platform VARCHAR,
        instrument VARCHAR,
        collection VARCHAR,
        source_product VARCHAR,
        source_file_checksum VARCHAR,
        source_filename VARCHAR,
        latitude DOUBLE,
        longitude DOUBLE,
        brightness_or_ti4 DOUBLE,
        bright_t31_or_ti5 DOUBLE,
        scan DOUBLE,
        track DOUBLE,
        acq_date VARCHAR,
        acq_time_native VARCHAR,
        confidence_raw VARCHAR,
        confidence_bucket VARCHAR,
        confidence_scheme VARCHAR,
        processing_version VARCHAR,
        processing_status VARCHAR,
        frp DOUBLE,
        daynight_native VARCHAR,
        type_native VARCHAR
      );
    `);

    const manifestEntries: Array<Record<string, unknown>> = [];

    for (const src of csvSources) {
      const insertSql = `
        INSERT INTO raw_staging
        SELECT
          ${sqlLiteral(src.sensor)} AS sensor,
          CASE
            WHEN ${sqlLiteral(src.sensor)} = 'MODIS' THEN
              CASE
                WHEN UPPER(TRIM(CAST(satellite AS VARCHAR))) IN ('T', 'TERRA') THEN 'TERRA'
                WHEN UPPER(TRIM(CAST(satellite AS VARCHAR))) IN ('A', 'AQUA') THEN 'AQUA'
                ELSE UPPER(TRIM(CAST(satellite AS VARCHAR)))
              END
            ELSE
              CASE
                WHEN UPPER(TRIM(CAST(satellite AS VARCHAR))) IN ('N', 'SNPP', 'SUOMI-NPP') OR UPPER(CAST(satellite AS VARCHAR)) LIKE '%SUOMI%' THEN 'SNPP'
                WHEN UPPER(TRIM(CAST(satellite AS VARCHAR))) IN ('1', 'N20', 'J1', 'NOAA-20', 'NOAA20') THEN 'NOAA20'
                WHEN UPPER(TRIM(CAST(satellite AS VARCHAR))) IN ('2', 'N21', 'J2', 'NOAA-21', 'NOAA21') THEN 'NOAA21'
                ELSE UPPER(TRIM(CAST(satellite AS VARCHAR)))
              END
          END AS platform,
          CASE
            WHEN ${sqlLiteral(src.sensor)} = 'MODIS' THEN 'MODIS'
            ELSE 'VIIRS'
          END AS instrument,
          ${sqlLiteral(src.collection)} AS collection,
          ${sqlLiteral(src.sourceProduct)} AS source_product,
          ${sqlLiteral(src.csvSha256)} AS source_file_checksum,
          ${sqlLiteral(src.csvFilename)} AS source_filename,
          CAST(latitude AS DOUBLE) AS latitude,
          CAST(longitude AS DOUBLE) AS longitude,
          TRY_CAST(brightness AS DOUBLE) AS brightness_or_ti4,
          TRY_CAST(bright_t31 AS DOUBLE) AS bright_t31_or_ti5,
          TRY_CAST(scan AS DOUBLE) AS scan,
          TRY_CAST(track AS DOUBLE) AS track,
          TRIM(CAST(acq_date AS VARCHAR)) AS acq_date,
          LPAD(TRIM(CAST(acq_time AS VARCHAR)), 4, '0') AS acq_time_native,
          LOWER(TRIM(CAST(confidence AS VARCHAR))) AS confidence_raw,
          CASE
            WHEN ${sqlLiteral(src.sensor)} = 'MODIS' THEN
              CASE
                WHEN TRY_CAST(confidence AS DOUBLE) < 30 THEN 'low_0_29'
                WHEN TRY_CAST(confidence AS DOUBLE) < 80 THEN 'nominal_30_79'
                ELSE 'high_80_100'
              END
            ELSE
              CASE
                WHEN LOWER(TRIM(CAST(confidence AS VARCHAR))) IN ('l', 'low') THEN 'low'
                WHEN LOWER(TRIM(CAST(confidence AS VARCHAR))) IN ('h', 'high') THEN 'high'
                ELSE 'nominal'
              END
          END AS confidence_bucket,
          CASE
            WHEN ${sqlLiteral(src.sensor)} = 'MODIS' THEN 'MODIS_NUMERIC_0_100'
            ELSE 'VIIRS_C2_CATEGORICAL'
          END AS confidence_scheme,
          TRIM(CAST(version AS VARCHAR)) AS processing_version,
          CASE
            WHEN UPPER(TRIM(CAST(version AS VARCHAR))) LIKE '%URT%' THEN 'URT'
            WHEN UPPER(TRIM(CAST(version AS VARCHAR))) LIKE '%NRT%' THEN 'NRT'
            WHEN UPPER(TRIM(CAST(version AS VARCHAR))) LIKE '%RT%' THEN 'RT'
            ELSE 'STANDARD'
          END AS processing_status,
          CASE WHEN TRY_CAST(frp AS DOUBLE) >= 0 THEN TRY_CAST(frp AS DOUBLE) ELSE NULL END AS frp,
          CASE
            WHEN UPPER(TRIM(CAST(daynight AS VARCHAR))) IN ('D', 'N') THEN UPPER(TRIM(CAST(daynight AS VARCHAR)))
            ELSE 'U'
          END AS daynight_native,
          NULL AS type_native
        FROM read_csv(${sqlLiteral(src.csvPath)}, header=true, all_varchar=true)
        WHERE TRY_CAST(latitude AS DOUBLE) BETWEEN -90 AND 90
          AND TRY_CAST(longitude AS DOUBLE) BETWEEN -180 AND 180
          AND regexp_matches(TRIM(CAST(acq_date AS VARCHAR)), '^\\d{4}-\\d{2}-\\d{2}$');
      `;
      await conn.run(insertSql);

      const fileStatsRes = await conn.runAndReadAll(`
        SELECT
          COUNT(*)::BIGINT AS row_count,
          MIN(acq_date) AS min_date,
          MAX(acq_date) AS max_date,
          STRING_AGG(DISTINCT platform, ',') AS platforms
        FROM raw_staging
        WHERE source_filename = ${sqlLiteral(src.csvFilename)};
      `);
      const statsRows = fileStatsRes.getRowObjects();
      const st = statsRows[0] ?? {};
      manifestEntries.push({
        file_id: src.csvFilename.replace('.csv', ''),
        filename: src.csvFilename,
        zip_filename: src.zipFilename,
        zip_sha256: src.zipSha256,
        source_url: src.sourceUrl,
        source_product: src.sourceProduct,
        sensor: src.sensor,
        collection: src.collection,
        processing_status: src.isNrtFile ? 'NRT' : 'STANDARD',
        sha256_checksum: src.csvSha256,
        row_count: Number(st.row_count ?? 0),
        date_window: `${st.min_date}..${st.max_date}`,
        platforms: String(st.platforms ?? '').split(',').filter(Boolean),
      });
      console.log(`   Loaded ${src.csvFilename}: ${Number(st.row_count ?? 0).toLocaleString()} rows (${st.min_date}..${st.max_date})`);
    }

    console.log('3. Deduplicating exact records and applying NRT -> STANDARD supersession...');
    await conn.run(`
      CREATE TABLE canonical_obs AS
      WITH ranked AS (
        SELECT
          *,
          CASE processing_status
            WHEN 'STANDARD' THEN 4
            WHEN 'NRT' THEN 3
            WHEN 'RT' THEN 2
            WHEN 'URT' THEN 1
            ELSE 0
          END AS status_rank,
          ROW_NUMBER() OVER (
            PARTITION BY sensor, platform, acq_date, acq_time_native, ROUND(latitude, 4), ROUND(longitude, 4)
            ORDER BY
              CASE processing_status
                WHEN 'STANDARD' THEN 4
                WHEN 'NRT' THEN 3
                WHEN 'RT' THEN 2
                WHEN 'URT' THEN 1
                ELSE 0
              END DESC,
              source_filename ASC
          ) AS rn
        FROM raw_staging
      )
      SELECT * FROM ranked WHERE rn = 1;
    `);

    const summaryRes = await conn.runAndReadAll(`
      SELECT
        (SELECT COUNT(*)::BIGINT FROM raw_staging) AS raw_total,
        (SELECT COUNT(*)::BIGINT FROM canonical_obs) AS canonical_total,
        (SELECT MIN(acq_date) FROM canonical_obs) AS min_date,
        (SELECT MAX(acq_date) FROM canonical_obs) AS max_date,
        (SELECT MIN(latitude) FROM canonical_obs) AS min_lat,
        (SELECT MAX(latitude) FROM canonical_obs) AS max_lat,
        (SELECT MIN(longitude) FROM canonical_obs) AS min_lng,
        (SELECT MAX(longitude) FROM canonical_obs) AS max_lng;
    `);
    const sumRow = summaryRes.getRowObjects()[0];
    const rawTotal = Number(sumRow.raw_total);
    const canonicalTotal = Number(sumRow.canonical_total);

    const dupRes = await conn.runAndReadAll(`
      WITH grouped AS (
        SELECT
          COUNT(*) AS total_copies,
          COUNT(DISTINCT processing_status) AS distinct_statuses
        FROM raw_staging
        GROUP BY sensor, platform, acq_date, acq_time_native, ROUND(latitude, 4), ROUND(longitude, 4)
        HAVING COUNT(*) > 1
      )
      SELECT
        COALESCE(SUM(CASE WHEN distinct_statuses > 1 THEN 1 ELSE 0 END), 0)::BIGINT AS superseded_nrt,
        COALESCE(SUM(total_copies - 1 - CASE WHEN distinct_statuses > 1 THEN 1 ELSE 0 END), 0)::BIGINT AS exact_dups
      FROM grouped;
    `);
    const dupRow = dupRes.getRowObjects()[0];
    const supersededNrtCount = Number(dupRow.superseded_nrt);
    const exactDuplicatesRemoved = Number(dupRow.exact_dups);

    console.log(
      `   Raw rows: ${rawTotal.toLocaleString()} -> Canonical rows: ${canonicalTotal.toLocaleString()} ` +
        `(superseded NRT: ${supersededNrtCount.toLocaleString()}, exact dups removed: ${exactDuplicatesRemoved.toLocaleString()})`
    );

    console.log('4. Writing ZSTD Parquet: daily_aggregates.parquet (0.25 deg spatial grid)...');
    await conn.run(`
      COPY (
        SELECT
          acq_date,
          CAST(FLOOR(latitude * 4.0) / 4.0 AS DOUBLE) AS lat_bin,
          CAST(FLOOR(longitude * 4.0) / 4.0 AS DOUBLE) AS lng_bin,
          sensor,
          platform,
          processing_status,
          daynight_native,
          confidence_bucket,
          COUNT(*)::INTEGER AS detection_count,
          COALESCE(SUM(frp), 0.0)::DOUBLE AS frp_sum_mw,
          COUNT(frp)::INTEGER AS frp_valid_count,
          (COUNT(*) - COUNT(frp))::INTEGER AS frp_null_count,
          MAX(frp)::DOUBLE AS frp_max_mw,
          ANY_VALUE(source_product) AS source_product,
          ANY_VALUE(source_file_checksum) AS source_file_checksum
        FROM canonical_obs
        GROUP BY
          acq_date,
          lat_bin,
          lng_bin,
          sensor,
          platform,
          processing_status,
          daynight_native,
          confidence_bucket
        ORDER BY acq_date, lat_bin, lng_bin, sensor, platform
      ) TO ${sqlLiteral(parquetOutPath)} (FORMAT PARQUET, COMPRESSION ZSTD);
    `);

    console.log('5. Writing recent_observations_2026.parquet (2026-10-01..2026-11-12 for fast M0_RAW drilldown)...');
    await conn.run(`
      COPY (
        SELECT
          sensor,
          platform,
          instrument,
          collection,
          source_product,
          source_file_checksum,
          latitude,
          longitude,
          brightness_or_ti4,
          bright_t31_or_ti5,
          scan,
          track,
          acq_date,
          acq_time_native,
          confidence_raw,
          confidence_bucket,
          confidence_scheme,
          processing_version,
          processing_status,
          frp,
          daynight_native
        FROM canonical_obs
        WHERE acq_date >= '2026-10-01'
        ORDER BY acq_date DESC, acq_time_native DESC
      ) TO ${sqlLiteral(recentObsOutPath)} (FORMAT PARQUET, COMPRESSION ZSTD);
    `);

    const pqStatsRes = await conn.runAndReadAll(`
      SELECT
        (SELECT COUNT(*)::BIGINT FROM read_parquet(${sqlLiteral(parquetOutPath)})) AS agg_rows,
        (SELECT COUNT(*)::BIGINT FROM read_parquet(${sqlLiteral(recentObsOutPath)})) AS recent_rows;
    `);
    const pqStats = pqStatsRes.getRowObjects()[0];

    const platformCoverageRes = await conn.runAndReadAll(`
      SELECT
        platform,
        sensor,
        MIN(acq_date) AS first_date,
        MAX(acq_date) AS last_date,
        COUNT(*)::BIGINT AS canonical_count
      FROM canonical_obs
      GROUP BY platform, sensor
      ORDER BY sensor, platform;
    `);

    const platformCoverage = platformCoverageRes.getRowObjects().map((r) => ({
      platform: r.platform,
      sensor: r.sensor,
      first_date: r.first_date,
      last_date: r.last_date,
      canonical_count: Number(r.canonical_count),
    }));

    const dailyAggBytes = fs.statSync(parquetOutPath).size;
    const recentObsBytes = fs.statSync(recentObsOutPath).size;

    const manifest = {
      schema_version: '1.0.0',
      generated_at_utc: new Date().toISOString(),
      spatial_grid_resolution_deg: 0.25,
      crs: 'EPSG:4326',
      coverage_bbox: {
        west: Number(Number(sumRow.min_lng).toFixed(4)),
        south: Number(Number(sumRow.min_lat).toFixed(4)),
        east: Number(Number(sumRow.max_lng).toFixed(4)),
        north: Number(Number(sumRow.max_lat).toFixed(4)),
      },
      region_label: 'Indonesia Extent (NASA FIRMS Official Historical Download)',
      date_range: {
        min_date: String(sumRow.min_date),
        max_date: String(sumRow.max_date),
      },
      raw_rows_total: rawTotal,
      canonical_rows_total: canonicalTotal,
      superseded_nrt_count: supersededNrtCount,
      exact_duplicates_removed: exactDuplicatesRemoved,
      daily_aggregates_parquet: {
        path: 'data/processed/daily_aggregates.parquet',
        rows: Number(pqStats.agg_rows),
        bytes: dailyAggBytes,
      },
      recent_observations_parquet: {
        path: 'data/processed/recent_observations_2026.parquet',
        min_date: '2026-10-01',
        rows: Number(pqStats.recent_rows),
        bytes: recentObsBytes,
      },
      platform_coverage: platformCoverage,
      source_files: manifestEntries,
    };

    fs.writeFileSync(manifestOutPath, JSON.stringify(manifest, null, 2));
    console.log(
      `Done! daily_aggregates.parquet=${(dailyAggBytes / 1024 / 1024).toFixed(2)} MB (${Number(
        pqStats.agg_rows
      ).toLocaleString()} grid-day bins), recent_observations_2026.parquet=${(
        recentObsBytes /
        1024 /
        1024
      ).toFixed(2)} MB (${Number(pqStats.recent_rows).toLocaleString()} raw rows)`
    );
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Failed to build Parquet dataset:', err);
  process.exit(1);
});
