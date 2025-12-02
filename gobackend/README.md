## Go Fiber backend with MinIO (S3) and imgproxy

This directory contains a Go backend rewritten using [`Fiber`](https://github.com/gofiber/fiber) that stores files in MinIO (S3-compatible) and exposes URLs that can be consumed by `imgproxy`.

### Services

- **Go app** (`app` service in `docker-compose.yaml`): Fiber HTTP API.
- **MinIO** (`minio`): S3-compatible object storage.
- **imgproxy** (`imgproxy`): Image processing proxy reading directly from S3/MinIO.

### Key endpoints (Go backend)

- **GET** `/health` — simple health check.
- **POST** `/api/v1/files/upload`
  - `multipart/form-data` with `file` field.
  - Stores the object in the `MINIO_BUCKET` under `STORAGE_PREFIX/yyyy/mm/dd/filename`.
  - Returns JSON with:
    - `key` (S3 object key),
    - `bucket`,
    - `size`,
    - `content_type`,
    - `imgproxy_url` (ready-to-use insecure imgproxy URL).
- **GET** `/api/v1/files/list?prefix=...`
  - Lists objects in the bucket (defaults to `STORAGE_PREFIX`).
- **DELETE** `/api/v1/files/:key`
  - Deletes an object by key.
- **GET** `/files/:key`
  - Redirects to a short-lived presigned MinIO URL for direct download.

### Environment variables (app)

Configured in `docker-compose.yaml` and read by `main.go`:

- `PORT` — HTTP port for the Go app (default `8080`).
- `MINIO_ENDPOINT` — e.g. `minio:9000`.
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`.
- `MINIO_BUCKET` — bucket name (default `uploads`, created automatically).
- `MINIO_REGION` — logical region for MinIO (e.g. `us-east-1`).
- `MINIO_USE_SSL` — `"true"` or `"false"`.
- `IMGPROXY_URL` — base URL for imgproxy (e.g. `http://imgproxy:8080`).
- `STORAGE_PREFIX` — logical prefix inside the bucket for uploads (default `uploads`).

### Running with Docker Compose

From the `gobackend` directory:

```bash
docker compose up --build
```

This will start:

- MinIO on the `coolify` network,
- imgproxy configured to use S3/MinIO,
- the Go Fiber backend exposing the API on port `8080` (internal to the `coolify` network, or via your Traefik/host configuration).


