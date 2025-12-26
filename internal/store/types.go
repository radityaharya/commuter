package store

import (
	"time"
)

type StationType string

const (
	StationTypeKRL   StationType = "KRL"
	StationTypeLocal StationType = "LOCAL"
)

type Station struct {
	UID      string      `json:"uid"`
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Type     StationType `json:"type"`
	Metadata Metadata    `json:"metadata"`
}

type Metadata struct {
	Active bool   `json:"active"`
	Origin Origin `json:"origin"`
}

type Origin struct {
	FgEnable int `json:"fg_enable"`
	Daop     int `json:"daop"`
}

type Schedule struct {
	ID                   string           `json:"id"`
	StationID            string           `json:"station_id"`
	StationOriginID      string           `json:"station_origin_id"`
	StationDestinationID string           `json:"station_destination_id"`
	TrainID              string           `json:"train_id"`
	Line                 string           `json:"line"`
	Route                string           `json:"route"`
	DepartsAt            time.Time        `json:"departs_at"`
	ArrivesAt            time.Time        `json:"arrives_at"`
	Metadata             ScheduleMetadata `json:"metadata"`
	UpdatedAt            time.Time        `json:"updated_at"`
}

type ScheduleMetadata struct {
	Origin ScheduleOrigin `json:"origin"`
}

type ScheduleOrigin struct {
	Color string `json:"color"`
}

type RouteData struct {
	Routes  []RouteStop `json:"routes"`
	Details RouteDetail `json:"details"`
}

type RouteStop struct {
	ID          string    `json:"id"`
	StationID   string    `json:"station_id"`
	StationName string    `json:"station_name"`
	DepartsAt   time.Time `json:"departs_at"`
	CreatedAt   time.Time `json:"created_at"` // Not in DB, maybe derive?
	UpdatedAt   time.Time `json:"updated_at"`
}

type RouteDetail struct {
	TrainID                string    `json:"train_id"`
	Line                   string    `json:"line"`
	Route                  string    `json:"route"`
	StationOriginID        string    `json:"station_origin_id"`
	StationOriginName      string    `json:"station_origin_name"`
	StationDestinationID   string    `json:"station_destination_id"`
	StationDestinationName string    `json:"station_destination_name"`
	ArrivesAt              time.Time `json:"arrives_at"`
}
