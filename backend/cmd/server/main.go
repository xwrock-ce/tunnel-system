package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tunnel-system/backend/internal/analyzer"
	"tunnel-system/backend/internal/api"
	"tunnel-system/backend/internal/auth"
	"tunnel-system/backend/internal/config"
	"tunnel-system/backend/internal/db"
	"tunnel-system/backend/internal/service"
	"tunnel-system/backend/internal/ws"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(fmt.Errorf("load config: %w", err))
	}

	database, err := db.Open(cfg)
	if err != nil {
		panic(fmt.Errorf("open database: %w", err))
	}

	authManager := auth.NewManager(cfg.SecretKey, cfg.AccessTokenExpireMinutes)

	var analysisEngine analyzer.Interface
	switch cfg.AnalyzerMode {
	case "mock":
		analysisEngine = analyzer.NewMockAnalyzer()
	default:
		analysisEngine = analyzer.NewPythonAnalyzer(cfg)
	}

	hub := ws.NewHub()
	analysisService := service.NewAnalysisService(database, cfg, analysisEngine, hub)
	server := api.NewServer(cfg, database, authManager, analysisService, hub, analysisEngine)

	httpServer := &http.Server{
		Addr:              ":8000",
		Handler:           server.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		fmt.Printf("Starting %s v%s\n", cfg.AppName, cfg.AppVersion)
		fmt.Printf("Analyzer mode: %s\n", cfg.AnalyzerMode)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			panic(fmt.Errorf("listen and serve: %w", err))
		}
	}()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, syscall.SIGINT, syscall.SIGTERM)
	<-shutdownSignal

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
