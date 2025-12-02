package db

import "time"

// These structs mirror the Python SQLModel models in backend/models.py.
// We'll start with plain structs to be used with database/sql and add
// helpers/queries as we port each route.

type User struct {
	FirebaseUID string    `db:"firebase_uid" json:"firebase_uid"`
	Email       string    `db:"email" json:"email"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

type Project struct {
	ID              int64     `db:"id" json:"id"`
	Name            string    `db:"name" json:"name"`
	Description     *string   `db:"description" json:"description"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UserFirebaseUID string    `db:"user_firebase_uid" json:"user_firebase_uid"`
}

type ApiKey struct {
	ID              int64      `db:"id" json:"id"`
	Key             string     `db:"key" json:"key"`
	Name            string     `db:"name" json:"name"`
	IsActive        bool       `db:"is_active" json:"is_active"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	LastUsedAt      *time.Time `db:"last_used_at" json:"last_used_at"`
	UserFirebaseUID string     `db:"user_firebase_uid" json:"user_firebase_uid"`
	ProjectID       int64      `db:"project_id" json:"project_id"`
}

type ApiUsage struct {
	ID              int64     `db:"id" json:"id"`
	Timestamp       time.Time `db:"timestamp" json:"timestamp"`
	Endpoint        string    `db:"endpoint" json:"endpoint"`
	ResponseTimeMs  float64   `db:"response_time" json:"response_time"`
	StatusCode      int       `db:"status_code" json:"status_code"`
	UserFirebaseUID string    `db:"user_firebase_uid" json:"user_firebase_uid"`
	ProjectID       int64     `db:"project_id" json:"project_id"`
	ApiKeyID        int64     `db:"api_key_id" json:"api_key_id"`
}

type File struct {
	ID              string    `db:"id" json:"id"`
	Filename        string    `db:"filename" json:"filename"`
	Size            int64     `db:"size" json:"size"`
	MimeType        string    `db:"mime_type" json:"mime_type"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	ProjectID       int64     `db:"project_id" json:"project_id"`
	UserFirebaseUID string    `db:"user_firebase_uid" json:"user_firebase_uid"`
	StoragePath     string    `db:"storage_path" json:"storage_path"`
	ContentHash     string    `db:"content_hash" json:"content_hash"`
}
