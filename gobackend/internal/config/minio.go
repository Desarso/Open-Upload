package config

import (
	"context"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// NewMinioClient creates a MinIO client from MinioConfig.
func NewMinioClient(cfg MinioConfig) (*minio.Client, error) {
	return minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
}

// EnsureMinioBucket ensures the configured bucket exists, creating it if needed.
func EnsureMinioBucket(ctx context.Context, client *minio.Client, cfg MinioConfig) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return err
	}
	if !exists {
		return client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{})
	}
	return nil
}
