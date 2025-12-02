package routes

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gabriel/open_upload_gobackend/internal/auth"
	"github.com/gabriel/open_upload_gobackend/internal/db"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type apiKeyPayload struct {
	ProjectID int64  `json:"project_id"`
	Name      string `json:"name"`
}

// RegisterAPIKeyRoutes registers /api-keys routes (Firebase-authenticated).
func RegisterAPIKeyRoutes(router fiber.Router) {
	router.Use(auth.FirebaseAuthMiddleware())

	router.Post("/", createAPIKey)
	router.Get("/", listAPIKeys)
	router.Delete("/:api_key_id", deleteAPIKey)
}

// RegisterFrontendAPIKeyRoutes registers /frontend/api-keys routes (Firebase-authenticated).
func RegisterFrontendAPIKeyRoutes(router fiber.Router) {
	router.Use(auth.FirebaseAuthMiddleware())
	router.Get("/api/verify", verifyAPIKey)
}

func generateAPIKey() string {
	return "openupload_sk_" + uuid.New().String()
}

func createAPIKey(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	var body apiKeyPayload
	if err := c.Bind().Body(&body); err != nil {
		return fiber.NewError(http.StatusBadRequest, "invalid API key payload")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure project exists and belongs to user
	var ownerUID string
	if err := conn.QueryRowContext(ctx, `
		SELECT user_firebase_uid
		FROM project
		WHERE id = ?
	`, body.ProjectID).Scan(&ownerUID); err != nil {
		if err == sql.ErrNoRows {
			return fiber.NewError(http.StatusNotFound, "Project not found")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to load project")
	}
	if ownerUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Not authorized to create API key for this project")
	}

	keyValue := generateAPIKey()

	res, err := conn.ExecContext(ctx, `
		INSERT INTO apikey (key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id)
		VALUES (?, ?, 1, CURRENT_TIMESTAMP, NULL, ?, ?)
	`, keyValue, body.Name, user.UID, body.ProjectID)
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to create API key")
	}

	id, err := res.LastInsertId()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to get new API key id")
	}

	var apiKey db.ApiKey
	var lastUsed sql.NullTime
	if err := conn.QueryRowContext(ctx, `
		SELECT id, key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id
		FROM apikey
		WHERE id = ?
	`, id).Scan(
		&apiKey.ID,
		&apiKey.Key,
		&apiKey.Name,
		&apiKey.IsActive,
		&apiKey.CreatedAt,
		&lastUsed,
		&apiKey.UserFirebaseUID,
		&apiKey.ProjectID,
	); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to load created API key")
	}
	if lastUsed.Valid {
		t := lastUsed.Time
		apiKey.LastUsedAt = &t
	}

	return c.Status(http.StatusCreated).JSON(apiKey)
}

func listAPIKeys(c fiber.Ctx) error {
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

	projectIDStr := c.Query("project_id", "")

	query := `
		SELECT id, key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id
		FROM apikey
		WHERE user_firebase_uid = ?
	`
	args := []any{user.UID}

	if projectIDStr != "" {
		projectID, err := strconv.ParseInt(projectIDStr, 10, 64)
		if err != nil || projectID <= 0 {
			return fiber.NewError(http.StatusBadRequest, "invalid project_id")
		}

		// Verify project belongs to user
		var ownerUID string
		if err := conn.QueryRowContext(ctx, `
			SELECT user_firebase_uid
			FROM project
			WHERE id = ?
		`, projectID).Scan(&ownerUID); err != nil {
			if err == sql.ErrNoRows {
				return fiber.NewError(http.StatusNotFound, "Project not found or not owned by user")
			}
			return fiber.NewError(http.StatusInternalServerError, "failed to load project")
		}
		if ownerUID != user.UID {
			return fiber.NewError(http.StatusNotFound, "Project not found or not owned by user")
		}

		query += " AND project_id = ?"
		args = append(args, projectID)
	}

	// Initialize as empty slice (not nil) to ensure JSON returns []
	keys := make([]db.ApiKey, 0)

	rows, err := conn.QueryContext(ctx, query, args...)
	if err != nil {
		// Return empty array instead of error - query failures might be due to empty table
		return c.JSON(keys)
	}
	defer rows.Close()

	for rows.Next() {
		var k db.ApiKey
		var lastUsed sql.NullTime
		if err := rows.Scan(
			&k.ID,
			&k.Key,
			&k.Name,
			&k.IsActive,
			&k.CreatedAt,
			&lastUsed,
			&k.UserFirebaseUID,
			&k.ProjectID,
		); err != nil {
			// Continue to next row instead of failing completely
			continue
		}
		if lastUsed.Valid {
			t := lastUsed.Time
			k.LastUsedAt = &t
		}
		keys = append(keys, k)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		// Return what we have so far, even if there was an iteration error
		return c.JSON(keys)
	}

	return c.JSON(keys)
}

func deleteAPIKey(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	apiKeyID, err := strconv.ParseInt(c.Params("api_key_id"), 10, 64)
	if err != nil || apiKeyID <= 0 {
		return fiber.NewError(http.StatusBadRequest, "invalid api_key_id")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var ownerUID string
	if err := conn.QueryRowContext(ctx, `
		SELECT user_firebase_uid
		FROM apikey
		WHERE id = ?
	`, apiKeyID).Scan(&ownerUID); err != nil {
		if err == sql.ErrNoRows {
			return fiber.NewError(http.StatusNotFound, "API key not found")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to load API key")
	}
	if ownerUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Not authorized to delete this API key")
	}

	if _, err := conn.ExecContext(ctx, `DELETE FROM apikey WHERE id = ?`, apiKeyID); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to delete API key")
	}

	return c.SendStatus(http.StatusNoContent)
}

func verifyAPIKey(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	apiKeyVal := c.Query("api_key", "")
	if apiKeyVal == "" {
		return fiber.NewError(http.StatusBadRequest, "api_key query param is required")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var key db.ApiKey
	var lastUsed sql.NullTime
	if err := conn.QueryRowContext(ctx, `
		SELECT id, key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id
		FROM apikey
		WHERE key = ? AND user_firebase_uid = ? AND is_active = 1
	`, apiKeyVal, user.UID).Scan(
		&key.ID,
		&key.Key,
		&key.Name,
		&key.IsActive,
		&key.CreatedAt,
		&lastUsed,
		&key.UserFirebaseUID,
		&key.ProjectID,
	); err != nil {
		if err == sql.ErrNoRows {
			return fiber.NewError(http.StatusNotFound, "API key not found or not owned by user")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to verify API key")
	}
	if lastUsed.Valid {
		t := lastUsed.Time
		key.LastUsedAt = &t
	}

	return c.JSON(key)
}
