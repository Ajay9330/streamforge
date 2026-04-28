import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { config } from './config.js';

export const redisConnection = new IORedis({
  host: config.redisHost,
  maxRetriesPerRequest: null,
  port: config.redisPort
});

export const videoQueue = new Queue('video-processing', {
  connection: redisConnection
});
