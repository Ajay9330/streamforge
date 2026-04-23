import pg from 'pg';

import { config } from './config.js';

const pool = new pg.Pool({
  connectionString: config.postgresUrl
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      raw_object_key TEXT NOT NULL,
      hls_object_key TEXT NOT NULL,
      dash_object_key TEXT,
      av1_object_key TEXT,
      playback_url TEXT NOT NULL,
      dash_playback_url TEXT,
      av1_playback_url TEXT,
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
    ADD COLUMN IF NOT EXISTS av1_object_key TEXT,
    ADD COLUMN IF NOT EXISTS dash_playback_url TEXT,
    ADD COLUMN IF NOT EXISTS av1_playback_url TEXT,
    ADD COLUMN IF NOT EXISTS duration INTEGER,
    ADD COLUMN IF NOT EXISTS transcode_duration INTEGER;
  `);
}

export function mapVideoRow(row) {
  return {
    createdAt: row.created_at,
    duration: row.duration,
    transcodeDuration: row.transcode_duration,
    errorMessage: row.error_message,
    dashObjectKey: row.dash_object_key,
    dashPlaybackUrl: row.dash_playback_url,
    av1ObjectKey: row.av1_object_key,
    av1PlaybackUrl: row.av1_playback_url,
    hlsObjectKey: row.hls_object_key,
    id: row.id,
    playbackUrl: row.playback_url,
    rawObjectKey: row.raw_object_key,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at
  };
}

export default pool;
