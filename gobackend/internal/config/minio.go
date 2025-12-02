package config

import (
	"context"
	"log"
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

// BucketStats holds statistics about a MinIO bucket.
type BucketStats struct {
	TotalSize   int64 `json:"total_size"`   // Total size in bytes
	ObjectCount int64 `json:"object_count"` // Number of objects
}

// GetBucketStats calculates statistics for a MinIO bucket by iterating through objects.
// This provides accurate storage usage information directly from MinIO.
func GetBucketStats(ctx context.Context, client *minio.Client, bucket string) (BucketStats, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	stats := BucketStats{
		TotalSize:   0,
		ObjectCount: 0,
	}

	// List all objects in the bucket
	objectCh := client.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Recursive: true,
	})

	for obj := range objectCh {
		if obj.Err != nil {
			log.Printf("Error listing object: %v", obj.Err)
			continue
		}
		stats.TotalSize += obj.Size
		stats.ObjectCount++
	}

	return stats, nil
}
