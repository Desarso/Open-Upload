package config

// AppConfig holds general application configuration.
type AppConfig struct {
	Port        string
	FrontendURL string
	DatabaseURL string
}

// GetAppConfig reads core app settings from the environment.
// It mirrors the Python backend defaults so the frontend and DB config
// can be reused without surprises.
func GetAppConfig() AppConfig {
	return AppConfig{
		Port:        GetEnv("PORT", "8080"),
		FrontendURL: GetEnv("FRONTEND_URL", ""),
		DatabaseURL: GetEnv("DATABASE_URL", "sqlite:///./db/database.db"),
	}
}
