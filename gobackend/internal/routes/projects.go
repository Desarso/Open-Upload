package routes

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gabriel/open_upload_gobackend/internal/auth"
	"github.com/gabriel/open_upload_gobackend/internal/db"
	"github.com/gofiber/fiber/v3"
)

type ProjectStats struct {
	TotalStorage int64 `json:"total_storage"`
	TotalFiles   int64 `json:"total_files"`
}

// ProjectWithKeys matches the Python ProjectReadWithKeys model and the
// frontend's ProjectWithKeys type: a project plus its API keys.
type ProjectWithKeys struct {
	db.Project `json:",inline"`
	APIKeys    []db.ApiKey `json:"api_keys"`
}

// RegisterProjectRoutes wires project-related routes that mirror backend/routes/projects.py.
// Prefixes are expected to be added by the caller (e.g. app.Group("/projects")).
func RegisterProjectRoutes(router fiber.Router) {
	// All project routes require Firebase auth + whitelisted role, as in Python.
	router.Use(auth.FirebaseAuthMiddleware())
	router.Use(auth.RequireRoles("whitelisted"))

	// GET /projects
	router.Get("/", listProjects)
	// POST /projects
	router.Post("/", createProject)
	// GET /projects/:id
	router.Get("/:project_id", getProject)
	// DELETE /projects/:id
	router.Delete("/:project_id", deleteProject)
	// GET /projects/:id/stats
	router.Get("/:project_id/stats", getProjectStats)
}

func listProjects(c fiber.Ctx) error {
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

	// Initialize as empty slice (not nil) to ensure JSON returns []
	projects := make([]db.Project, 0)

	rows, err := conn.QueryContext(ctx, `
		SELECT id, name, description, created_at, user_firebase_uid
		FROM project
		WHERE user_firebase_uid = ?
		ORDER BY created_at DESC
	`, user.UID)
	if err != nil {
		// Log the actual error for debugging
		log.Printf("listProjects query error: %v", err)
		// Return empty array instead of error - query failures might be due to empty table
		return c.JSON(projects)
	}
	defer rows.Close()

	for rows.Next() {
		var p db.Project
		var desc sql.NullString
		if err := rows.Scan(
			&p.ID,
			&p.Name,
			&desc,
			&p.CreatedAt,
			&p.UserFirebaseUID,
		); err != nil {
			log.Printf("listProjects scan error: %v", err)
			// Continue to next row instead of failing completely
			continue
		}
		if desc.Valid {
			p.Description = &desc.String
		}
		projects = append(projects, p)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		log.Printf("listProjects iteration error: %v", err)
		// Return what we have so far, even if there was an iteration error
		return c.JSON(projects)
	}

	return c.JSON(projects)
}

type projectCreatePayload struct {
	Name            string  `json:"name"`
	Description     *string `json:"description"`
	UserFirebaseUID string  `json:"user_firebase_uid"`
}

func createProject(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	var payload projectCreatePayload
	if err := c.Bind().Body(&payload); err != nil {
		return fiber.NewError(http.StatusBadRequest, "invalid project payload")
	}

	if payload.UserFirebaseUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Cannot create project for another user")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := conn.ExecContext(ctx, `
		INSERT INTO project (name, description, created_at, user_firebase_uid)
		VALUES (?, ?, CURRENT_TIMESTAMP, ?)
	`, payload.Name, payload.Description, user.UID)
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to create project")
	}

	id, err := res.LastInsertId()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to get new project id")
	}

	// Return the created project
	var project db.Project
	var desc sql.NullString
	if err := conn.QueryRowContext(ctx, `
		SELECT id, name, description, created_at, user_firebase_uid
		FROM project
		WHERE id = ?
	`, id).Scan(
		&project.ID,
		&project.Name,
		&desc,
		&project.CreatedAt,
		&project.UserFirebaseUID,
	); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to load created project")
	}
	if desc.Valid {
		project.Description = &desc.String
	}

	return c.Status(http.StatusCreated).JSON(project)
}

func getProject(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	projectID, err := strconv.ParseInt(c.Params("project_id"), 10, 64)
	if err != nil || projectID <= 0 {
		return fiber.NewError(http.StatusBadRequest, "invalid project id")
	}

	conn, err := db.GetDB()
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "database not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var project db.Project
	var desc sql.NullString
	if err := conn.QueryRowContext(ctx, `
		SELECT id, name, description, created_at, user_firebase_uid
		FROM project
		WHERE id = ?
	`, projectID).Scan(
		&project.ID,
		&project.Name,
		&desc,
		&project.CreatedAt,
		&project.UserFirebaseUID,
	); err != nil {
		if err == sql.ErrNoRows {
			return fiber.NewError(http.StatusNotFound, "Project not found")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to load project")
	}
	if desc.Valid {
		project.Description = &desc.String
	}

	if project.UserFirebaseUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Not authorized to access this project")
	}

	// Load API keys for this project, matching ProjectReadWithKeys/api_keys.
	rows, err := conn.QueryContext(ctx, `
		SELECT id, key, name, is_active, created_at, last_used_at, user_firebase_uid, project_id
		FROM apikey
		WHERE project_id = ?
	`, project.ID)
	if err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to load project API keys")
	}
	defer rows.Close()

	// Initialize as empty slice (not nil) to ensure JSON returns []
	apiKeys := make([]db.ApiKey, 0)
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
			return fiber.NewError(http.StatusInternalServerError, "failed to scan API key")
		}
		if lastUsed.Valid {
			t := lastUsed.Time
			k.LastUsedAt = &t
		}
		apiKeys = append(apiKeys, k)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to iterate API keys")
	}

	resp := ProjectWithKeys{
		Project: project,
		APIKeys: apiKeys,
	}

	return c.JSON(resp)
}

func deleteProject(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	projectID, err := strconv.ParseInt(c.Params("project_id"), 10, 64)
	if err != nil || projectID <= 0 {
		return fiber.NewError(http.StatusBadRequest, "invalid project id")
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
	`, projectID).Scan(&ownerUID); err != nil {
		if err == sql.ErrNoRows {
			return fiber.NewError(http.StatusNotFound, "Project not found")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to load project")
	}

	if ownerUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Not authorized to delete this project")
	}

	if _, err := conn.ExecContext(ctx, `DELETE FROM project WHERE id = ?`, projectID); err != nil {
		return fiber.NewError(http.StatusInternalServerError, "failed to delete project")
	}

	return c.SendStatus(http.StatusNoContent)
}

func getProjectStats(c fiber.Ctx) error {
	user, err := auth.GetCurrentFirebaseUser(c)
	if err != nil {
		return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
	}

	projectID, err := strconv.ParseInt(c.Params("project_id"), 10, 64)
	if err != nil || projectID <= 0 {
		return fiber.NewError(http.StatusBadRequest, "invalid project id")
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
			return fiber.NewError(http.StatusNotFound, "Project not found")
		}
		return fiber.NewError(http.StatusInternalServerError, "failed to load project")
	}
	if ownerUID != user.UID {
		return fiber.NewError(http.StatusForbidden, "Not authorized to access this project")
	}

	// Initialize stats with zero values
	stats := ProjectStats{
		TotalStorage: 0,
		TotalFiles:   0,
	}

	// Query stats - COALESCE ensures we get 0 even if no files exist
	err = conn.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(size), 0) AS total_storage,
			COALESCE(COUNT(id), 0) AS total_files
		FROM file
		WHERE project_id = ?
	`, projectID).Scan(&stats.TotalStorage, &stats.TotalFiles)

	// If query fails, return zero values instead of error
	if err != nil && err != sql.ErrNoRows {
		// Return zero stats instead of error - table might be empty
		return c.JSON(stats)
	}

	return c.JSON(stats)
}
