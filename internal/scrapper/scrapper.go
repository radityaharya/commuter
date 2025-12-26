package scrapper

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"llm-router/internal/config"
	"llm-router/internal/store"

	"go.uber.org/zap"
)

type Scraper struct {
	config *config.Config
	store  *store.Store
	logger *zap.Logger
	client *http.Client
	mu     sync.RWMutex
}

func NewScraper(cfg *config.Config, s *store.Store, logger *zap.Logger) *Scraper {
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   60 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout: 60 * time.Second,
	}

	if cfg.Socks5Proxy != "" {
		proxyURL, err := url.Parse(cfg.Socks5Proxy)
		if err != nil {
			logger.Error("Invalid SOCKS5 proxy URL", zap.String("proxy", cfg.Socks5Proxy), zap.Error(err))
		} else {
			transport.Proxy = http.ProxyURL(proxyURL)
			logger.Info("Using SOCKS5 proxy", zap.String("proxy", cfg.Socks5Proxy))
		}
	}
	
	if cfg.KAIToken != "" {
		logger.Info("KAI Token configured", zap.Int("length", len(cfg.KAIToken)))
	} else {
		logger.Warn("KAI Token is missing or empty")
	}

	return &Scraper{
		config: cfg,
		store:  s,
		logger: logger,
		client: &http.Client{
			Transport: transport,
			Timeout:   120 * time.Second,
		},
	}
}

func (s *Scraper) Start() {
	// Check if we have data
	if s.store.HasStations() {
		s.logger.Info("Data exists, skipping initial sync")
	} else {
		s.logger.Info("No data found, performing initial sync")
		go s.SyncAll()
	}

	go s.scheduleDailySync()
}

func (s *Scraper) SyncAll() {
	// Prevent concurrent syncs
	if !s.mu.TryLock() {
		s.logger.Warn("Sync already in progress, skipping")
		return
	}
	defer s.mu.Unlock()

	s.syncStations()
	s.syncSchedules()
}

func (s *Scraper) scheduleDailySync() {
	for {
		now := time.Now()

		// Load Jakarta location
		// Using FixedZone as a fallback if IANA DB is missing on host,
		// but typically time.LoadLocation("Asia/Jakarta") works safely or returns UTC.
		// UTC+7 for WIB
		loc := time.FixedZone("Asia/Jakarta", 7*60*60)

		// Current time in Jakarta
		nowJakarta := now.In(loc)

		// Target: 5 AM today
		target := time.Date(nowJakarta.Year(), nowJakarta.Month(), nowJakarta.Day(), 5, 0, 0, 0, loc)

		// If 5 AM has passed, set target for tomorrow
		if nowJakarta.After(target) {
			target = target.Add(24 * time.Hour)
		}

		duration := target.Sub(nowJakarta)
		s.logger.Info("Scheduled next sync", zap.Duration("in", duration), zap.Time("target_jakarta", target))

		time.Sleep(duration)

		s.logger.Info("Executing scheduled sync")
		s.SyncAll()
	}
}

func (s *Scraper) runLoop() {
	// Deprecated in favor of scheduleDailySync
}

// Headers from user's successful browser request
// Headers from user's successful browser request
var commonHeaders = map[string]string{
	"User-Agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
	"Accept":             "application/json, text/javascript, */*; q=0.01",
	"Accept-Language":    "en-US,en;q=0.9,id;q=0.8,ko;q=0.7",
	"Connection":         "keep-alive",
	"Host":               "api-partner.krl.co.id",
	"Origin":             "https://commuterline.id",
	"Referer":            "https://commuterline.id/",
	"Sec-Ch-Ua":          "\"Microsoft Edge\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
	"Sec-Ch-Ua-Mobile":   "?0",
	"Sec-Ch-Ua-Platform": "\"Windows\"",
	"Sec-Fetch-Dest":     "empty",
	"Sec-Fetch-Mode":     "cors",
	"Sec-Fetch-Site":     "cross-site",
}

func (s *Scraper) updateSession() error {
	// No-op for now
	return nil
}

func (s *Scraper) fetch(url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	for k, v := range commonHeaders {
		req.Header.Set(k, v)
	}

	token := s.config.KAIToken
	if token != "" {
		if !strings.HasPrefix(token, "Bearer ") {
			token = "Bearer " + token
		}
		req.Header.Set("Authorization", token)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

func (s *Scraper) fetchWithPreflight(url string) ([]byte, error) {
	// 1. Send OPTIONS request
	reqOptions, err := http.NewRequest("OPTIONS", url, nil)
	if err != nil {
		return nil, err
	}

	for k, v := range commonHeaders {
		reqOptions.Header.Set(k, v)
	}
	reqOptions.Header.Set("Access-Control-Request-Method", "GET")
	reqOptions.Header.Set("Access-Control-Request-Headers", "authorization,content-type")

	respOptions, err := s.client.Do(reqOptions)
	if err != nil {
		s.logger.Warn("Preflight OPTIONS request failed", zap.Error(err))
		// Proceed anyway? TS throws error. Let's try to proceed but log warn.
	} else {
		defer respOptions.Body.Close()
		if respOptions.StatusCode < 200 || respOptions.StatusCode >= 300 {
			s.logger.Warn("Preflight OPTIONS returned non-200 status", zap.Int("status", respOptions.StatusCode))
		}
	}

	// 2. Send GET request
	return s.fetch(url)
}

func (s *Scraper) syncStations() {
	s.logger.Info("Syncing stations...")
	url := fmt.Sprintf("%s/krl-station", s.config.KRLEndpointBaseURL)
	data, err := s.fetch(url)
	if err != nil {
		s.logger.Error("Failed to fetch stations", zap.Error(err))
		return
	}

	var resp struct {
		Data []struct {
			StaID    string `json:"sta_id"`
			StaName  string `json:"sta_name"`
			GroupWil int    `json:"group_wil"`
			FgEnable int    `json:"fg_enable"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		s.logger.Error("Failed to unmarshal stations", zap.Error(err))
		return
	}

	var stations []store.Station
	for _, d := range resp.Data {
		// Filter WIL stations
		if len(d.StaID) >= 3 && d.StaID[:3] == "WIL" {
			continue
		}

		// Map group_wil to daop (0 -> 1)
		daop := d.GroupWil
		if daop == 0 {
			daop = 1
		}

		stations = append(stations, store.Station{
			UID:  fmt.Sprintf("st_krl_%s", d.StaID),
			ID:   d.StaID,
			Name: d.StaName,
			Type: store.StationTypeKRL,
			Metadata: store.Metadata{
				Active: true,
				Origin: store.Origin{
					FgEnable: d.FgEnable,
					Daop:     daop,
				},
			},
		})
	}

	// Add hardcoded stations from TS source
	// Bandara Soekarno Hatta
	stations = append(stations, store.Station{
		UID:  "st_krl_bst",
		ID:   "BST",
		Name: "BANDARA SOEKARNO HATTA",
		Type: "KRL",
		Metadata: store.Metadata{
			Active: true,
			Origin: store.Origin{FgEnable: 1, Daop: 1},
		},
	})
	// Cikampek
	stations = append(stations, store.Station{
		UID:  "st_krl_ckp",
		ID:   "CKP",
		Name: "CIKAMPEK",
		Type: "LOCAL",
		Metadata: store.Metadata{
			Active: true,
			Origin: store.Origin{FgEnable: 1, Daop: 1},
		},
	})
	// Purwakarta
	stations = append(stations, store.Station{
		UID:  "st_krl_pwk",
		ID:   "PWK",
		Name: "PURWAKARTA",
		Type: "LOCAL",
		Metadata: store.Metadata{
			Active: true,
			Origin: store.Origin{FgEnable: 1, Daop: 2},
		},
	})

	s.store.SetStations(stations)
	s.logger.Info("Synced stations", zap.Int("count", len(stations)))
}

func (s *Scraper) syncSchedules() {
	s.logger.Info("Syncing schedules...")
	stations := s.store.GetStations()

	// Create Name -> ID map for resolution
	stationNameMap := make(map[string]string)
	for _, st := range stations {
		stationNameMap[st.Name] = st.ID
	}

	var wg sync.WaitGroup
	// Limit concurrency - increased to 50 to speed up significantly
	sem := make(chan struct{}, 50)

	completed := 0
	var progressMu sync.Mutex
	total := len(stations)

	for _, st := range stations {
		wg.Add(1)
		go func(stationID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			s.syncScheduleForStation(stationID, stationNameMap)

			progressMu.Lock()
			completed++
			if completed%5 == 0 || completed == total {
				s.logger.Info("Schedule sync progress", zap.Int("completed", completed), zap.Int("total", total))
			}
			progressMu.Unlock()
		}(st.ID)
	}
	wg.Wait()
	s.logger.Info("Synced schedules completed")
}

func (s *Scraper) syncScheduleForStation(stationID string, stationNameMap map[string]string) {
	// s.logger.Debug("Fetching schedule", zap.String("station", stationID))
	url := fmt.Sprintf("%s/schedules?stationid=%s&timefrom=00:00&timeto=23:00", s.config.KRLEndpointBaseURL, stationID)
	data, err := s.fetchWithPreflight(url)
	if err != nil {
		// 404 is common for inactive stations, just log debug or warn
		s.logger.Warn("Failed to fetch schedule", zap.String("station", stationID), zap.Error(err))
		return
	}

	s.logger.Info("Fetched schedule", zap.String("station", stationID))
	s.logger.Debug("Fetched schedule data", zap.String("data", string(data)))

	var resp struct {
		Data []struct {
			TrainID   string `json:"train_id"`
			KaName    string `json:"ka_name"`
			RouteName string `json:"route_name"`
			Dest      string `json:"dest"`
			TimeEst   string `json:"time_est"`
			Color     string `json:"color"`
			DestTime  string `json:"dest_time"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}

	var schedules []store.Schedule
	for _, d := range resp.Data {
		// Parse route name to find Origin/Dest IDs
		parts := strings.Split(d.RouteName, "-")
		var originName, destName string
		if len(parts) >= 2 {
			originName = strings.TrimSpace(parts[0])
			destName = strings.TrimSpace(parts[1])
		} else {
			originName = d.RouteName
			destName = d.RouteName
		}

		originName = s.normalizeStationName(originName)
		destName = s.normalizeStationName(destName)

		// Find IDs from map
		originID := stationNameMap[originName]
		destID := stationNameMap[destName]

		schedules = append(schedules, store.Schedule{
			ID:                   fmt.Sprintf("sc_krl_%s_%s", stationID, d.TrainID),
			StationID:            stationID,
			StationOriginID:      originID,
			StationDestinationID: destID,
			TrainID:              d.TrainID,
			Line:                 d.KaName,
			Route:                d.RouteName,
			DepartsAt:            s.parseTime(d.TimeEst),
			ArrivesAt:            s.parseTime(d.DestTime),
			Metadata: store.ScheduleMetadata{
				Origin: store.ScheduleOrigin{
					Color: d.Color,
				},
			},
			UpdatedAt: time.Now(),
		})
	}
	s.store.SetSchedules(stationID, schedules)
	s.logger.Info("Saved schedules", zap.String("station", stationID), zap.Int("count", len(schedules)))
}

func (s *Scraper) parseTime(timeStr string) time.Time {
	// Assuming proper HH:mm format, append to today's date
	now := time.Now()
	parsed, err := time.Parse("15:04", timeStr)
	if err != nil {
		// Try HH:mm:ss
		parsed, err = time.Parse("15:04:05", timeStr)
		if err != nil {
			return time.Time{}
		}
	}
	return time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), parsed.Second(), 0, time.Local)
}

func (s *Scraper) normalizeStationName(name string) string {
	switch name {
	case "TANJUNGPRIUK":
		return "TANJUNG PRIOK"
	case "JAKARTAKOTA":
		return "JAKARTA KOTA"
	case "KAMPUNGBANDAN":
		return "KAMPUNG BANDAN"
	case "TANAHABANG":
		return "TANAH ABANG"
	case "PARUNGPANJANG":
		return "PARUNG PANJANG"
	case "BANDARASOEKARNOHATTA":
		return "BANDARA SOEKARNO HATTA"
	default:
		return name
	}
}
