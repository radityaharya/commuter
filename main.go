package main

import (
	"fmt"
	"net/http"
	"os"

	"llm-router/internal/config"
	"llm-router/internal/handler"
	"llm-router/internal/logging"
	"llm-router/internal/scrapper"
	"llm-router/internal/store"

	"go.uber.org/zap"
)

func main() {
	// Initialize command-line flags
	listeningPort := config.InitFlags()

	// Initialize the logger
	logger, err := logging.NewLogger("info") // Default to info
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	// Load the configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	// Override port if flag is set
	if listeningPort != 0 {
		cfg.ListeningPort = listeningPort
	}

	logger.Info("Starting Comuline API",
		zap.Int("port", cfg.ListeningPort),
		zap.String("krl_endpoint", cfg.KRLEndpointBaseURL),
	)

	// Initialize SQLite Store
	s, err := store.NewStore(cfg.DBPath)
	if err != nil {
		logger.Fatal("Failed to initialize store", zap.Error(err))
	}

	// Initialize and Start Scraper
	scr := scrapper.NewScraper(cfg, s, logger)
	scr.Start()

	// Initialize API Router/Handler
	h := handler.NewRouter(cfg, s, scr, logger)

	// Set up HTTP Handler
	mux := http.NewServeMux()

	// API Routes (Prefixed with /api)
	mux.HandleFunc("/api/v1/station", h.HandleStation)
	mux.HandleFunc("/api/v1/schedule/", h.HandleSchedule) // Trailing slash for path params
	mux.HandleFunc("/api/v1/route/", h.HandleRoute)       // Trailing slash for path params
	mux.HandleFunc("/api/v1/sync", h.HandleSync)

	// Health Check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Serve static files from web/dist (built frontend)
	// In development, run the Vite dev server separately
	webDir := "./web/dist"
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		webDir = "./web" // Fallback for development (though dist is preferred for prod)
	}

	fs := http.FileServer(http.Dir(webDir))
	// Strip prefix is tricky if we serve on root, but here we serve strict files if they exist,
	// or fallback to index.html for SPA routing.
	// Simple approach: Handle "/" with a custom closure that serves file or index
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If path start with /api, return 404 explicitly if not handled above
		if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
			http.NotFound(w, r)
			return
		}

		path := r.URL.Path
		fullPath := fmt.Sprintf("%s%s", webDir, path)

		// Check if file exists
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}

		// Serve index.html for all other non-API routes (SPA)
		http.ServeFile(w, r, fmt.Sprintf("%s/index.html", webDir))
	})

	// Start the server
	addr := fmt.Sprintf(":%d", cfg.ListeningPort)
	logger.Info("Server listening", zap.String("address", addr))
	if err := http.ListenAndServe(addr, enableCORS(mux)); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
