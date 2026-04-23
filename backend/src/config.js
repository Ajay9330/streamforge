import dotenv from 'dotenv';

dotenv.config();

function parsePort(value, fallback) {
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

export const config = {
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
  enableAv1: parseBoolean(process.env.ENABLE_AV1, true),
  enableDash: parseBoolean(process.env.ENABLE_DASH, true),
  enableHls: parseBoolean(process.env.ENABLE_HLS, true),
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  minioEndpoint: process.env.MINIO_ENDPOINT ?? 'minio',
  minioPort: parsePort(process.env.MINIO_PORT, 9000),
  minioProcessedBucket: process.env.MINIO_PROCESSED_BUCKET ?? 'processed-videos',
  minioPublicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT ?? 'localhost',
  minioPublicPort: parsePort(process.env.MINIO_PUBLIC_PORT, 9000),
  minioRawBucket: process.env.MINIO_RAW_BUCKET ?? 'raw-videos',
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  postgresUrl:
    process.env.POSTGRES_URL ??
    'postgresql://postgres:postgres@postgres:5432/streamforge',
  port: parsePort(process.env.PORT, 3001),
  redisHost: process.env.REDIS_HOST ?? 'redis',
  redisPort: parsePort(process.env.REDIS_PORT, 6379),
  streamBaseUrl: process.env.STREAM_BASE_URL ?? 'http://localhost/streams'
};
