import path from 'node:path';

import * as Minio from 'minio';

import { config } from './config.js';

function createClient(endPoint, port) {
  return new Minio.Client({
    accessKey: config.minioAccessKey,
    endPoint,
    port,
    secretKey: config.minioSecretKey,
    useSSL: false
  });
}

export const internalMinioClient = createClient(
  config.minioEndpoint,
  config.minioPort
);

export const publicMinioClient = createClient(
  config.minioPublicEndpoint,
  config.minioPublicPort
);

async function ensureBucket(client, bucketName) {
  const bucketExists = await client.bucketExists(bucketName);

  if (!bucketExists) {
    try {
      await client.makeBucket(bucketName, 'us-east-1');
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

function buildPublicReadPolicy(bucketName) {
  return JSON.stringify({
    Statement: [
      {
        Action: ['s3:GetObject'],
        Effect: 'Allow',
        Principal: {
          AWS: ['*']
        },
        Resource: [`arn:aws:s3:::${bucketName}/*`],
        Sid: ''
      }
    ],
    Version: '2012-10-17'
  });
}

export async function ensureStorage() {
  await ensureBucket(internalMinioClient, config.minioRawBucket);
  await ensureBucket(internalMinioClient, config.minioProcessedBucket);
  await internalMinioClient.setBucketPolicy(
    config.minioProcessedBucket,
    buildPublicReadPolicy(config.minioProcessedBucket)
  );
}

async function objectExists(client, bucketName, objectName) {
  try {
    await client.statObject(bucketName, objectName);
    return true;
  } catch (error) {
    if (
      error.code === 'NotFound' ||
      error.code === 'NoSuchKey' ||
      error.code === 'NotFoundError'
    ) {
      return false;
    }

    throw error;
  }
}

async function listObjectNames(client, bucketName, prefix) {
  return await new Promise((resolve, reject) => {
    const names = [];
    const stream = client.listObjectsV2(bucketName, prefix, true);

    stream.on('data', (objectInfo) => {
      if (objectInfo?.name) {
        names.push(objectInfo.name);
      }
    });

    stream.on('error', reject);
    stream.on('end', () => {
      resolve(names);
    });
  });
}

export async function deleteVideoAssets(video) {
  const rawObjectKey = video.rawObjectKey ?? video.raw_object_key;
  const hlsObjectKey = video.hlsObjectKey ?? video.hls_object_key;
  const dashObjectKey = video.dashObjectKey ?? video.dash_object_key;
  const av1ObjectKey = video.av1ObjectKey ?? video.av1_object_key;

  if (rawObjectKey) {
    try {
      await internalMinioClient.removeObject(
        config.minioRawBucket,
        rawObjectKey
      );
    } catch (error) {
      if (
        error.code !== 'NoSuchKey' &&
        error.code !== 'NotFound' &&
        error.code !== 'NotFoundError'
      ) {
        throw error;
      }
    }
  }

  const processedPrefixes = new Set();

  if (hlsObjectKey) {
    processedPrefixes.add(`${path.posix.dirname(hlsObjectKey)}/`);
  }

  if (dashObjectKey) {
    processedPrefixes.add(`${path.posix.dirname(dashObjectKey)}/`);
  }

  if (av1ObjectKey) {
    processedPrefixes.add(`${path.posix.dirname(av1ObjectKey)}/`);
  }

  for (const prefix of processedPrefixes) {
    const objectNames = await listObjectNames(
      internalMinioClient,
      config.minioProcessedBucket,
      prefix
    );

    for (const objectName of objectNames) {
      try {
        await internalMinioClient.removeObject(
          config.minioProcessedBucket,
          objectName
        );
      } catch (error) {
        if (
          error.code !== 'NoSuchKey' &&
          error.code !== 'NotFound' &&
          error.code !== 'NotFoundError'
        ) {
          throw error;
        }
      }
    }
  }
}

export async function hasPlayableAsset(objectName) {
  return await objectExists(
    internalMinioClient,
    config.minioProcessedBucket,
    objectName
  );
}
