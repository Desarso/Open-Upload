package routes

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"

	"github.com/gabriel/open_upload_gobackend/internal/auth"
	"github.com/gabriel/open_upload_gobackend/internal/config"
	"github.com/gabriel/open_upload_gobackend/internal/db"
)

type uploadResponse struct {
	Key         string `json:"key"`
	Bucket      string `json:"bucket"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
	ImgproxyURL string `json:"imgproxy_url"`
}

type fileInfo struct {
	Key          string    `json:"key"`
	Size         int64     `json:"size"`
	ETag         string    `json:"etag"`
	LastModified time.Time `json:"last_modified"`
	ImgproxyURL  string    `json:"imgproxy_url"`
}

// RegisterFileRoutes registers file-related routes on the given router.
// It wires handlers to MinIO using the provided client and config.
func RegisterFileRoutes(router fiber.Router, client *minio.Client, cfg config.MinioConfig) {
	// GET /transform-url - generate a signed imgproxy URL with validated params
	router.Get("/transform-url", func(c fiber.Ctx) error {
		apiCtx, err := auth.GetAPIKeyContext(c)
		if err != nil {
			return err
		}
		start := time.Now()

		key := c.Query("key")
		if key == "" {
			trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
			return fiber.NewError(fiber.StatusBadRequest, "key is required")
		}
		if len(key) > 2048 {
			trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
			return fiber.NewError(fiber.StatusBadRequest, "key is too long")
		}

		mode := c.Query("mode", "fit")
		if !isAllowedMode(mode) {
			mode = "fit"
		}

		// Optional preset sizes so clients don't need arbitrary dimensions.
		// Presets are fixed-height, width=0 (imgproxy preserves aspect ratio):
		// - thumbnail: small preview
		// - medium: card-sized
		// - preview: larger detail view
		// - full: large but bounded
		preset := c.Query("preset", "")

		var width, height int
		if preset != "" {
			var ok bool
			width, height, ok = getPresetDimensions(preset)
			if !ok {
				trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
				return fiber.NewError(fiber.StatusBadRequest, "invalid preset")
			}
		} else {
			width, err = strconv.Atoi(c.Query("w", "1200"))
			if err != nil || width <= 0 {
				trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
				return fiber.NewError(fiber.StatusBadRequest, "invalid width")
			}
			height, err = strconv.Atoi(c.Query("h", "1200"))
			if err != nil || height <= 0 {
				trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
				return fiber.NewError(fiber.StatusBadRequest, "invalid height")
			}
		}

		const maxDim = 4000
		if width > maxDim || height > maxDim {
			trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusBadRequest, start, apiCtx)
			return fiber.NewError(fiber.StatusBadRequest, "dimensions too large")
		}

		format := c.Query("format", "webp")
		if !isAllowedFormat(format) {
			format = "webp"
		}

		transformURL := buildImgproxyURLWithOptions(cfg, key, mode, width, height, format)

		trackAPIUsage(context.Background(), "/api/v1/files/transform-url", http.StatusOK, start, apiCtx)

		return c.JSON(fiber.Map{
			"url":    transformURL,
			"mode":   mode,
			"width":  width,
			"height": height,
			"format": format,
			"preset": preset,
		})
	})

	// POST /upload
	router.Post("/upload", func(c fiber.Ctx) error {
		apiCtx, err := auth.GetAPIKeyContext(c)
		if err != nil {
			return err
		}
		start := time.Now()

		fileHeader, err := c.FormFile("file")
		if err != nil {
			trackAPIUsage(context.Background(), "/api/v1/files/upload", http.StatusBadRequest, start, apiCtx)
			return fiber.NewError(fiber.StatusBadRequest, "file is required")
		}

		src, err := fileHeader.Open()
		if err != nil {
			trackAPIUsage(context.Background(), "/api/v1/files/upload", http.StatusInternalServerError, start, apiCtx)
			return fiber.NewError(fiber.StatusInternalServerError, "failed to open uploaded file")
		}
		defer src.Close()

		// Construct object key: prefix/yyyy/mm/dd/filename
		now := time.Now().UTC()
		datePath := filepath.Join(
			now.Format("2006"),
			now.Format("01"),
			now.Format("02"),
		)
		key := filepath.ToSlash(filepath.Join(cfg.StoragePrefix, datePath, fileHeader.Filename))

		opts := minio.PutObjectOptions{
			ContentType: fileHeader.Header.Get("Content-Type"),
		}

		info, err := client.PutObject(
			context.Background(),
			cfg.Bucket,
			key,
			src,
			fileHeader.Size,
			opts,
		)
		if err != nil {
			log.Printf("upload error: %v", err)
			trackAPIUsage(context.Background(), "/api/v1/files/upload", http.StatusInternalServerError, start, apiCtx)
			return fiber.NewError(fiber.StatusInternalServerError, "failed to upload file")
		}

		imgproxyURL := buildImgproxyURL(cfg, key)

		trackAPIUsage(context.Background(), "/api/v1/files/upload", http.StatusCreated, start, apiCtx)

		return c.Status(fiber.StatusCreated).JSON(uploadResponse{
			Key:         info.Key,
			Bucket:      info.Bucket,
			Size:        info.Size,
			ContentType: opts.ContentType,
			ImgproxyURL: imgproxyURL,
		})
	})

	// GET /list
	router.Get("/list", func(c fiber.Ctx) error {
		apiCtx, err := auth.GetAPIKeyContext(c)
		if err != nil {
			return err
		}
		start := time.Now()

		// Simple list-by-prefix API, not paginated for now
		prefix := c.Query("prefix", cfg.StoragePrefix)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		objectCh := client.ListObjects(ctx, cfg.Bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		})

		// Initialize as empty slice (not nil) to ensure JSON returns []
		files := make([]fileInfo, 0)
		for obj := range objectCh {
			if obj.Err != nil {
				log.Printf("list error: %v", obj.Err)
				continue
			}
			files = append(files, fileInfo{
				Key:          obj.Key,
				Size:         obj.Size,
				ETag:         obj.ETag,
				LastModified: obj.LastModified,
				ImgproxyURL:  buildImgproxyURL(cfg, obj.Key),
			})
		}

		trackAPIUsage(context.Background(), "/api/v1/files/list", http.StatusOK, start, apiCtx)

		return c.JSON(files)
	})

	// DELETE /:key
	router.Delete("/:key", func(c fiber.Ctx) error {
		apiCtx, err := auth.GetAPIKeyContext(c)
		if err != nil {
			return err
		}
		start := time.Now()

		key := c.Params("key")
		if key == "" {
			trackAPIUsage(context.Background(), "/api/v1/files/"+key, http.StatusBadRequest, start, apiCtx)
			return fiber.NewError(fiber.StatusBadRequest, "key is required")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		err = client.RemoveObject(ctx, cfg.Bucket, key, minio.RemoveObjectOptions{})
		if err != nil {
			log.Printf("delete error: %v", err)
			trackAPIUsage(context.Background(), "/api/v1/files/"+key, http.StatusInternalServerError, start, apiCtx)
			return fiber.NewError(fiber.StatusInternalServerError, "failed to delete object")
		}

		trackAPIUsage(context.Background(), "/api/v1/files/"+key, http.StatusNoContent, start, apiCtx)

		return c.SendStatus(fiber.StatusNoContent)
	})

	// GET /:key (public presigned redirect)
	router.Get("/:key", func(c fiber.Ctx) error {
		key := c.Params("key")
		if key == "" {
			return fiber.NewError(fiber.StatusBadRequest, "key is required")
		}

		// Generate a short-lived presigned URL from MinIO
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		reqParams := url.Values{}
		u, err := client.PresignedGetObject(ctx, cfg.Bucket, key, 15*time.Minute, reqParams)
		if err != nil {
			log.Printf("presign error: %v", err)
			return fiber.NewError(fiber.StatusInternalServerError, "failed to generate download URL")
		}

		return c.Redirect().Status(fiber.StatusTemporaryRedirect).To(u.String())
	})
}

// RegisterFrontendFileRoutes registers /frontend/files routes that mirror the Python
// frontend file routes and use Firebase auth + DB records.
func RegisterFrontendFileRoutes(router fiber.Router, client *minio.Client, cfg config.MinioConfig) {
	router.Use(auth.FirebaseAuthMiddleware())
	router.Use(auth.RequireRoles("whitelisted"))

	const storageLimit = 50 * 1024 * 1024 * 1024 // 50GB

	// POST /frontend/files/upload
	router.Post("/upload", func(c fiber.Ctx) error {
		user, err := auth.GetCurrentFirebaseUser(c)
		if err != nil {
			return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
		}

		projectID, err := strconv.ParseInt(c.FormValue("project_id"), 10, 64)
		if err != nil || projectID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid project_id")
		}

		fileHeader, err := c.FormFile("file")
		if err != nil {
			return fiber.NewError(http.StatusBadRequest, "file is required")
		}

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Verify project belongs to user
		var ownerUID string
		if err := conn.QueryRowContext(ctx, `
			SELECT user_firebase_uid
			FROM project
			WHERE id = ?
		`, projectID).Scan(&ownerUID); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusForbidden, "Not authorized to upload to this project")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load project")
		}
		if ownerUID != user.UID {
			return fiber.NewError(http.StatusForbidden, "Not authorized to upload to this project")
		}

		// Check storage usage
		var totalStorage int64
		if err := conn.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(size), 0)
			FROM file
			WHERE user_firebase_uid = ?
		`, user.UID).Scan(&totalStorage); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to compute storage usage")
		}
		if totalStorage+fileHeader.Size > storageLimit {
			return fiber.NewError(http.StatusRequestEntityTooLarge, "Upload would exceed storage limit")
		}

		src, err := fileHeader.Open()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to open uploaded file")
		}
		defer src.Close()

		// Compute SHA256 hash of file content for deduplication
		hash := sha256.New()
		if _, err := io.Copy(hash, src); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to compute file hash")
		}
		contentHash := hex.EncodeToString(hash.Sum(nil))

		// Check if a file with this hash already exists
		var existingStoragePath string
		var existingSize int64
		err = conn.QueryRowContext(ctx, `
			SELECT storage_path, size
			FROM file
			WHERE content_hash = ?
			LIMIT 1
		`, contentHash).Scan(&existingStoragePath, &existingSize)

		var storagePath string
		var fileSize int64

		if err == nil && existingStoragePath != "" {
			// File with same hash exists, reuse the storage path
			log.Printf("upload: reusing existing file with hash %s, storage_path=%s", contentHash, existingStoragePath)
			storagePath = existingStoragePath
			fileSize = existingSize
			// Don't count storage again since we're reusing an existing file
		} else {
			// New file, upload to MinIO
			// Reset file reader for upload
			src.Close()
			src, err = fileHeader.Open()
			if err != nil {
				return fiber.NewError(http.StatusInternalServerError, "failed to reopen uploaded file")
			}
			defer src.Close()

			now := time.Now().UTC()
			datePath := filepath.Join(
				now.Format("2006"),
				now.Format("01"),
				now.Format("02"),
			)
			key := filepath.ToSlash(filepath.Join(cfg.StoragePrefix, strconv.FormatInt(projectID, 10), datePath, fileHeader.Filename))

			opts := minio.PutObjectOptions{
				ContentType: fileHeader.Header.Get("Content-Type"),
			}

			info, err := client.PutObject(
				ctx,
				cfg.Bucket,
				key,
				src,
				fileHeader.Size,
				opts,
			)
			if err != nil {
				log.Printf("upload error: %v", err)
				return fiber.NewError(fiber.StatusInternalServerError, "failed to upload file")
			}

			storagePath = "s3://" + cfg.Bucket + "/" + key
			fileSize = info.Size
		}

		nowStr := time.Now().UTC()

		// Insert DB record with hash
		id := uuid.NewString()
		if _, err := conn.ExecContext(ctx, `
			INSERT INTO file (id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, id, fileHeader.Filename, fileSize, defaultContentType(fileHeader.Header.Get("Content-Type")), nowStr, projectID, user.UID, storagePath, contentHash); err != nil {
			log.Printf("db insert file error: %v", err)
			return fiber.NewError(http.StatusInternalServerError, "failed to save file record")
		}

		var f db.File
		if err := conn.QueryRowContext(ctx, `
			SELECT id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash
			FROM file
			WHERE id = ?
		`, id).Scan(
			&f.ID,
			&f.Filename,
			&f.Size,
			&f.MimeType,
			&f.CreatedAt,
			&f.ProjectID,
			&f.UserFirebaseUID,
			&f.StoragePath,
			&f.ContentHash,
		); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to load created file")
		}

		return c.Status(http.StatusCreated).JSON(f)
	})

	// GET /frontend/files/list
	router.Get("/list", func(c fiber.Ctx) error {
		user, err := auth.GetCurrentFirebaseUser(c)
		if err != nil {
			return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
		}

		projectID, err := strconv.ParseInt(c.Query("project_id"), 10, 64)
		if err != nil || projectID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid project_id")
		}

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// Verify project belongs to user
		var ownerUID string
		if err := conn.QueryRowContext(ctx, `
			SELECT user_firebase_uid
			FROM project
			WHERE id = ?
		`, projectID).Scan(&ownerUID); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusForbidden, "Not authorized to access this project")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load project")
		}
		if ownerUID != user.UID {
			return fiber.NewError(http.StatusForbidden, "Not authorized to access this project")
		}

		// Initialize as empty slice (not nil) to ensure JSON returns []
		files := make([]db.File, 0)

		rows, err := conn.QueryContext(ctx, `
			SELECT id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash
			FROM file
			WHERE project_id = ?
			ORDER BY created_at DESC
		`, projectID)
		if err != nil {
			// Return empty array instead of error - query failures might be due to empty table
			return c.JSON(files)
		}
		defer rows.Close()

		for rows.Next() {
			var f db.File
			if err := rows.Scan(
				&f.ID,
				&f.Filename,
				&f.Size,
				&f.MimeType,
				&f.CreatedAt,
				&f.ProjectID,
				&f.UserFirebaseUID,
				&f.StoragePath,
				&f.ContentHash,
			); err != nil {
				// Continue to next row instead of failing completely
				continue
			}
			files = append(files, f)
		}

		// Check for errors during iteration
		if err := rows.Err(); err != nil {
			// Return what we have so far, even if there was an iteration error
			return c.JSON(files)
		}

		return c.JSON(files)
	})

	// DELETE /frontend/files/:file_id
	router.Delete("/:file_id", func(c fiber.Ctx) error {
		user, err := auth.GetCurrentFirebaseUser(c)
		if err != nil {
			return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
		}

		fileID := c.Params("file_id")
		if fileID == "" {
			return fiber.NewError(http.StatusBadRequest, "file_id is required")
		}

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var f db.File
		if err := conn.QueryRowContext(ctx, `
			SELECT id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash
			FROM file
			WHERE id = ?
		`, fileID).Scan(
			&f.ID,
			&f.Filename,
			&f.Size,
			&f.MimeType,
			&f.CreatedAt,
			&f.ProjectID,
			&f.UserFirebaseUID,
			&f.StoragePath,
			&f.ContentHash,
		); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusNotFound, "File not found")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load file")
		}

		if f.UserFirebaseUID != user.UID {
			return fiber.NewError(http.StatusForbidden, "Not authorized to delete this file")
		}

		// Check how many files reference the same storage_path (for deduplication)
		var referenceCount int
		if f.ContentHash != "" {
			err = conn.QueryRowContext(ctx, `
				SELECT COUNT(*)
				FROM file
				WHERE content_hash = ?
			`, f.ContentHash).Scan(&referenceCount)
		} else {
			// Fallback: count by storage_path if hash is not available
			err = conn.QueryRowContext(ctx, `
				SELECT COUNT(*)
				FROM file
				WHERE storage_path = ?
			`, f.StoragePath).Scan(&referenceCount)
		}
		if err != nil {
			log.Printf("failed to count file references: %v", err)
			referenceCount = 1 // Assume it's the only reference if we can't check
		}

		// Only delete from MinIO if this is the last reference
		if referenceCount <= 1 {
			if strings.HasPrefix(f.StoragePath, "s3://") {
				key, err := extractKeyFromStoragePath(f.StoragePath, cfg.Bucket)
				if err != nil {
					log.Printf("failed to extract key from storage path for deletion: %v", err)
					// Continue with DB deletion even if key extraction fails
				} else {
					ctxDel, cancelDel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancelDel()
					if err := client.RemoveObject(ctxDel, cfg.Bucket, key, minio.RemoveObjectOptions{}); err != nil {
						log.Printf("delete object error: %v", err)
					} else {
						log.Printf("deleted MinIO object: %s (last reference)", key)
					}
				}
			} else {
				// Legacy local path - best-effort delete from disk
				_ = os.Remove(f.StoragePath)
			}
		} else {
			log.Printf("skipping MinIO deletion: %d files still reference storage_path=%s", referenceCount-1, f.StoragePath)
		}

		if _, err := conn.ExecContext(ctx, `DELETE FROM file WHERE id = ?`, fileID); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to delete file record")
		}

		return c.SendStatus(http.StatusNoContent)
	})
}

// extractKeyFromStoragePath extracts the MinIO object key from an s3:// storage path.
// It handles cases where the bucket name might not match the config by parsing the URL directly.
func extractKeyFromStoragePath(storagePath string, expectedBucket string) (string, error) {
	if !strings.HasPrefix(storagePath, "s3://") {
		return "", fiber.NewError(http.StatusBadRequest, "storage path is not an s3:// URL")
	}

	// Remove s3:// prefix
	path := strings.TrimPrefix(storagePath, "s3://")

	// Split by / to get bucket and key parts
	parts := strings.SplitN(path, "/", 2)
	if len(parts) < 2 {
		return "", fiber.NewError(http.StatusBadRequest, "invalid s3:// URL format")
	}

	bucket := parts[0]
	key := parts[1]

	// Log if bucket doesn't match (for debugging) but still return the key
	if bucket != expectedBucket {
		log.Printf("warning: storage path bucket (%s) doesn't match config bucket (%s), using extracted key anyway", bucket, expectedBucket)
	}

	// Remove any leading/trailing slashes from key
	key = strings.Trim(key, "/")

	if key == "" {
		return "", fiber.NewError(http.StatusBadRequest, "empty key extracted from storage path")
	}

	return key, nil
}

// serveFileFromMinIO is a helper function to serve a file directly from MinIO
func serveFileFromMinIO(c fiber.Ctx, ctx context.Context, client *minio.Client, cfg config.MinioConfig, f db.File, key string) error {
	log.Printf("serveFileFromMinIO: bucket=%s, key=%s", cfg.Bucket, key)

	// Get object from MinIO - use request context to ensure it stays valid for streaming
	obj, err := client.GetObject(ctx, cfg.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		log.Printf("get object error: %v", err)
		return fiber.NewError(http.StatusInternalServerError, "failed to fetch file from storage")
	}
	defer obj.Close()

	// Get object info for content type
	objInfo, err := obj.Stat()
	if err != nil {
		log.Printf("stat object error: %v, using DB metadata", err)
		// Continue anyway - we can use file metadata from DB
	}

	// Set headers before streaming
	contentType := f.MimeType
	if contentType == "" && err == nil {
		contentType = objInfo.ContentType
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", `inline; filename="`+f.Filename+`"`)
	if f.Size > 0 {
		c.Set("Content-Length", strconv.FormatInt(f.Size, 10))
	}
	c.Set("Cache-Control", "public, max-age=3600")

	log.Printf("serveFileFromMinIO: streaming file, contentType=%s, size=%d", contentType, f.Size)

	// Read the entire object and send it - SendStream might have issues with MinIO object streams
	body, err := io.ReadAll(obj)
	if err != nil {
		log.Printf("serveFileFromMinIO: failed to read object: %v", err)
		return fiber.NewError(http.StatusInternalServerError, "failed to read file from storage")
	}

	return c.Send(body)
}

// RegisterPublicFileRoutes registers /files/:file_id to serve downloads by DB ID.
// Files are proxied from MinIO instead of redirecting, so the frontend never accesses MinIO directly.
func RegisterPublicFileRoutes(router fiber.Router, client *minio.Client, cfg config.MinioConfig) {
	// GET /files/:file_id - serve file (proxied from MinIO)
	router.Get("/:file_id", func(c fiber.Ctx) error {
		fileID := c.Params("file_id")
		if fileID == "" {
			return fiber.NewError(http.StatusBadRequest, "file_id is required")
		}

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		// Use request context for DB query (short timeout)
		dbCtx, dbCancel := context.WithTimeout(c.Context(), 5*time.Second)
		defer dbCancel()

		var f db.File
		if err := conn.QueryRowContext(dbCtx, `
			SELECT id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash
			FROM file
			WHERE id = ?
		`, fileID).Scan(
			&f.ID,
			&f.Filename,
			&f.Size,
			&f.MimeType,
			&f.CreatedAt,
			&f.ProjectID,
			&f.UserFirebaseUID,
			&f.StoragePath,
			&f.ContentHash,
		); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusNotFound, "File not found")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load file")
		}

		// If it's an S3 path, proxy from MinIO
		// Use request context so it stays valid for the entire stream duration
		if strings.HasPrefix(f.StoragePath, "s3://") {
			key, err := extractKeyFromStoragePath(f.StoragePath, cfg.Bucket)
			if err != nil {
				log.Printf("failed to extract key from storage path: %v", err)
				return err
			}
			log.Printf("serving file: storage_path=%s, extracted_key=%s", f.StoragePath, key)
			return serveFileFromMinIO(c, c.Context(), client, cfg, f, key)
		}

		// Legacy local path: best-effort send file if it exists
		if _, err := os.Stat(f.StoragePath); err == nil {
			return c.SendFile(f.StoragePath)
		}

		return fiber.NewError(http.StatusNotFound, "File not found on storage")
	})

	// GET /files/:file_id/thumbnail - serve thumbnail using imgproxy
	router.Get("/:file_id/thumbnail", func(c fiber.Ctx) error {
		fileID := c.Params("file_id")
		if fileID == "" {
			return fiber.NewError(http.StatusBadRequest, "file_id is required")
		}

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		// Use a short timeout for DB query
		dbCtx, dbCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer dbCancel()

		var f db.File
		if err := conn.QueryRowContext(dbCtx, `
			SELECT id, filename, size, mime_type, created_at, project_id, user_firebase_uid, storage_path, content_hash
			FROM file
			WHERE id = ?
		`, fileID).Scan(
			&f.ID,
			&f.Filename,
			&f.Size,
			&f.MimeType,
			&f.CreatedAt,
			&f.ProjectID,
			&f.UserFirebaseUID,
			&f.StoragePath,
			&f.ContentHash,
		); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusNotFound, "File not found")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load file")
		}

		// Only generate thumbnails for images
		if !strings.HasPrefix(f.MimeType, "image/") {
			log.Printf("thumbnail: skipping non-image file: id=%s, mime_type=%s, storage_path=%s", f.ID, f.MimeType, f.StoragePath)
			return fiber.NewError(http.StatusBadRequest, "Thumbnails are only available for image files")
		}

		// If it's an S3 path, proxy thumbnail from imgproxy
		if strings.HasPrefix(f.StoragePath, "s3://") {
			key, err := extractKeyFromStoragePath(f.StoragePath, cfg.Bucket)
			if err != nil {
				log.Printf("thumbnail: failed to extract key from storage path: %v", err)
				return err
			}
			log.Printf("thumbnail: start: fileID=%s, mime_type=%s, storagePath=%s, bucket=%s, extracted key=%s, imgproxy_base=%s",
				fileID, f.MimeType, f.StoragePath, cfg.Bucket, key, cfg.ImgproxyURL)
			thumbnailURL := buildImgproxyURLWithOptions(cfg, key, "fit", 0, 120, "webp")
			log.Printf("thumbnail: requesting imgproxy URL=%s", thumbnailURL)

			// Create a context tied to the request context with longer timeout
			imgproxyCtx, imgproxyCancel := context.WithTimeout(c.Context(), 30*time.Second)
			defer imgproxyCancel()

			// Proxy request to imgproxy (internal service)
			req, err := http.NewRequestWithContext(imgproxyCtx, "GET", thumbnailURL, nil)
			if err != nil {
				log.Printf("thumbnail proxy request error: %v", err)
				return fiber.NewError(http.StatusInternalServerError, "failed to create thumbnail request")
			}

			httpClient := &http.Client{
				Timeout: 30 * time.Second,
			}
			resp, err := httpClient.Do(req)
			if err != nil {
				log.Printf("thumbnail proxy error: %v", err)
				return fiber.NewError(http.StatusServiceUnavailable, "Thumbnail service unavailable")
			}
			defer resp.Body.Close()

			log.Printf("thumbnail: imgproxy response status=%d", resp.StatusCode)

			// If imgproxy fails, log details and propagate an error so the frontend
			// can gracefully fall back to showing the file icon instead of a broken
			// full-size image that looks bad in the grid.
			if resp.StatusCode != http.StatusOK {
				bodyPreview, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

				log.Printf("thumbnail: imgproxy error: status=%d, fileID=%s, key=%s, bucket=%s, body_preview=%q",
					resp.StatusCode, fileID, key, cfg.Bucket, string(bodyPreview))

				if resp.StatusCode == http.StatusNotFound {
					return fiber.NewError(http.StatusNotFound, "Thumbnail not found")
				}

				return fiber.NewError(http.StatusBadGateway, "Thumbnail service error")
			}

			// Set headers from imgproxy response
			contentType := resp.Header.Get("Content-Type")
			if contentType == "" {
				contentType = "image/webp"
			}
			c.Set("Content-Type", contentType)
			c.Set("Cache-Control", "public, max-age=3600")
			c.Set("Content-Disposition", `inline; filename="thumbnail_`+f.Filename+`"`)

			// Read the entire body and send it - SendStream might have issues with http.Response.Body
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				log.Printf("thumbnail: failed to read imgproxy response body: %v", err)
				return fiber.NewError(http.StatusInternalServerError, "failed to read thumbnail")
			}

			return c.Send(body)
		}

		// Legacy local path: return regular file for now
		if _, err := os.Stat(f.StoragePath); err == nil {
			return c.SendFile(f.StoragePath)
		}

		return fiber.NewError(http.StatusNotFound, "File not found on storage")
	})
}

// buildImgproxyURL creates a signed imgproxy URL using the s3:// scheme.
// It uses IMGPROXY_KEY and IMGPROXY_SALT (hex-encoded) as described in the
// imgproxy documentation. If key/salt are not set or invalid, it falls back
// to an /unsafe URL so that development still works.
func buildImgproxyURL(cfg config.MinioConfig, key string) string {
	return buildImgproxyURLWithOptions(cfg, key, "fit", 1200, 1200, "webp")
}

// buildImgproxyURLWithOptions builds a signed imgproxy URL with the provided
// transform options, after they have been validated.
func buildImgproxyURLWithOptions(cfg config.MinioConfig, key, mode string, width, height int, format string) string {
	// Ensure key doesn't have leading slash
	key = strings.TrimPrefix(key, "/")

	// Source URL in s3:// scheme - when IMGPROXY_USE_S3 is enabled, imgproxy accesses MinIO directly
	src := "s3://" + cfg.Bucket + "/" + key

	// imgproxy format: when IMGPROXY_USE_S3 is enabled, use plain s3:// URL (not base64-encoded)
	// Format: /rs:mode:width:height/plain/s3://bucket/key@format
	// Note: When width is 0, imgproxy auto-calculates width preserving aspect ratio
	// The /plain/ prefix allows plain text URLs - use the s3:// URL directly
	resizePart := "/rs:" + mode + ":" + strconv.Itoa(width) + ":" + strconv.Itoa(height)
	path := resizePart + "/plain/" + src + "@" + format

	sig := signImgproxyPath(path)
	if sig == "" {
		// Fallback to unsafe mode for development if signing is not configured
		log.Printf("imgproxy: using unsafe mode (signing not configured), source=%s", src)
		return cfg.ImgproxyURL + "/unsafe" + path
	}

	fullURL := cfg.ImgproxyURL + "/" + sig + path
	log.Printf("imgproxy: built URL: source=%s, path=%s", src, path)
	return fullURL
}

// signImgproxyPath computes the HMAC-SHA256 signature for an imgproxy path
// using hex-encoded IMGPROXY_KEY and IMGPROXY_SALT, and returns a base64url
// (no padding) string suitable for use in the URL.
func signImgproxyPath(path string) string {
	keyHex := os.Getenv("IMGPROXY_KEY")
	saltHex := os.Getenv("IMGPROXY_SALT")
	if keyHex == "" || saltHex == "" {
		return ""
	}

	key, err := hex.DecodeString(keyHex)
	if err != nil {
		log.Printf("imgproxy: invalid IMGPROXY_KEY hex: %v", err)
		return ""
	}
	salt, err := hex.DecodeString(saltHex)
	if err != nil {
		log.Printf("imgproxy: invalid IMGPROXY_SALT hex: %v", err)
		return ""
	}

	mac := hmac.New(sha256.New, key)
	// Per imgproxy docs, the message is salt + path
	mac.Write(salt)
	mac.Write([]byte(path))
	signature := mac.Sum(nil)

	return base64.RawURLEncoding.EncodeToString(signature)
}

func isAllowedMode(mode string) bool {
	switch mode {
	case "fit", "fill", "resize":
		return true
	default:
		return false
	}
}

func isAllowedFormat(format string) bool {
	switch format {
	case "webp", "jpeg", "png", "jpg":
		return true
	default:
		return false
	}
}

func defaultContentType(ct string) string {
	ct = strings.TrimSpace(ct)
	if ct == "" {
		return "application/octet-stream"
	}
	return ct
}

// getPresetDimensions maps logical size presets to concrete imgproxy dimensions.
// Heights are fixed, width=0 so imgproxy computes it and preserves aspect ratio.
func getPresetDimensions(preset string) (width, height int, ok bool) {
	switch preset {
	case "thumbnail":
		return 0, 120, true
	case "medium":
		return 0, 320, true
	case "preview":
		return 0, 720, true
	case "full":
		return 0, 1080, true
	default:
		return 0, 0, false
	}
}

// trackAPIUsage logs API usage to the apiusage table, mirroring the Python
// backend's track_api_usage function. It's called after each API-key authenticated
// request to /api/v1/files/* endpoints.
func trackAPIUsage(ctx context.Context, endpoint string, status int, start time.Time, apiCtx *auth.APIKeyContext) {
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("trackAPIUsage: db error: %v", err)
		return
	}

	responseTimeMs := float64(time.Since(start)) / float64(time.Millisecond)

	_, err = conn.ExecContext(ctx, `
		INSERT INTO apiusage (timestamp, endpoint, response_time, status_code, user_firebase_uid, project_id, api_key_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, time.Now().UTC(), endpoint, responseTimeMs, status, apiCtx.User.FirebaseUID, apiCtx.Project.ID, apiCtx.APIKey.ID)

	if err != nil {
		log.Printf("trackAPIUsage insert error: %v", err)
	}
}
