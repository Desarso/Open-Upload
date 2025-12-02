package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

const userContextKey = "firebase_user"

// FirebaseAuthMiddleware validates the Bearer Firebase ID token and stores
// the FirebaseUser in the Fiber context (Locals) under userContextKey.
func FirebaseAuthMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			log.Printf("auth: missing Authorization header on %s %s", c.Method(), c.Path())
			return fiber.NewError(http.StatusUnauthorized, "Authorization header is required")
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			log.Printf("auth: malformed Authorization header on %s %s: %q", c.Method(), c.Path(), authHeader)
			return fiber.NewError(http.StatusUnauthorized, "Authorization header must be Bearer token")
		}

		token := parts[1]
		// Use context with timeout to prevent hanging on slow Firebase calls
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		user, err := VerifyIDToken(ctx, token)
		if err != nil {
			log.Printf("auth: FirebaseAuthMiddleware VerifyIDToken error on %s %s: %v (token_len=%d)", c.Method(), c.Path(), err, len(token))
			// Include the underlying error message in the response for easier debugging in dev.
			// Frontend will see this in the "detail" field.
			return fiber.NewError(http.StatusUnauthorized, fmt.Sprintf("Invalid Firebase ID token: %v", err))
		}

		// Store user in context for handlers
		c.Locals(userContextKey, user)
		return c.Next()
	}
}

// RequireRoles returns middleware that enforces the presence of one or more roles.
// It mimics the Python role_based_access(["whitelisted"]) behavior.
func RequireRoles(requiredRoles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		val := c.Locals(userContextKey)
		user, ok := val.(*FirebaseUser)
		if !ok || user == nil {
			return fiber.NewError(http.StatusUnauthorized, "User not authenticated")
		}

		// Developer role bypass
		if hasRole(user.Roles, "developer") {
			return c.Next()
		}

		for _, r := range requiredRoles {
			if !hasRole(user.Roles, r) {
				return fiber.NewError(http.StatusForbidden, "User does not have required role: "+r)
			}
		}

		return c.Next()
	}
}

// GetCurrentFirebaseUser retrieves the FirebaseUser from context.
func GetCurrentFirebaseUser(c fiber.Ctx) (*FirebaseUser, error) {
	val := c.Locals(userContextKey)
	user, ok := val.(*FirebaseUser)
	if !ok || user == nil {
		return nil, errors.New("firebase user not in context")
	}
	return user, nil
}

func hasRole(roles []string, r string) bool {
	for _, role := range roles {
		if role == r {
			return true
		}
	}
	return false
}
