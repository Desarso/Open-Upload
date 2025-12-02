package auth

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gabriel/open_upload_gobackend/internal/db"
	"github.com/gofiber/fiber/v3"
)

type APIKeyContext struct {
	User    db.User
	Project db.Project
	APIKey  db.ApiKey
}

const apiKeyContextKey = "api_key_ctx"

// APIKeyMiddleware validates X-API-Key and loads the associated user and project.
// It mirrors the Python get_api_key_user dependency.
func APIKeyMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		apiKey := c.Get("X-API-Key")
		if apiKey == "" {
			return fiber.NewError(http.StatusUnauthorized, "X-API-Key header is required")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		conn, err := db.GetDB()
		if err != nil {
			return fiber.NewError(http.StatusInternalServerError, "database not available")
		}

		var key db.ApiKey
		row := conn.QueryRowContext(ctx, `
			SELECT id, key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id
			FROM apikey
			WHERE key = ? AND is_active = 1
		`, apiKey)

		var lastUsed sql.NullTime
		if err := row.Scan(
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
				return fiber.NewError(http.StatusUnauthorized, "Invalid or inactive API key")
			}
			return fiber.NewError(http.StatusInternalServerError, "Failed to load API key")
		}
		if lastUsed.Valid {
			t := lastUsed.Time
			key.LastUsedAt = &t
		}

		// Update last_used_at (best-effort, ignore error)
		_, _ = conn.ExecContext(ctx, `UPDATE apikey SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`, key.ID)

		// Load user and project
		var user db.User
		if err := conn.QueryRowContext(ctx, `
			SELECT firebase_uid, email, created_at
			FROM user
			WHERE firebase_uid = ?
		`, key.UserFirebaseUID).Scan(
			&user.FirebaseUID,
			&user.Email,
			&user.CreatedAt,
		); err != nil {
			return fiber.NewError(http.StatusUnauthorized, "API key is invalid (missing user)")
		}

		var project db.Project
		var desc sql.NullString
		if err := conn.QueryRowContext(ctx, `
			SELECT id, name, description, created_at, user_firebase_uid
			FROM project
			WHERE id = ?
		`, key.ProjectID).Scan(
			&project.ID,
			&project.Name,
			&desc,
			&project.CreatedAt,
			&project.UserFirebaseUID,
		); err != nil {
			return fiber.NewError(http.StatusUnauthorized, "API key is invalid (missing project)")
		}
		if desc.Valid {
			project.Description = &desc.String
		}

		ctxVal := &APIKeyContext{
			User:    user,
			Project: project,
			APIKey:  key,
		}

		c.Locals(apiKeyContextKey, ctxVal)
		return c.Next()
	}
}

// GetAPIKeyContext retrieves the APIKeyContext from Fiber Locals.
func GetAPIKeyContext(c fiber.Ctx) (*APIKeyContext, error) {
	val := c.Locals(apiKeyContextKey)
	ctxVal, ok := val.(*APIKeyContext)
	if !ok || ctxVal == nil {
		return nil, fiber.NewError(http.StatusUnauthorized, "API key context not set")
	}
	return ctxVal, nil
}
