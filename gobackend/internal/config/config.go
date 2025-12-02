package config

import (
	"os"

	"github.com/joho/godotenv"
)

// MinioConfig holds configuration for connecting to MinIO / S3.
type MinioConfig struct {
	Endpoint      string
	AccessKey     string
	SecretKey     string
	Bucket        string
	UseSSL        bool
	Region        string
	ImgproxyURL   string
	StoragePrefix string
}

// LoadEnv loads variables from a .env file if present (no-op on failure).
func LoadEnv() {
	_ = godotenv.Load()
}

// GetEnv returns the value of an environment variable or a fallback.
func GetEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// GetMinioConfig reads MinIO/S3 config from env vars with sensible defaults.
// Uses MINIO_ROOT_USER and MINIO_ROOT_PASSWORD (with fallback to MINIO_ACCESS_KEY/MINIO_SECRET_KEY for backward compatibility).
func GetMinioConfig() MinioConfig {
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	// Prefer MINIO_ROOT_USER/MINIO_ROOT_PASSWORD, fallback to MINIO_ACCESS_KEY/MINIO_SECRET_KEY for backward compatibility
	accessKey := GetEnv("MINIO_ROOT_USER", "")
	if accessKey == "" {
		accessKey = GetEnv("MINIO_ACCESS_KEY", "minioadmin")
	}

	secretKey := GetEnv("MINIO_ROOT_PASSWORD", "")
	if secretKey == "" {
		secretKey = GetEnv("MINIO_SECRET_KEY", "changeme-minio-secret")
	}

	return MinioConfig{
		Endpoint:      GetEnv("MINIO_ENDPOINT", "minio:9000"),
		AccessKey:     accessKey,
		SecretKey:     secretKey,
		Bucket:        GetEnv("MINIO_BUCKET", "openupload"),
		UseSSL:        useSSL,
		Region:        GetEnv("MINIO_REGION", "us-east-1"),
		ImgproxyURL:   GetEnv("IMGPROXY_URL", "http://imgproxy:8080"),
		StoragePrefix: GetEnv("STORAGE_PREFIX", "uploads"),
	}
}
