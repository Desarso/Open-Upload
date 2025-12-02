package routes

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gabriel/open_upload_gobackend/internal/auth"
	"github.com/gabriel/open_upload_gobackend/internal/config"
	"github.com/gabriel/open_upload_gobackend/internal/db"
	"github.com/gofiber/fiber/v3"
	"github.com/minio/minio-go/v7"
)

type DashboardStats struct {
	TotalStorage      int64   `json:"total_storage"`
	TotalStorageLimit int64   `json:"total_storage_limit"`
	TotalFiles        int64   `json:"total_files"`
	TotalAPIRequests  int64   `json:"total_api_requests"`
	APIRequestsChange float64 `json:"api_requests_change"`
}

type UsageStats struct {
	Date            string  `json:"date"`
	APICalls        int64   `json:"api_calls"`
	AvgResponseTime float64 `json:"avg_response_time"`
	SuccessRate     float64 `json:"success_rate"`
}

type StorageStats struct {
	DatabaseStorage int64               `json:"database_storage"`      // Storage tracked in DB
	MinIOStorage    int64               `json:"minio_storage"`         // Actual storage in MinIO bucket
	MinIOObjects    int64               `json:"minio_objects"`         // Number of objects in MinIO
	StorageLimit    int64               `json:"storage_limit"`         // User storage limit
	MinIOStats      *config.BucketStats `json:"minio_stats,omitempty"` // Detailed MinIO stats
}

// RegisterUsageRoutes registers /usage* routes that mirror backend/routes/usage.py
// and are used by the frontend dashboard.
func RegisterUsageRoutes(router fiber.Router, minioClient *minio.Client, minioCfg config.MinioConfig) {
	router.Use(auth.FirebaseAuthMiddleware())
	router.Use(auth.RequireRoles("whitelisted"))

	router.Get("/dashboard-stats", getDashboardStats)
	router.Get("/storage", func(c fiber.Ctx) error {
		return getStorageStats(c, minioClient, minioCfg)
	})
	router.Get("/", getUsageStats)
	router.Get("/details", getUsageDetails)
}

func getDashboardStats(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Storage stats - initialize with zero values
	var totalStorage, totalFiles int64 = 0, 0

	err = conn.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(size), 0) AS total_storage,
			COALESCE(COUNT(id), 0) AS total_files
		FROM file
		WHERE user_firebase_uid = ?
	`, user.UID).Scan(&totalStorage, &totalFiles)
	if err != nil && err != sql.ErrNoRows {
		// If query fails, return zero values instead of error
		totalStorage = 0
		totalFiles = 0
	}

	// API requests in last 30 days - initialize with zero values
	endDate := time.Now().UTC()
	startDate := endDate.AddDate(0, 0, -30)
	prevStart := startDate.AddDate(0, 0, -30)

	var currentRequests, previousRequests int64 = 0, 0

	err = conn.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(id), 0)
		FROM apiusage
		WHERE user_firebase_uid = ?
		  AND timestamp >= ?
		  AND timestamp <= ?
	`, user.UID, startDate, endDate).Scan(&currentRequests)
	if err != nil && err != sql.ErrNoRows {
		currentRequests = 0
	}

	err = conn.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(id), 0)
		FROM apiusage
		WHERE user_firebase_uid = ?
		  AND timestamp >= ?
		  AND timestamp < ?
	`, user.UID, prevStart, startDate).Scan(&previousRequests)
	if err != nil && err != sql.ErrNoRows {
		previousRequests = 0
	}

	var change float64
	if previousRequests > 0 {
		change = float64(currentRequests-previousRequests) / float64(previousRequests) * 100
	} else {
		if currentRequests == 0 {
			change = 0
		} else {
			change = 100
		}
	}

	// 50GB limit like Python
	const storageLimit = 50 * 1024 * 1024 * 1024

	stats := DashboardStats{
		TotalStorage:      totalStorage,
		TotalStorageLimit: storageLimit,
		TotalFiles:        totalFiles,
		TotalAPIRequests:  currentRequests,
		APIRequestsChange: change,
	}

	return c.JSON(stats)
}

func getStorageStats(c fiber.Ctx, minioClient *minio.Client, minioCfg config.MinioConfig) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get storage tracked in database
	var databaseStorage int64 = 0
	err = conn.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(size), 0)
		FROM file
		WHERE user_firebase_uid = ?
	`, user.UID).Scan(&databaseStorage)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Failed to query database storage: %v", err)
		databaseStorage = 0
	}

	// Get MinIO bucket statistics
	minioStats, err := config.GetBucketStats(ctx, minioClient, minioCfg.Bucket)
	if err != nil {
		log.Printf("Failed to get MinIO bucket stats: %v", err)
		// Continue with database stats even if MinIO query fails
		minioStats = config.BucketStats{
			TotalSize:   0,
			ObjectCount: 0,
		}
	}

	// 50GB limit like Python
	const storageLimit = 50 * 1024 * 1024 * 1024

	stats := StorageStats{
		DatabaseStorage: databaseStorage,
		MinIOStorage:    minioStats.TotalSize,
		MinIOObjects:    minioStats.ObjectCount,
		StorageLimit:    storageLimit,
		MinIOStats:      &minioStats,
	}

	return c.JSON(stats)
}

func getUsageStats(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	projectIDStr := c.Query("project_id", "")
	startDateStr := c.Query("start_date", "")
	endDateStr := c.Query("end_date", "")

	query := `
		SELECT
			DATE(timestamp) AS date,
			COUNT(id) AS api_calls,
			AVG(response_time) AS avg_response_time,
			(CAST(SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) AS FLOAT) * 100.0 / COUNT(id)) AS success_rate
		FROM apiusage
		WHERE user_firebase_uid = ?
	`
	args := []any{user.UID}

	if projectIDStr != "" {
		projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
		if err != nil || projectID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid project_id")
		}
		query += " AND project_id = ?"
		args = append(args, projectID)
	}

	if startDateStr != "" {
		start, err := time.Parse("2006-01-02", startDateStr)
		if err != nil {
			return fiber.NewError(http.StatusBadRequest, "invalid start_date")
		}
		query += " AND timestamp >= ?"
		args = append(args, start)
	}

	if endDateStr != "" {
		end, err := time.Parse("2006-01-02", endDateStr)
		if err != nil {
			return fiber.NewError(http.StatusBadRequest, "invalid end_date")
		}
		// include full end day
		end = end.AddDate(0, 0, 1)
		query += " AND timestamp < ?"
		args = append(args, end)
	}

	query += " GROUP BY DATE(timestamp) ORDER BY DATE(timestamp)"

	rows, err := conn.QueryContext(ctx, query, args...)
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to query usage stats")
	}
	defer rows.Close()

	// Initialize as empty slice (not nil) to ensure JSON returns []
	stats := make([]UsageStats, 0)
	for rows.Next() {
		var s UsageStats
		if err := rows.Scan(&s.Date, &s.APICalls, &s.AvgResponseTime, &s.SuccessRate); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to scan usage stats")
		}
		stats = append(stats, s)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to iterate usage stats")
	}

	return c.JSON(stats)
}

func getUsageDetails(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	projectIDStr := c.Query("project_id", "")
	apiKeyIDStr := c.Query("api_key_id", "")
	startDateStr := c.Query("start_date", "")
	endDateStr := c.Query("end_date", "")
	limitStr := c.Query("limit", "100")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 100
	}

	query := `
		SELECT id, timestamp, endpoint, response_time, status_code, user_firebase_uid, project_id, api_key_id
		FROM apiusage
		WHERE user_firebase_uid = ?
	`
	args := []any{user.UID}

	if projectIDStr != "" {
		projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
		if err != nil || projectID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid project_id")
		}
		query += " AND project_id = ?"
		args = append(args, projectID)
	}

	if apiKeyIDStr != "" {
		apiKeyID, err := strconv.ParseInt(apiKeyIDStr, 10, 64)
		if err != nil || apiKeyID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid api_key_id")
		}
		query += " AND api_key_id = ?"
		args = append(args, apiKeyID)
	}

	if startDateStr != "" {
		start, err := time.Parse("2006-01-02", startDateStr)
		if err != nil {
			return fiber.NewError(http.StatusBadRequest, "invalid start_date")
		}
		query += " AND timestamp >= ?"
		args = append(args, start)
	}

	if endDateStr != "" {
		end, err := time.Parse("2006-01-02", endDateStr)
		if err != nil {
			return fiber.NewError(http.StatusBadRequest, "invalid end_date")
		}
		end = end.AddDate(0, 0, 1)
		query += " AND timestamp < ?"
		args = append(args, end)
	}

	query += " ORDER BY timestamp DESC LIMIT ?"
	args = append(args, limit)

	rows, err := conn.QueryContext(ctx, query, args...)
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to query usage details")
	}
	defer rows.Close()

	// Initialize as empty slice (not nil) to ensure JSON returns []
	records := make([]db.ApiUsage, 0)
	for rows.Next() {
		var r db.ApiUsage
		if err := rows.Scan(
			&r.ID,
			&r.Timestamp,
			&r.Endpoint,
			&r.ResponseTimeMs,
			&r.StatusCode,
			&r.UserFirebaseUID,
			&r.ProjectID,
			&r.ApiKeyID,
		); err != nil {
			return fiber.NewError(http.StatusInternalServerError, "failed to scan usage record")
		}
		records = append(records, r)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to iterate usage details")
	}

	// Frontend accepts either a raw array or a paginated envelope; we return just the array,
	// which is compatible with the current logic.
	return c.JSON(records)
}
