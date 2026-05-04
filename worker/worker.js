import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as Minio from 'minio';
import pg from 'pg';

const renditions = [
  {
    bandwidth: 800000,
    height: 360,
    name: '360p',
    width: 640
  },
  {
    bandwidth: 1600000,
    height: 720,
    name: '720p',
    width: 1280
  },
  {
    bandwidth: 3000000,
    height: 1080,
    name: '1080p',
    width: 1920
  }
];

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function formatDurationSeconds(milliseconds) {
  return (milliseconds / 1000).toFixed(3);
}

const config = {
  av1Crf: parseInteger(process.env.AV1_CRF, 32),
  av1CpuUsed: parseInteger(process.env.AV1_CPU_USED, 6),
  enableAv1: parseBoolean(process.env.ENABLE_AV1, true),
  enableDash: parseBoolean(process.env.ENABLE_DASH, true),
  h264Preset: process.env.H264_PRESET ?? 'veryfast',
  segmentDurationMs: parseInteger(
    process.env.SEGMENT_DURATION_MS,
    parseInteger(process.env.SEGMENT_SECONDS, 2) * 1000
  ),
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  minioEndpoint: process.env.MINIO_ENDPOINT ?? 'minio',
  minioPort: Number.parseInt(process.env.MINIO_PORT ?? '9000', 10),
  minioProcessedBucket: process.env.MINIO_PROCESSED_BUCKET ?? 'processed-videos',
  minioRawBucket: process.env.MINIO_RAW_BUCKET ?? 'raw-videos',
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  postgresUrl:
    process.env.POSTGRES_URL ??
    'postgresql://postgres:postgres@postgres:5432/streamforge',
  workerConcurrency: parseInteger(process.env.WORKER_CONCURRENCY, 1),
  redisHost: process.env.REDIS_HOST ?? 'redis',
  redisPort: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  streamBaseUrl: process.env.STREAM_BASE_URL ?? 'http://localhost/streams'
};

const connection = new IORedis({
  host: config.redisHost,
  maxRetriesPerRequest: null,
  port: config.redisPort
});

const pool = new pg.Pool({
  connectionString: config.postgresUrl
});

const minioClient = new Minio.Client({
  accessKey: config.minioAccessKey,
  endPoint: config.minioEndpoint,
  port: config.minioPort,
  secretKey: config.minioSecretKey,
  useSSL: false
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      raw_object_key TEXT NOT NULL,
      hls_object_key TEXT NOT NULL,
      playback_url TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER,
      transcode_duration INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE videos
    ADD COLUMN IF NOT EXISTS dash_object_key TEXT,
    ADD COLUMN IF NOT EXISTS dash_playback_url TEXT,
    ADD COLUMN IF NOT EXISTS duration INTEGER,
    ADD COLUMN IF NOT EXISTS transcode_duration INTEGER;
  `);
}

async function ensureBucket(bucketName) {
  const bucketExists = await minioClient.bucketExists(bucketName);

  if (!bucketExists) {
    try {
      await minioClient.makeBucket(bucketName, 'us-east-1');
    } catch (error) {
      if (
        error.code !== 'BucketAlreadyExists' &&
        error.code !== 'BucketAlreadyOwnedByYou'
      ) {
        throw error;
      }
    }
  }
}

async function ensureStorage() {
  await ensureBucket(config.minioRawBucket);
  await ensureBucket(config.minioProcessedBucket);

  await minioClient.setBucketPolicy(
    config.minioProcessedBucket,
    JSON.stringify({
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: {
            AWS: ['*']
          },
          Resource: [`arn:aws:s3:::${config.minioProcessedBucket}/*`],
          Sid: ''
        }
      ],
      Version: '2012-10-17'
    })
  );
}

async function downloadObject(bucketName, objectName, outputPath) {
  const objectStream = await minioClient.getObject(bucketName, objectName);
  const fileStream = createWriteStream(outputPath);

  await pipeline(objectStream, fileStream);
}

async function getVideoDuration(inputPath) {
  const ffprobeArgs = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath
  ];

  const output = await new Promise((resolve, reject) => {
    const ffprobeProcess = spawn('ffprobe', ffprobeArgs);
    let stdout = '';
    let stderr = '';

    ffprobeProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    ffprobeProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffprobeProcess.on('error', reject);
    ffprobeProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
    });
  });

  const duration = Number.parseFloat(output.trim());

  if (Number.isNaN(duration)) {
    return null;
  }

  return Math.round(duration);
}

async function hasAudioStream(inputPath) {
  const ffprobeArgs = [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    inputPath
  ];

  const output = await new Promise((resolve, reject) => {
    const ffprobeProcess = spawn('ffprobe', ffprobeArgs);
    let stdout = '';
    let stderr = '';

    ffprobeProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    ffprobeProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffprobeProcess.on('error', reject);
    ffprobeProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
    });
  });

  return output.trim().length > 0;
}

async function renderHlsPackage(inputPath, outputDir) {
  async function renderVariant(variant) {
    const variantDir = path.join(outputDir, variant.name);
    const playlistPath = path.join(variantDir, 'index.m3u8');
    const segmentPath = path.join(variantDir, 'segment_%03d.ts');

    await fs.mkdir(variantDir, { recursive: true });

    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-vf',
        `scale=w=${variant.width}:h=${variant.height}:force_original_aspect_ratio=decrease`,
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-preset',
        'veryfast',
        '-sc_threshold',
        '0',
        '-g',
        '48',
        '-hls_list_size',
        '0',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        segmentPath,
        '-hls_time',
        formatDurationSeconds(config.segmentDurationMs),
        playlistPath
      ]);

      ffmpegProcess.stderr.on('data', (chunk) => {
        process.stdout.write(chunk);
      });

      ffmpegProcess.on('error', reject);
      ffmpegProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  for (const variant of renditions) {
    await renderVariant(variant);
  }

  const masterPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    ...renditions.flatMap((variant) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height}`,
      `${variant.name}/index.m3u8`
    ])
  ].join('\n');

  await fs.writeFile(path.join(outputDir, 'master.m3u8'), `${masterPlaylist}\n`);
}

async function renderAdaptivePackage(inputPath, outputDir, options) {
  const {
    codec,
    codecArgs = [],
    manifestName
  } = options;
  const audioAvailable = await hasAudioStream(inputPath);
  const filterParts = renditions.flatMap((rendition, index) => [
    `[v${index}src]scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease[v${index}]`
  ]);

  const filterGraph = [
    `[0:v]split=${renditions.length}${renditions
      .map((_, index) => `[v${index}src]`)
      .join('')}`,
    ...filterParts
  ].join(';');

  const ffmpegArgs = [
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    filterGraph
  ];

  renditions.forEach((rendition, index) => {
    const bitrateLabel = `${Math.round(rendition.bandwidth / 1000)}k`;

    ffmpegArgs.push('-map', `[v${index}]`);
    ffmpegArgs.push('-b:v:' + index, bitrateLabel);
  });

  ffmpegArgs.push('-c:v', codec, ...codecArgs);

  if (audioAvailable) {
    ffmpegArgs.push(
      '-map',
      '0:a?',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-adaptation_sets',
      'id=0,streams=v id=1,streams=a'
    );
  } else {
    ffmpegArgs.push('-an', '-adaptation_sets', 'id=0,streams=v');
  }

  ffmpegArgs.push(
    '-pix_fmt',
    'yuv420p',
    '-g',
    '48',
    '-use_timeline',
    '1',
    '-use_template',
    '1',
    '-seg_duration',
    formatDurationSeconds(config.segmentDurationMs),
    '-f',
    'dash',
    path.join(outputDir, manifestName)
  );

  await new Promise((resolve, reject) => {
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.stderr.on('data', (chunk) => {
      process.stdout.write(chunk);
    });

    ffmpegProcess.on('error', reject);
    ffmpegProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function renderDashPackage(inputPath, outputDir) {
  await renderAdaptivePackage(inputPath, outputDir, {
    codec: 'libx264',
    codecArgs: [
      '-profile:v',
      'main',
      '-preset',
      config.h264Preset,
      '-sc_threshold',
      '0',
      '-keyint_min',
      '48'
    ],
    manifestName: 'manifest.mpd'
  });
}

async function renderAv1Package(inputPath, outputDir) {
  await renderAdaptivePackage(inputPath, outputDir, {
    codec: 'libaom-av1',
    codecArgs: [
      '-cpu-used',
      String(config.av1CpuUsed),
      '-crf',
      String(config.av1Crf),
      '-row-mt',
      '1'
    ],
    manifestName: 'manifest.mpd'
  });
}

async function uploadDirectory(bucketName, directory, objectPrefix) {
  async function walk(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      const relativePath = path.relative(directory, entryPath).split(path.sep).join('/');
      const objectName = `${objectPrefix}/${relativePath}`;

      await minioClient.fPutObject(bucketName, objectName, entryPath);
    }
  }

  await walk(directory);
}

async function updateVideoStatus(videoId, status, updateValues = {}) {
  const values = [status, videoId];
  const assignments = ['status = $1', 'updated_at = NOW()'];

  if (Object.prototype.hasOwnProperty.call(updateValues, 'duration')) {
    values.push(updateValues.duration);
    assignments.push(`duration = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'transcodeDuration')) {
    values.push(updateValues.transcodeDuration);
    assignments.push(`transcode_duration = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'errorMessage')) {
    values.push(updateValues.errorMessage);
    assignments.push(`error_message = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'hlsObjectKey')) {
    values.push(updateValues.hlsObjectKey);
    assignments.push(`hls_object_key = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'dashObjectKey')) {
    values.push(updateValues.dashObjectKey);
    assignments.push(`dash_object_key = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'av1ObjectKey')) {
    values.push(updateValues.av1ObjectKey);
    assignments.push(`av1_object_key = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'playbackUrl')) {
    values.push(updateValues.playbackUrl);
    assignments.push(`playback_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'dashPlaybackUrl')) {
    values.push(updateValues.dashPlaybackUrl);
    assignments.push(`dash_playback_url = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(updateValues, 'av1PlaybackUrl')) {
    values.push(updateValues.av1PlaybackUrl);
    assignments.push(`av1_playback_url = $${values.length}`);
  }

  await pool.query(
    `
      UPDATE videos
      SET ${assignments.join(', ')}
      WHERE id = $2
    `,
    values
  );
}

async function processTranscodeJob(job) {
  const {
    av1ObjectKey,
    av1PlaybackUrl,
    enableAv1,
    enableDash,
    dashObjectKey,
    dashPlaybackUrl,
    hlsObjectKey,
    playbackUrl,
    rawObjectKey,
    videoId
  } = job.data;
  const dashEnabled = enableDash ?? config.enableDash;
  const av1Enabled = enableAv1 ?? config.enableAv1;
  const workDir = await fs.mkdtemp(path.join(tmpdir(), 'streamforge-'));
  const inputPath = path.join(workDir, 'input.mp4');
  const hlsOutputDir = path.join(workDir, 'output', 'hls');
  const dashOutputDir = path.join(workDir, 'output', 'dash');
  const av1OutputDir = path.join(workDir, 'output', 'av1');

  await fs.mkdir(hlsOutputDir, { recursive: true });
  await fs.mkdir(dashOutputDir, { recursive: true });
  await fs.mkdir(av1OutputDir, { recursive: true });

  const startTime = Date.now();

  try {
    await downloadObject(config.minioRawBucket, rawObjectKey, inputPath);

    const duration = await getVideoDuration(inputPath);

    await renderHlsPackage(inputPath, hlsOutputDir);

    if (dashEnabled) {
      await renderDashPackage(inputPath, dashOutputDir);
    }

    let av1Available = true;

    if (av1Enabled) {
      try {
        await renderAv1Package(inputPath, av1OutputDir);
        await uploadDirectory(
          config.minioProcessedBucket,
          path.join(workDir, 'output', 'av1'),
          path.posix.dirname(av1ObjectKey)
        );
      } catch (error) {
        av1Available = false;
        console.warn(`AV1 render skipped for job ${videoId}: ${error.message}`);
      }
    } else {
      av1Available = false;
    }

    await uploadDirectory(
      config.minioProcessedBucket,
      path.join(workDir, 'output', 'hls'),
      path.posix.dirname(hlsObjectKey)
    );

    if (dashEnabled) {
      await uploadDirectory(
        config.minioProcessedBucket,
        path.join(workDir, 'output', 'dash'),
        path.posix.dirname(dashObjectKey)
      );
    }

    const transcodeDuration = Date.now() - startTime;

    await updateVideoStatus(videoId, 'completed', {
      av1ObjectKey: av1Available ? av1ObjectKey : null,
      av1PlaybackUrl: av1Available ? av1PlaybackUrl : null,
      dashObjectKey: dashEnabled ? dashObjectKey : null,
      dashPlaybackUrl: dashEnabled ? dashPlaybackUrl : null,
      duration,
      transcodeDuration,
      hlsObjectKey,
      playbackUrl
    });
  } catch (error) {
    await updateVideoStatus(videoId, 'failed', {
      errorMessage: error.message
    });

    throw error;
  } finally {
    await fs.rm(workDir, { force: true, recursive: true });
  }
}

async function main() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await initializeDatabase();
      await ensureStorage();
      break;
    } catch (error) {
      if (attempt === 30) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
    }
  }

  const worker = new Worker('video-processing', processTranscodeJob, {
    connection,
    concurrency: config.workerConcurrency
  });

  worker.on('completed', (job) => {
    console.log(`job completed: ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`job failed: ${job?.id}`);
    console.error(error);
  });

  console.log('worker running');
}

main().catch((error) => {
  console.error('worker failed to start');
  console.error(error);
  process.exit(1);
});
