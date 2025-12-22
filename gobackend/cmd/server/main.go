package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/gabriel/open_upload_gobackend/internal/auth"
	"github.com/gabriel/open_upload_gobackend/internal/config"
	"github.com/gabriel/open_upload_gobackend/internal/db"
	"github.com/gabriel/open_upload_gobackend/internal/routes"
)

func main() {
	// Load env vars from .env if present
	config.LoadEnv()

	appCfg := config.GetAppConfig()

	// Initialize DB (connection + basic schema sanity check)
	if _, err := db.GetDB(); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	if err := db.Migrate(context.Background()); err != nil {
		log.Fatalf("database migration check failed: %v", err)
	}

	// MinIO configuration & client
	minioCfg := config.GetMinioConfig()
	minioClient, err := config.NewMinioClient(minioCfg)
	if err != nil {
		log.Fatalf("failed to init MinIO client: %v", err)
	}

	if err := config.EnsureMinioBucket(context.Background(), minioClient, minioCfg); err != nil {
		log.Fatalf("failed to ensure bucket %q: %v", minioCfg.Bucket, err)
	}

	// Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "OpenUpload Go Backend",
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	})

	app.Use(recover.New())
	// CORS (mirror Python's FRONTEND_URL)
	corsConfig := cors.Config{
		AllowCredentials: true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-API-Key"},
	}
	if appCfg.FrontendURL != "" {
		corsConfig.AllowOrigins = []string{appCfg.FrontendURL}
	}
	app.Use(cors.New(corsConfig))
	app.Use(logger.New())

	// Health check
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// /me - current user profile from DB (create-on-first-request)
	app.Get("/me", func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			log.Printf("auth: /me missing Authorization header")
			return fiber.NewError(http.StatusUnauthorized, "Authorization header is required")
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			log.Printf("auth: /me malformed Authorization header: %q", authHeader)
			return fiber.NewError(http.StatusUnauthorized, "Authorization header must be Bearer token")
		}

		token := parts[1]
		// Increased timeout to allow Firebase SDK to fetch public keys on first request
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		fbUser, err := auth.VerifyIDToken(ctx, token)
		if err != nil {
			log.Printf("auth: /me VerifyIDToken error: %v (token_len=%d)", err, len(token))
			return fiber.NewError(http.StatusUnauthorized, fmt.Sprintf("Invalid Firebase ID token: %v", err))
		}

		// get-or-create DB user
		dbUser, err := auth.GetOrCreateDBUser(ctx, fbUser)
		if err != nil {
			log.Printf("GetOrCreateDBUser error: %v", err)
			return fiber.NewError(http.StatusInternalServerError, "Failed to load user profile")
		}

		return c.JSON(dbUser)
	})

	// OpenAPI spec for Swagger UI at /docs (frontend calls /openapi.json).
	app.Get("/openapi.json", func(c fiber.Ctx) error {
		// Try to find openapi.json in common locations
		// First try relative to current working directory, then relative to executable
		possiblePaths := []string{
			"openapi.json",
			"../../openapi.json",
			"../../../openapi.json",
		}

		// Also try relative to the source file location (for development)
		if _, filename, _, ok := runtime.Caller(0); ok {
			sourceDir := filepath.Dir(filename)
			possiblePaths = append(possiblePaths,
				filepath.Join(sourceDir, "../../openapi.json"),
			)
		}

		var specData []byte
		var err error
		for _, path := range possiblePaths {
			specData, err = os.ReadFile(path)
			if err == nil {
				break
			}
		}

		if err != nil {
			log.Printf("Failed to read openapi.json from any path: %v", err)
			return fiber.NewError(http.StatusInternalServerError, "Failed to load API specification")
		}

		c.Set("Content-Type", "application/json")
		return c.Send(specData)
	})

	// API routes
	api := app.Group("/api/v1")
	files := api.Group("/files", auth.APIKeyMiddleware())
	routes.RegisterFileRoutes(files, minioClient, minioCfg)

	// Frontend-style routes (no /api/v1 prefix) to match existing frontend/apiClient.ts
	projects := app.Group("/projects")
	routes.RegisterProjectRoutes(projects)

	apiKeys := app.Group("/api-keys")
	routes.RegisterAPIKeyRoutes(apiKeys)

	frontendAPIKeys := app.Group("/frontend/api-keys")
	routes.RegisterFrontendAPIKeyRoutes(frontendAPIKeys)

	usage := app.Group("/usage")
	routes.RegisterUsageRoutes(usage, minioClient, minioCfg)

	// Frontend file routes (Firebase auth) and public file-by-id download
	frontendFiles := app.Group("/frontend/files")
	routes.RegisterFrontendFileRoutes(frontendFiles, minioClient, minioCfg)

	// Public file routes with permissive CORS (allow all origins)
	publicFiles := app.Group("/files")
	publicFiles.Use(cors.New(cors.Config{
		AllowMethods:     []string{"GET", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: false,
		AllowOriginsFunc: func(origin string) bool { return true }, // Allow all origins
	}))
	routes.RegisterPublicFileRoutes(publicFiles, minioClient, minioCfg)

	log.Printf("Starting Go backend on :%s", appCfg.Port)

	if err := app.Listen(":" + appCfg.Port); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
