# StreamForge

StreamForge is a local-first video streaming platform with direct-to-object-storage upload, background transcoding, and adaptive playback.

It is built as a production-shaped reference stack for:

- upload
- transcode
- package
- deliver
- observe

## What It Demonstrates

- Direct browser upload to presigned object storage URLs
- Metadata-backed video lifecycle in PostgreSQL
- Background transcoding with FFmpeg in a separate worker
- HLS, DASH, and AV1 delivery paths
- A cinematic React watch experience with manual bitrate and playback-mode switching
- Nginx-based stream delivery in front of MinIO

## Product Snapshot

- Viewer: watch streams and switch quality or playback mode
- Creator: upload video and track processing
- Admin: monitor ingestion, delivery, and cleanup

Key stats:

- uploads
- ready videos
- transcode success rate
- queue depth
- storage usage
- playback availability

## Core Roles

### Viewer

- Watch video
- Switch playback mode
- Change quality

### Creator

- Upload raw video from the browser
- Get a presigned upload URL
- Track job status
- Delete uploaded assets

### Admin

- Check processing status
- Review asset state
- Verify delivery and cleanup

## Metrics That Matter

- Uploads today
- Ready videos
- Average transcode time
- Success rate
- Queue backlog
- Storage growth

## Architecture

### 1. Full System Topology

```mermaid
flowchart LR
  U[Viewer / Creator / Admin] --> F[Frontend<br/>React + Vite]
  F -->|API requests| B[Backend API<br/>Express]
  F -->|browser upload| M[(MinIO)]
  B -->|video metadata| P[(PostgreSQL)]
  B -->|transcode job| R[(Redis / BullMQ)]
  R --> W[Worker<br/>FFmpeg + BullMQ]
  W -->|read raw asset| M
  W -->|write HLS / DASH / AV1| M
  N[Nginx stream proxy] -->|public playback| M
  F -->|watch page playback| N
```

The architecture is split into four clear layers:

- frontend as the control surface
- backend as the API and metadata layer
- worker as the transcoding layer
- MinIO plus Nginx as the storage and delivery layer

### 2. Upload, Queue, and Transcode Pipeline

```mermaid
sequenceDiagram
  autonumber
  participant U as Creator
  participant F as Frontend
  participant B as Backend API
  participant M as MinIO
  participant Q as Redis Queue
  participant W as Worker
  participant P as PostgreSQL

  U->>F: Select file and submit
  F->>B: POST /api/videos/upload-url
  B->>B: Validate file name and build raw object key
  B->>F: Presigned PUT URL + object key
  F->>M: PUT raw video directly
  F->>B: POST /api/videos/complete
  B->>P: Insert video row
  B->>Q: Enqueue transcode job
  Q->>W: Deliver job
  W->>M: Read raw video
  W->>W: Encode HLS ladder
  W->>W: Encode DASH ladder
  W->>W: Attempt AV1 ladder
  W->>M: Upload packaged outputs
  W->>P: Mark video completed or failed
  F->>B: Poll status
  F->>U: Show ready playback page
```

This keeps the API out of the media hot path and makes processing failures isolated from uploads.

### 3. Playback Delivery and Player Flow

```mermaid
flowchart TB
  V[Watch Page] --> P[Player Shell]
  P --> M1[Playback Mode Selector]
  P --> Q1[Quality Selector]

  M1 --> H[HLS]
  M1 --> D[DASH]
  M1 --> A[AV1]

  H --> HS[hls.js]
  D --> DS[dash.js]
  A --> DS

  HS --> N[Nginx /streams]
  DS --> N
  N --> M[(MinIO processed bucket)]

  HS --> L1[HLS levels]
  DS --> L2[DASH representations]
  L1 --> Q1
  L2 --> Q1
```

- HLS uses `hls.js`
- DASH and AV1 use `dash.js`
- The UI exposes mode and quality controls
- Nginx serves manifests and segments from object storage

### 4. Data Model

```mermaid
erDiagram
  VIDEOS {
    uuid id PK
    text title
    text raw_object_key
    text hls_object_key
    text dash_object_key
    text av1_object_key
    text playback_url
    text dash_playback_url
    text av1_playback_url
    text status
    text error_message
    timestamptz created_at
    timestamptz updated_at
  }

  VIDEOS ||--|| "upload flow" : creates
  VIDEOS ||--|| "worker flow" : updates
  VIDEOS ||--|| "watch page" : powers
```

The data model is deliberately small:

- video metadata lives in PostgreSQL
- object keys point to raw and processed media
- playback URLs are stored alongside the video record
- status fields drive UI state and admin visibility

## Design Goals

- Keep the codebase modular
- Separate API, worker, and delivery
- Show production-shaped streaming clearly
- Support local development

## Tech Stack

- Frontend: React, Vite, `hls.js`, `dash.js`, `lucide-react`
- Backend: Node.js, Express, PostgreSQL, Redis, MinIO, AWS SDK presigner
- Worker: BullMQ, FFmpeg, PostgreSQL, Redis, MinIO
- Delivery: Nginx
- Orchestration: Docker Compose

## Configuration

Create a local `.env` from the example file:

```bash
cp .env.example backend/.env
```

### Example Environment

```env
PORT=3001
APP_ORIGIN=http://localhost:3000
STREAM_BASE_URL=http://localhost/streams

POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/streamforge
REDIS_HOST=redis
REDIS_PORT=6379

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_PUBLIC_ENDPOINT=localhost
MINIO_PUBLIC_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_RAW_BUCKET=raw-videos
MINIO_PROCESSED_BUCKET=processed-videos

WORKER_CONCURRENCY=1
ENABLE_DASH=true
ENABLE_AV1=true
H264_PRESET=veryfast
SEGMENT_DURATION_MS=1000
AV1_CPU_USED=6
AV1_CRF=32
```

### Tuning Knobs

- `WORKER_CONCURRENCY`: parallel jobs per worker
- `ENABLE_DASH`: turn DASH packaging on or off
- `ENABLE_AV1`: turn AV1 packaging on or off
- `H264_PRESET`: trade off speed vs encode efficiency
- `SEGMENT_DURATION_MS`: smaller values improve quality-switch responsiveness
- `AV1_CPU_USED`: AV1 speed/quality balance
- `AV1_CRF`: AV1 quality/size balance

## Repository Layout

```text
streamforge/
  backend/
    src/
      config.js
      db.js
      minio.js
      queue.js
      routes/
      utils/
  frontend/
    src/
      components/
      pages/
      lib/
  worker/
  nginx/
  docker-compose.yml
  README.md
  plan.md
```

## Core Flow

### Upload

1. The user selects a video in the frontend.
2. The backend returns a presigned MinIO upload URL.
3. The browser uploads the file directly to MinIO.
4. The frontend confirms the upload with the backend.

### Processing

1. The backend inserts a video row in PostgreSQL.
2. The backend enqueues a transcode job in Redis.
3. The worker downloads the raw file from MinIO.
4. The worker produces adaptive streaming outputs.
5. The worker writes processed assets back to MinIO.
6. The worker updates the video row with the final playback URLs.

### Playback

1. The watch page polls the backend for video status.
2. Once processing is complete, the player loads the stream URL.
3. The viewer can switch between playback modes.
4. The viewer can manually select bitrate levels for supported modes.

## API Surface

### `POST /api/videos/upload-url`

Returns a presigned PUT URL for raw upload.

### `POST /api/videos/complete`

Creates the video record and enqueues transcoding.

### `GET /api/videos`

Returns the video library.

### `GET /api/videos/:id`

Returns one video with playback metadata.

### `DELETE /api/videos/:id`

Deletes the database row and removes associated storage objects.

## Local Run

```bash
docker compose up --build
```

### Services

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Nginx stream proxy: http://localhost/streams/
- MinIO API: http://localhost:9000
- MinIO Console: http://localhost:9001
- PostgreSQL: localhost:5433

## Environment Notes

- Postgres is exposed on host port `5433` to avoid conflicts with a local Postgres instance on `5432`.
- MinIO is configured for local upload and public stream delivery.
- The frontend talks to the backend via `http://localhost:3001`.
- Worker scaling is controlled by `WORKER_CONCURRENCY` and Docker Compose replica count.

## What Is Implemented

- Upload URL generation
- Raw upload to MinIO
- Transcode queueing
- HLS packaging
- DASH packaging
- AV1 packaging attempt
- Playback mode switching in the watch UI
- Manual quality selection in the player
- Delete flow for videos and storage assets

## Current Practical Notes

- HLS and DASH are the primary reliable playback paths.
- AV1 is included in the pipeline and UI, but its success depends on the FFmpeg codec support inside the worker container.
- Existing videos processed before a pipeline change may need to be re-uploaded to reflect the latest ladder and manifest structure.

## Why This Architecture

This design follows the pattern used by real streaming systems:

- Store media in object storage, not app-server disk
- Use a background worker for CPU-heavy transcoding
- Keep playback delivery separate from the API
- Expose manifests and segments through a simple edge layer
- Make the UI explicitly show playback modes and bitrate choices

That separation makes the project easier to scale and review.

## GitHub Summary

Use this as the repository description:

> Local-first video streaming platform with presigned uploads, FFmpeg worker transcoding, HLS/DASH playback, MinIO delivery, and modular React watch UI.

## Engineering Highlights

- Clear service boundaries
- Production-shaped media pipeline
- Modular player components
- Storage-aware deletion
- Docker-based local environment

## Next Extensions

- Multi-CDN delivery
- Thumbnail extraction
- Subtitle tracks
- Signed playback authorization
- DRM integration
- Multi-audio support
- Metrics and observability

## License

This project is provided as a prototype/reference implementation.
