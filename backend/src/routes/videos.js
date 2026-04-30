import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

import pool, { mapVideoRow } from '../db.js';
import { config } from '../config.js';
import { deleteVideoAssets, hasPlayableAsset } from '../minio.js';
import { videoQueue } from '../queue.js';
import { sanitizeFileName } from '../utils/files.js';

const router = express.Router();

const uploadSigner = new S3Client({
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey
  },
  endpoint: `http://${config.minioPublicEndpoint}:${config.minioPublicPort}`,
  forcePathStyle: true,
  region: 'us-east-1'
});

function buildPlaybackUrl(videoId) {
  return `${config.streamBaseUrl}/videos/${videoId}/hls/master.m3u8`;
}

function buildDashPlaybackUrl(videoId) {
  return `${config.streamBaseUrl}/videos/${videoId}/dash/manifest.mpd`;
}

function buildAv1PlaybackUrl(videoId) {
  return `${config.streamBaseUrl}/videos/${videoId}/av1/manifest.mpd`;
}

async function syncVideoAvailability(row) {
  if (row.status !== 'completed') {
    return row;
  }

  const hlsAvailable = await hasPlayableAsset(row.hls_object_key);
  const dashAvailable = row.dash_object_key
    ? await hasPlayableAsset(row.dash_object_key)
    : false;
  const av1Available = row.av1_object_key
    ? await hasPlayableAsset(row.av1_object_key)
    : false;

  if (hlsAvailable || dashAvailable || av1Available) {
    return row;
  }

  const updateResult = await pool.query(
    `
      UPDATE videos
      SET error_message = $1,
          status = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
    ['Processed assets are missing.', 'failed', row.id]
  );

  return updateResult.rows[0];
}

router.post('/upload-url', async (request, response, next) => {
  try {
    const fileName = request.body?.fileName;

    if (typeof fileName !== 'string' || fileName.trim() === '') {
      response.status(400).json({
        error: 'fileName is required'
      });

      return;
    }

    const objectKey = `raw/${uuidv4()}-${sanitizeFileName(fileName)}`;
    const uploadUrl = await getSignedUrl(
      uploadSigner,
      new PutObjectCommand({
        Bucket: config.minioRawBucket,
        Key: objectKey
      }),
      {
        expiresIn: 60 * 15
      }
    );

    response.json({
      bucket: config.minioRawBucket,
      objectKey,
      uploadUrl
    });
  } catch (error) {
    next(error);
  }
});

router.post('/complete', async (request, response, next) => {
  try {
    const title = request.body?.title;
    const rawObjectKey = request.body?.objectKey;

    if (typeof title !== 'string' || title.trim() === '') {
      response.status(400).json({
        error: 'title is required'
      });

      return;
    }

    if (typeof rawObjectKey !== 'string' || rawObjectKey.trim() === '') {
      response.status(400).json({
        error: 'objectKey is required'
      });

      return;
    }

    const id = uuidv4();
    const hlsObjectKey = `videos/${id}/hls/master.m3u8`;
    const dashObjectKey = config.enableDash ? `videos/${id}/dash/manifest.mpd` : null;
    const av1ObjectKey = config.enableAv1 ? `videos/${id}/av1/manifest.mpd` : null;
    const playbackUrl = buildPlaybackUrl(id);
    const dashPlaybackUrl = config.enableDash ? buildDashPlaybackUrl(id) : null;
    const av1PlaybackUrl = config.enableAv1 ? buildAv1PlaybackUrl(id) : null;

    const result = await pool.query(
      `
        INSERT INTO videos (
          id,
          title,
          raw_object_key,
          hls_object_key,
          dash_object_key,
          av1_object_key,
          playback_url,
          dash_playback_url,
          av1_playback_url,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        id,
        title.trim(),
        rawObjectKey,
        hlsObjectKey,
        dashObjectKey,
        av1ObjectKey,
        playbackUrl,
        dashPlaybackUrl,
        av1PlaybackUrl,
        'processing'
      ]
    );

      try {
        await videoQueue.add(
          'transcode-video',
          {
            enableAv1: config.enableAv1,
            enableDash: config.enableDash,
            hlsObjectKey,
            dashObjectKey,
            av1ObjectKey,
          dashPlaybackUrl,
          av1PlaybackUrl,
          playbackUrl,
          rawObjectKey,
          videoId: id
        },
        {
          jobId: id
        }
      );
    } catch (queueError) {
      await pool.query(
        `
          UPDATE videos
          SET error_message = $1,
              status = $2,
              updated_at = NOW()
          WHERE id = $3
        `,
        [queueError.message, 'failed', id]
      );

      throw queueError;
    }

    response.status(201).json(mapVideoRow(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

router.get('/', async (request, response, next) => {
  try {
    const result = await pool.query(
      `
        SELECT *
        FROM videos
        ORDER BY created_at DESC
      `
    );

    const videos = await Promise.all(
      result.rows.map(async (row) => {
        const syncedRow = await syncVideoAvailability(row);
        return mapVideoRow(syncedRow);
      })
    );

    response.json({
      items: videos
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;

    const result = await pool.query(
      `
        SELECT *
        FROM videos
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      response.status(404).json({
        error: 'video not found'
      });

      return;
    }

    const syncedRow = await syncVideoAvailability(result.rows[0]);

    response.json(mapVideoRow(syncedRow));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const { id } = request.params;

    const result = await pool.query(
      `
        SELECT *
        FROM videos
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      response.status(404).json({
        error: 'video not found'
      });

      return;
    }

    await deleteVideoAssets(result.rows[0]);

    await pool.query(
      `
        DELETE FROM videos
        WHERE id = $1
      `,
      [id]
    );

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
