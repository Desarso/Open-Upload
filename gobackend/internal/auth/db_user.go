package auth

import (
	"context"
	"database/sql"
	"time"

	"github.com/gabriel/open_upload_gobackend/internal/db"
)

// GetOrCreateDBUser retrieves a user from the database by Firebase UID, or creates
// one if it doesn't exist. This mirrors the Python backend's behavior where the
// first /me call creates the user record.
func GetOrCreateDBUser(ctx context.Context, fbUser *FirebaseUser) (*db.User, error) {
	conn, err := db.GetDB()
	if err != nil {
		return nil, err
	}

	var u db.User
	err = conn.QueryRowContext(ctx, `
		SELECT firebase_uid, email, created_at
		FROM user
		WHERE firebase_uid = ?
	`, fbUser.UID).Scan(&u.FirebaseUID, &u.Email, &u.CreatedAt)

	if err == nil {
		return &u, nil
	}

	if err != sql.ErrNoRows {
		return nil, err
	}

	// User doesn't exist, create it
	now := time.Now().UTC()
	if _, err := conn.ExecContext(ctx, `
		INSERT INTO user (firebase_uid, email, created_at)
		VALUES (?, ?, ?)
	`, fbUser.UID, fbUser.Email, now); err != nil {
		return nil, err
	}

	u.FirebaseUID = fbUser.UID
	u.Email = fbUser.Email
	u.CreatedAt = now

	return &u, nil
}
