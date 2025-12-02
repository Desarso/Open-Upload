package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"

	"github.com/gabriel/open_upload_gobackend/internal/config"
)

var (
	dbOnce sync.Once
	dbConn *sql.DB
	dbErr  error
)

// GetDB returns a singleton *sql.DB connection using DATABASE_URL from config.
// For now we support SQLite URLs of the form sqlite:///./db/database.db (like Python).
func GetDB() (*sql.DB, error) {
	dbOnce.Do(func() {
		appCfg := config.GetAppConfig()

		// For now assume sqlite:///path; strip the scheme.
		dsn := appCfg.DatabaseURL
		const prefix = "sqlite:///"
		if len(dsn) >= len(prefix) && dsn[:len(prefix)] == prefix {
			dsn = dsn[len(prefix):]
		}

		// Ensure directory exists for SQLite file-based databases so that
		// the DB file can be created automatically if it doesn't exist.
		if dsn != "" && dsn != ":memory:" {
			dir := filepath.Dir(dsn)
			if dir != "" && dir != "." {
				if err := os.MkdirAll(dir, 0o755); err != nil {
					dbErr = err
					return
				}
			}
		}

		// Add SQLite connection parameters for better concurrency
		// _busy_timeout: wait up to 10 seconds for locks to be released
		// _journal_mode=WAL: Write-Ahead Logging for better concurrency
		// _foreign_keys=on: Enable foreign key constraints
		dsnWithParams := dsn + "?_busy_timeout=10000&_journal_mode=WAL&_foreign_keys=on"

		dbConn, dbErr = sql.Open("sqlite", dsnWithParams)
		if dbErr != nil {
			return
		}

		// Set connection pool settings for SQLite with WAL mode
		// WAL mode allows multiple readers and one writer concurrently
		dbConn.SetMaxOpenConns(25) // Allow multiple connections for WAL mode
		dbConn.SetMaxIdleConns(5)
		dbConn.SetConnMaxLifetime(0) // Keep connections alive

		if err := dbConn.Ping(); err != nil {
			dbErr = err
			return
		}

		log.Printf("Connected to database: %s", appCfg.DatabaseURL)
	})

	return dbConn, dbErr
}
