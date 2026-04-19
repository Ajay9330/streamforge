# StreamForge Plan

## 1. Goal

Build a distributed video streaming platform that supports:
- large video uploads
- presigned upload URLs
- asynchronous transcoding
- HLS playback
- metadata management
- containerized local development

The first milestone is a working end-to-end prototype:
1. Upload a video from the browser.
2. Store the raw file.
3. Queue a transcode job.
4. Generate HLS output with FFmpeg.
5. Play the processed stream in the browser.

## 2. Architecture Overview

### Local Development

For development, use:
- React frontend
- Node.js/Express backend
- Redis + BullMQ queue
- FFmpeg worker
- PostgreSQL metadata DB
- MinIO as local S3-compatible storage
- Nginx as reverse proxy and static delivery layer

This setup is not a CDN. It is a local origin + proxy arrangement that simulates production flow.

### Production

For production, the standard model is:
- object storage such as S3 or S3-compatible storage
- background workers for transcoding
- CDN in front of the final HLS assets
- API service for metadata, auth, and presigned URLs

In production:
- storage holds the files
- CDN accelerates delivery
- API does not serve large media directly

## 3. System Flow

### Upload and Processing

```text
Frontend
  -> Backend requests presigned upload URL
  -> Browser uploads raw video to storage
  -> Backend stores video metadata
  -> Backend enqueues a transcode job
  -> Worker downloads raw video
  -> Worker generates HLS output with FFmpeg
  -> Worker uploads processed files
  -> Frontend plays HLS stream
```

### Responsibilities

- Frontend: upload form, video list, watch page
- Backend: presigned URLs, metadata, job enqueueing, status updates
- Worker: download, transcode, upload outputs, update final state
- Storage: raw uploads and processed HLS assets
- Nginx/CDN: delivery of playback assets

## 4. Tech Stack

### Frontend

- React
- Vite
- React Router
- Axios
- hls.js

### Backend

- Node.js
- Express
- BullMQ
- ioredis
- pg
- MinIO SDK
- dotenv
- UUID

### Infrastructure

- Docker Compose
- PostgreSQL
- Redis
- MinIO
- Nginx
- FFmpeg

## 5. Repository Structure

```text
streamforge/
|-- docker-compose.yml
|-- frontend/
|   |-- Dockerfile
|   |-- package.json
|   `-- src/
|       |-- main.jsx
|       |-- App.jsx
|       |-- lib/
|       |   `-- api.js
|       |-- components/
|       |   |-- Navbar.jsx
|       |   |-- VideoCard.jsx
|       |   `-- Player.jsx
|       `-- pages/
|           |-- Home.jsx
|           |-- Upload.jsx
|           `-- Watch.jsx
|-- backend/
|   |-- Dockerfile
|   |-- package.json
|   |-- .env
|   `-- src/
|       |-- server.js
|       |-- db.js
|       |-- queue.js
|       |-- minio.js
|       |-- utils/
|       |   `-- presigned.js
|       `-- routes/
|           `-- videos.js
|-- worker/
|   |-- Dockerfile
|   |-- package.json
|   `-- worker.js
|-- nginx/
|   `-- nginx.conf
`-- uploads/
```

## 6. Data Model

### `videos`

Suggested fields:
- `id`
- `title`
- `raw_object_key`
- `hls_object_key`
- `status`
- `created_at`
- `updated_at`

### Status Values

- `uploaded`
- `processing`
- `completed`
- `failed`

## 7. API Plan

### Endpoints

- `POST /api/videos/upload-url`
- `POST /api/videos/complete`
- `GET /api/videos`
- `GET /api/videos/:id`
- `GET /health`

### API Responsibilities

- generate presigned upload URLs
- create video records
- queue transcode jobs
- expose metadata for listing and playback
- update processing status

## 8. Worker Plan

### Job Flow

1. Receive a BullMQ job.
2. Download the raw video from storage.
3. Save it to a temporary local path.
4. Run FFmpeg to generate HLS output.
5. Upload playlists and segments.
6. Update the database record.

### Output

- HLS manifest
- HLS segments
- final video status in PostgreSQL

## 9. Frontend Plan

### Pages

- Home: list videos
- Upload: submit a new video
- Watch: play a processed stream

### Behavior

- request a presigned upload URL
- upload directly to storage
- submit completion metadata
- load HLS playback with `hls.js`

## 10. Docker Compose Plan

### Services

- `frontend`
- `backend`
- `worker`
- `postgres`
- `redis`
- `minio`
- `nginx`

### Ports

- Frontend: `3000`
- Backend: `3001`
- PostgreSQL: `5432`
- Redis: `6379`
- MinIO API: `9000`
- MinIO Console: `9001`
- Nginx: `80`

## 11. Implementation Phases

### Phase 1: Project Setup

- create the repo structure
- configure Docker Compose
- set up PostgreSQL, Redis, and MinIO
- wire environment variables
- add backend health checks

### Phase 2: Upload Pipeline

- implement presigned upload URL generation
- implement upload completion endpoint
- store video metadata in PostgreSQL
- enqueue transcode jobs

### Phase 3: Worker Pipeline

- implement download from storage
- generate HLS with FFmpeg
- upload processed assets
- update job and video status

### Phase 4: Frontend Playback

- build upload page
- build video list page
- build watch page
- integrate `hls.js`

### Phase 5: Hardening

- add validation
- add retries and failure handling
- improve logging
- add monitoring
- add auth if needed

## 12. Delivery Model

### What MinIO + Nginx Means

- MinIO is local object storage, not a CDN
- Nginx is a reverse proxy and can also cache content
- together they provide a good local development delivery path

### Production Delivery

- use object storage as the origin
- put a CDN in front of playback assets
- optionally use multi-CDN later for redundancy and global performance

## 13. Open Questions

- Should raw uploads and HLS output use the same bucket?
- Should playback URLs be public or signed?
- Should uploads support multipart from day one?
- How should failed jobs be retried?
- Do we need authentication before exposing uploads?

## 14. Future Improvements

- multipart uploads
- multi-bitrate HLS
- CDN delivery
- signed playback URLs
- authentication and authorization
- resume playback
- watch history
- multiple workers
- monitoring and alerting

## 15. Part 1 Definition of Done

Part 1 is complete when the system can:
- accept a video upload
- store the raw file
- queue a transcode job
- generate HLS output
- play the video in the browser

## 16. Build Checklist

### Step 1: Project Setup

- create the repo folders for `frontend`, `backend`, `worker`, `nginx`, and `uploads`
- add the root `docker-compose.yml`
- add base Dockerfiles for frontend, backend, and worker
- create backend `.env` values for PostgreSQL, Redis, and MinIO
- verify all containers start cleanly

### Step 2: Database and Queue

- create the `videos` table
- add the DB connection helper
- add the Redis connection helper
- add the BullMQ queue setup
- confirm the backend can connect to PostgreSQL and Redis

### Step 3: Storage and Upload URL Flow

- configure MinIO bucket creation
- implement presigned upload URL generation
- return both the upload URL and object key to the frontend
- confirm the browser can upload a file directly to MinIO

### Step 4: Upload Completion API

- create the upload completion endpoint
- store video metadata in PostgreSQL
- mark the status as `processing`
- enqueue the transcode job

### Step 5: Worker Transcoding Flow

- build the worker process
- download the raw file from storage
- write it to a temporary local path
- run FFmpeg to generate HLS assets
- upload the playlist and segments
- update the database record to `completed`

### Step 6: Frontend Upload Experience

- build the upload page
- add title and file inputs
- call the presigned upload endpoint
- upload the file with `fetch`
- call the completion endpoint after upload succeeds

### Step 7: Frontend Playback Experience

- build the watch page
- fetch the HLS playlist URL
- integrate `hls.js`
- verify playback works in the browser

### Step 8: Basic Listing and Navigation

- add a home page for available videos
- fetch video records from the backend
- add navigation between upload and watch pages

### Step 9: Hardening

- add validation for file type and size
- handle failed uploads and failed jobs
- add retry behavior in the worker
- add logging for upload and transcode steps
- add a clearer failed state in the UI

### Step 10: Production Readiness Decisions

- decide whether playback URLs should be public or signed
- decide whether raw and processed assets belong in separate buckets
- decide whether multipart upload is required
- decide whether auth is needed before allowing uploads

## 17. Recommended Execution Order

1. Create the database schema and queue wiring.
2. Implement presigned uploads.
3. Implement upload completion and job enqueueing.
4. Implement the worker transcode pipeline.
5. Build the upload page.
6. Build the watch page.
7. Add listing, error handling, and hardening.
8. Revisit production storage and CDN decisions.
