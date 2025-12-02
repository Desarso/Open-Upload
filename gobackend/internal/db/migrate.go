package db

import (
	"context"
	"database/sql"
	"log"
	"strings"
)

// Migrate ensures the core tables exist in the SQLite database. It mirrors the
// Python SQLModel schema closely enough for the Go backend to function
// independently of the Python migrations.
func Migrate(ctx context.Context) error {
	conn, err := GetDB()
	if err != nil {
		return err
	}

	stmts := []string{
		// user table (Firebase UID as PK)
		`CREATE TABLE IF NOT EXISTS user (
			firebase_uid TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			created_at TIMESTAMP NOT NULL
		);`,

		// project table
		`CREATE TABLE IF NOT EXISTS project (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			created_at TIMESTAMP NOT NULL,
			user_firebase_uid TEXT NOT NULL,
			FOREIGN KEY (user_firebase_uid) REFERENCES user(firebase_uid)
		);`,

		// apikey table
		`CREATE TABLE IF NOT EXISTS apikey (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			key TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL,
			is_active BOOLEAN NOT NULL DEFAULT 1,
			created_at TIMESTAMP NOT NULL,
			last_used_at TIMESTAMP NULL,
			user_firebase_uid TEXT NOT NULL,
			project_id INTEGER NOT NULL,
			FOREIGN KEY (user_firebase_uid) REFERENCES user(firebase_uid),
			FOREIGN KEY (project_id) REFERENCES project(id)
		);`,

		// apiusage table
		`CREATE TABLE IF NOT EXISTS apiusage (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TIMESTAMP NOT NULL,
			endpoint TEXT NOT NULL,
			response_time REAL NOT NULL,
			status_code INTEGER NOT NULL,
			user_firebase_uid TEXT NOT NULL,
			project_id INTEGER NOT NULL,
			api_key_id INTEGER NOT NULL,
			FOREIGN KEY (user_firebase_uid) REFERENCES user(firebase_uid),
			FOREIGN KEY (project_id) REFERENCES project(id),
			FOREIGN KEY (api_key_id) REFERENCES apikey(id)
		);`,

		// file table
		`CREATE TABLE IF NOT EXISTS file (
			id TEXT PRIMARY KEY,
			filename TEXT NOT NULL,
			size INTEGER NOT NULL,
			mime_type TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			project_id INTEGER NOT NULL,
			user_firebase_uid TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			content_hash TEXT,
			FOREIGN KEY (project_id) REFERENCES project(id),
			FOREIGN KEY (user_firebase_uid) REFERENCES user(firebase_uid)
		);`,
	}

	for _, stmt := range stmts {
		if _, err := conn.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}

	// Add content_hash column to existing file tables (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
	// Check if column exists by querying pragma
	var columnExists bool
	rows, err := conn.QueryContext(ctx, `PRAGMA table_info(file)`)
	if err != nil {
		log.Printf("warning: failed to query table_info for file table: %v", err)
		// If we can't check, try to add the column anyway (it will fail gracefully if it exists)
		columnExists = false
	} else {
		defer rows.Close()
		for rows.Next() {
			var cid int
			var name string
			var dataType string
			var notNull int
			var defaultValue sql.NullString
			var pk int
			if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &pk); err == nil {
				if name == "content_hash" {
					columnExists = true
					break
				}
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("warning: error iterating table_info rows: %v", err)
		}
	}

	if !columnExists {
		if _, err := conn.ExecContext(ctx, `ALTER TABLE file ADD COLUMN content_hash TEXT`); err != nil {
			// Check if error is because column already exists (SQLite error code 1)
			if strings.Contains(err.Error(), "duplicate column") || strings.Contains(err.Error(), "already exists") {
				log.Printf("content_hash column already exists, skipping")
			} else {
				log.Printf("warning: failed to add content_hash column: %v", err)
			}
		} else {
			log.Printf("added content_hash column to file table")
		}
	}

	// Create index after ensuring column exists
	if _, err := conn.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_file_content_hash ON file(content_hash)`); err != nil {
		log.Printf("warning: failed to create index on content_hash: %v", err)
	}

	log.Printf("database migrations applied (tables ensured: user, project, apikey, apiusage, file)")
	return nil
}
