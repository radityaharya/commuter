package store

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Optimize SQLite settings
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		return nil, err
	}
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, err
	}
	if _, err := db.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		return nil, err
	}

	s := &Store{db: db}
	if err := s.InitDB(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to init database: %w", err)
	}
	return s, nil
}

func (s *Store) InitDB() error {
	const createStationTable = `
	CREATE TABLE IF NOT EXISTS stations (
		uid TEXT PRIMARY KEY,
		id TEXT,
		name TEXT,
		type TEXT,
		metadata JSON
	);
	CREATE INDEX IF NOT EXISTS idx_stations_id ON stations(id);
	`

	const createScheduleTable = `
	CREATE TABLE IF NOT EXISTS schedules (
		id TEXT PRIMARY KEY,
		station_id TEXT,
		station_origin_id TEXT,
		station_destination_id TEXT,
		train_id TEXT,
		line TEXT,
		route TEXT,
		departs_at DATETIME,
		arrives_at DATETIME,
		metadata JSON,
		updated_at DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_schedules_station_id ON schedules(station_id);
	`

	if _, err := s.db.Exec(createStationTable); err != nil {
		return err
	}
	if _, err := s.db.Exec(createScheduleTable); err != nil {
		return err
	}
	return nil
}

func (s *Store) HasStations() bool {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM stations").Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

func (s *Store) SetStations(stations []Station) {
	tx, err := s.db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	// Replace all stations
	if _, err := tx.Exec("DELETE FROM stations"); err != nil {
		return
	}

	stmt, err := tx.Prepare("INSERT INTO stations (uid, id, name, type, metadata) VALUES (?, ?, ?, ?, ?)")
	if err != nil {
		return
	}
	defer stmt.Close()

	for _, st := range stations {
		metaBytes, _ := json.Marshal(st.Metadata)
		_, err := stmt.Exec(st.UID, st.ID, st.Name, st.Type, metaBytes)
		if err != nil {
			continue
		}
	}

	tx.Commit()
}

func (s *Store) GetStations() []Station {
	rows, err := s.db.Query("SELECT uid, id, name, type, metadata FROM stations")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var stations []Station
	for rows.Next() {
		var st Station
		var metaBytes []byte
		if err := rows.Scan(&st.UID, &st.ID, &st.Name, &st.Type, &metaBytes); err != nil {
			continue
		}
		json.Unmarshal(metaBytes, &st.Metadata)
		stations = append(stations, st)
	}
	return stations
}

func (s *Store) GetStation(id string) (Station, bool) {
	row := s.db.QueryRow("SELECT uid, id, name, type, metadata FROM stations WHERE id = ?", id)
	var st Station
	var metaBytes []byte
	if err := row.Scan(&st.UID, &st.ID, &st.Name, &st.Type, &metaBytes); err != nil {
		return Station{}, false
	}
	json.Unmarshal(metaBytes, &st.Metadata)
	return st, true
}

func (s *Store) SetSchedules(stationID string, schedules []Schedule) {
	tx, err := s.db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	// Clear schedules for this station
	if _, err := tx.Exec("DELETE FROM schedules WHERE station_id = ?", stationID); err != nil {
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO schedules (
			id, station_id, station_origin_id, station_destination_id, 
			train_id, line, route, departs_at, arrives_at, metadata, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return
	}
	defer stmt.Close()

	for _, sch := range schedules {
		metaBytes, _ := json.Marshal(sch.Metadata)
		_, err := stmt.Exec(
			sch.ID, sch.StationID, sch.StationOriginID, sch.StationDestinationID,
			sch.TrainID, sch.Line, sch.Route, sch.DepartsAt, sch.ArrivesAt, metaBytes, sch.UpdatedAt,
		)
		if err != nil {
			continue
		}
	}

	tx.Commit()
}

func (s *Store) GetSchedules(stationID string) []Schedule {
	rows, err := s.db.Query(`
		SELECT id, station_id, station_origin_id, station_destination_id, 
			   train_id, line, route, departs_at, arrives_at, metadata, updated_at 
		FROM schedules WHERE station_id = ?
		ORDER BY departs_at ASC`, stationID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var sch Schedule
		var metaBytes []byte
		if err := rows.Scan(
			&sch.ID, &sch.StationID, &sch.StationOriginID, &sch.StationDestinationID,
			&sch.TrainID, &sch.Line, &sch.Route, &sch.DepartsAt, &sch.ArrivesAt, &metaBytes, &sch.UpdatedAt,
		); err != nil {
			continue
		}
		json.Unmarshal(metaBytes, &sch.Metadata)
		schedules = append(schedules, sch)
	}
	return schedules
}

func (s *Store) GetAllSchedules() map[string][]Schedule {
	rows, err := s.db.Query(`
		SELECT id, station_id, station_origin_id, station_destination_id, 
			   train_id, line, route, departs_at, arrives_at, metadata, updated_at 
		FROM schedules`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	res := make(map[string][]Schedule)
	for rows.Next() {
		var sch Schedule
		var metaBytes []byte
		if err := rows.Scan(
			&sch.ID, &sch.StationID, &sch.StationOriginID, &sch.StationDestinationID,
			&sch.TrainID, &sch.Line, &sch.Route, &sch.DepartsAt, &sch.ArrivesAt, &metaBytes, &sch.UpdatedAt,
		); err != nil {
			continue
		}
		json.Unmarshal(metaBytes, &sch.Metadata)
		res[sch.StationID] = append(res[sch.StationID], sch)
	}
	return res
}

func (s *Store) GetRoute(trainID string) []Schedule {
	rows, err := s.db.Query(`
		SELECT id, station_id, station_origin_id, station_destination_id, 
			   train_id, line, route, departs_at, arrives_at, metadata, updated_at 
		FROM schedules WHERE train_id = ?
		ORDER BY departs_at ASC`, trainID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var sch Schedule
		var metaBytes []byte
		if err := rows.Scan(
			&sch.ID, &sch.StationID, &sch.StationOriginID, &sch.StationDestinationID,
			&sch.TrainID, &sch.Line, &sch.Route, &sch.DepartsAt, &sch.ArrivesAt, &metaBytes, &sch.UpdatedAt,
		); err != nil {
			continue
		}
		json.Unmarshal(metaBytes, &sch.Metadata)
		schedules = append(schedules, sch)
	}
	return schedules
}
