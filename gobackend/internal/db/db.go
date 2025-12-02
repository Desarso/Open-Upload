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
		// _busy_timeout: wait up to 5 seconds for locks to be released
		// _journal_mode=WAL: Write-Ahead Logging for better concurrency
		dsnWithParams := dsn + "?_busy_timeout=5000&_journal_mode=WAL"

		dbConn, dbErr = sql.Open("sqlite", dsnWithParams)
		if dbErr != nil {
			return
		}

		// Set connection pool settings
		dbConn.SetMaxOpenConns(1) // SQLite works best with single connection
		dbConn.SetMaxIdleConns(1)
		dbConn.SetConnMaxLifetime(0) // Keep connections alive

		if err := dbConn.Ping(); err != nil {
			dbErr = err
			return
		}

		log.Printf("Connected to database: %s", appCfg.DatabaseURL)
	})

	return dbConn, dbErr
}
