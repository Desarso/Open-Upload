package auth

import (
	"context"
	"errors"
	"log"
	"os"
	"strings"
	"sync"

	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/option"
)

// FirebaseUser mirrors the Python FirebaseUser model used in the backend.
type FirebaseUser struct {
	UID   string
	Email string
	Roles []string
	Name  string
	Token string
}

var (
	fbOnce sync.Once
	fbApp  *firebase.App
	fbErr  error
)

// initFirebaseApp initializes the global Firebase app using a service account JSON.
// It expects FIREBASE_CREDENTIALS_PATH to point to a JSON file, similar to the
// Python backend's firebase_credentials.json.
func initFirebaseApp(ctx context.Context) (*firebase.App, error) {
	fbOnce.Do(func() {
		credsPath := os.Getenv("FIREBASE_CREDENTIALS_PATH")
		if credsPath == "" {
			fbErr = errors.New("FIREBASE_CREDENTIALS_PATH is not set")
			log.Printf("firebase: FIREBASE_CREDENTIALS_PATH is not set")
			return
		}

		log.Printf("firebase: initializing Firebase app with credentials file: %s", credsPath)

		app, err := firebase.NewApp(ctx, nil, option.WithCredentialsFile(credsPath))
		if err != nil {
			fbErr = err
			log.Printf("firebase: failed to initialize app with credentials %s: %v", credsPath, err)
			return
		}
		log.Printf("firebase: Firebase app initialized successfully with credentials %s", credsPath)
		fbApp = app
	})
	return fbApp, fbErr
}

// VerifyIDToken parses and verifies a Firebase ID token and returns a FirebaseUser.
func VerifyIDToken(ctx context.Context, idToken string) (*FirebaseUser, error) {
	app, err := initFirebaseApp(ctx)
	if err != nil {
		log.Printf("firebase: initFirebaseApp error: %v", err)
		return nil, err
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, err
	}

	token, err := client.VerifyIDToken(ctx, idToken)
	if err != nil {
		log.Printf("firebase: VerifyIDToken failed: %v", err)
		return nil, err
	}

	uid := token.UID
	email, _ := token.Claims["email"].(string)
	name, _ := token.Claims["name"].(string)

	var roles []string
	if rawRoles, ok := token.Claims["roles"]; ok {
		switch v := rawRoles.(type) {
		case []any:
			for _, r := range v {
				if s, ok := r.(string); ok {
					roles = append(roles, s)
				}
			}
		case []string:
			roles = v
		case string:
			if v != "" {
				roles = strings.Split(v, ",")
			}
		default:
			log.Printf("unexpected roles claim type: %T", rawRoles)
		}
	}

	return &FirebaseUser{
		UID:   uid,
		Email: email,
		Roles: roles,
		Name:  name,
		Token: idToken,
	}, nil
}
