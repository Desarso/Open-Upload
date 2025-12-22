.PHONY: run build test up dev services

build:
	@echo "Building Go backend binary..."
	@go build -o open_upload_gobackend ./cmd/server

test:
	@echo "Running go test ./..."
	@go test ./...

# Dev stack via Docker (Go app + MinIO + imgproxy), with port mapping ONLY here.
run:
	@echo "Ensuring docker network 'coolify' exists..."
	@docker network inspect coolify >/dev/null 2>&1 || docker network create coolify
	@echo "Ensuring persistent storage directories exist..."
	@mkdir -p $$(pwd)/db $$(pwd)/minio-data
	@echo "Building app image via docker compose..."
	@docker compose build app
	@echo "Starting MinIO + imgproxy in background..."
	@MINIO_HOST_PATH=$${MINIO_HOST_PATH:-$$(pwd)/minio-data} docker compose up -d minio imgproxy
	@echo "Running Go backend container on port ${PORT:-8080} (host) -> 8080 (container)..."
	@docker run --rm --name openupload-go-backend \
		--network=coolify \
		-v $$(pwd)/firebase:/app/firebase:ro \
		-v $$(pwd)/db:/app/db \
		-p $${PORT:-8080}:8080 \
		--env-file .env \
		gobackend-app

# Start only the Docker services (MinIO + imgproxy) for local dev.
# Use this together with `make dev`, which runs the Go binary directly.
services:
	@echo "Ensuring docker network 'coolify' exists..."
	@docker network inspect coolify >/dev/null 2>&1 || docker network create coolify
	@echo "Ensuring persistent storage directories exist..."
	@mkdir -p $$(pwd)/minio-data
	@echo "Starting MinIO + imgproxy via docker compose (dev config with port mappings)..."
	@MINIO_HOST_PATH=$${MINIO_HOST_PATH:-$$(pwd)/minio-data} docker compose -f docker-compose.dev.yaml up -d minio imgproxy


# Optional: run just the Go binary directly (no Docker app container)
# This assumes MinIO and imgproxy are running in Docker containers
# and accessible via localhost with port mappings (see `make services`).
dev:
	@echo "Running Go backend with Air (using environment from .env if present)..."
	@echo "Note: Ensure MinIO (localhost:9000) and imgproxy (localhost:8081) containers are running"
	@echo "Start them with: make services"
	@MINIO_ENDPOINT=localhost:9000 \
	 IMGPROXY_URL=http://localhost:8081 \
	 DATABASE_URL=$${DATABASE_URL:-sqlite:///./db/database.db} \
	 air





