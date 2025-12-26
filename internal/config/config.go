package config

import (
	"flag"
	"os"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

type Config struct {
	ListeningPort      int
	KRLEndpointBaseURL string
	KAIToken           string
	Socks5Proxy        string
	DBPath             string
	Logger             *zap.Logger
}

func LoadConfig() (*Config, error) {
	_ = godotenv.Load()

	port := 8080
	endpoint := os.Getenv("KRL_ENDPOINT_BASE_URL")
	if endpoint == "" {
		endpoint = "https://api-partner.krl.co.id/krl-webs/v1"
	}

	token := os.Getenv("KAI_TOKEN")
	proxy := os.Getenv("SOCKS5_PROXY")
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "comuline.db"
	}

	return &Config{
		ListeningPort:      port,
		KRLEndpointBaseURL: endpoint,
		KAIToken:           token,
		Socks5Proxy:        proxy,
		DBPath:             dbPath,
	}, nil
}

func InitFlags() int {
	listeningPort := flag.Int("port", 8080, "Listening port")
	flag.Parse()
	return *listeningPort
}
