import cors from 'cors';
import express from 'express';

import { config } from './config.js';
import pool, { initializeDatabase } from './db.js';
import { ensureStorage } from './minio.js';
import videosRouter from './routes/videos.js';

const app = express();

function createCorsOptions() {
  const allowedOrigins = new Set([
    config.appOrigin,
    'http://127.0.0.1:3000'
  ]);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'));
    }
  };
}

app.use(cors(createCorsOptions()));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({
      ok: true
    });
  } catch (error) {
    response.status(500).json({
      error: 'unhealthy',
      message: error.message
    });
  }
});

app.use('/api/videos', videosRouter);

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  response.status(500).json({
    error: 'internal_server_error',
    message: error.message
  });
});

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

  app.listen(config.port, () => {
    console.log(`backend running on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error('backend failed to start');
  console.error(error);
  process.exit(1);
});
