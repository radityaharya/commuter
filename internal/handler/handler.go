package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"llm-router/internal/config"
	"llm-router/internal/scrapper"
	"llm-router/internal/store"

	"go.uber.org/zap"
)

type Router struct {
	Config  *config.Config
	Store   *store.Store
	Scraper *scrapper.Scraper
	Logger  *zap.Logger
}

func NewRouter(cfg *config.Config, s *store.Store, scr *scrapper.Scraper, l *zap.Logger) *Router {
	return &Router{
		Config:  cfg,
		Store:   s,
		Scraper: scr,
		Logger:  l,
	}
}

func (router *Router) HandleStation(w http.ResponseWriter, r *http.Request) {
	stations := router.Store.GetStations()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"metadata": map[string]bool{"success": true},
		"data":     stations,
	})
}

func (router *Router) HandleSchedule(w http.ResponseWriter, r *http.Request) {
	// Extract station ID from URL path (assuming /api/v1/schedule/{id})
	stationID := strings.TrimPrefix(r.URL.Path, "/api/v1/schedule/")

	if stationID == "" {
		http.Error(w, "Station ID required", http.StatusBadRequest)
		return
	}

	// If stationID is not found, return empty list [] instead of null
	schedules := router.Store.GetSchedules(stationID)
	if schedules == nil {
		schedules = []store.Schedule{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"metadata": map[string]bool{"success": true},
		"data":     schedules,
	})
}

func (router *Router) HandleRoute(w http.ResponseWriter, r *http.Request) {
	trainID := strings.TrimPrefix(r.URL.Path, "/api/v1/route/")

	if trainID == "" {
		http.Error(w, "Train ID required", http.StatusBadRequest)
		return
	}

	schedules := router.Store.GetRoute(trainID)

	if len(schedules) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"metadata": map[string]bool{"success": true},
			"data":     []interface{}{},
		})
		return
	}

	// We need station names, so let's get all stations to lookup names
	// This is slightly inefficient but given station count is small (100+), it's fine for now.
	// A better way would be GetStation(id) but doing it in loop is worse (N+1).
	// Or we could cache this map in the Router or Store.
	// For now, let's just fetch all stations to build a map.
	stationList := router.Store.GetStations()
	stationMap := make(map[string]string)
	for _, st := range stationList {
		stationMap[st.ID] = st.Name
	}

	var routes []store.RouteStop
	for _, sch := range schedules {
		routes = append(routes, store.RouteStop{
			ID:          sch.ID,
			StationID:   sch.StationID,
			StationName: stationMap[sch.StationID],
			DepartsAt:   sch.DepartsAt,
			CreatedAt:   sch.UpdatedAt, // Use UpdatedAt as proxy
			UpdatedAt:   sch.UpdatedAt,
		})
	}

	first := schedules[0]
	last := schedules[len(schedules)-1]

	details := store.RouteDetail{
		TrainID:                trainID,
		Line:                   first.Line,
		Route:                  first.Route,
		StationOriginID:        first.StationOriginID,
		StationOriginName:      stationMap[first.StationOriginID],
		StationDestinationID:   first.StationDestinationID,
		StationDestinationName: stationMap[first.StationDestinationID],
		ArrivesAt:              last.ArrivesAt,
	}

	response := store.RouteData{
		Routes:  routes,
		Details: details,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"metadata": map[string]bool{"success": true},
		"data":     response,
	})
}

func (router *Router) HandleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	go router.Scraper.SyncAll()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"metadata": map[string]bool{"success": true},
		"data":     "Sync triggered",
	})
}
