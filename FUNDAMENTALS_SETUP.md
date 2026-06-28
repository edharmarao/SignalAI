# Fundamentals API - Quick Setup Guide

## What's New

✅ Yahoo Finance integration for NSE equity fundamentals  
✅ Company info, quarterly & yearly financials storage  
✅ Rate-limited API to avoid free Yahoo API issues  
✅ REST endpoints for fetch, retrieve, list, and delete  

## Quick Start

### 1. Install Dependencies

```bash
cd backend
source .venv/bin/activate  # or: .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### 2. Run Database Migration

```bash
cd migrations
python run_migration.py 003_create_fundamentals_tables.sql
```

This creates 3 tables:
- `fundamentals_info` - company info (market cap, PE, sector, etc.)
- `fundamentals_quarterly` - quarterly financials
- `fundamentals_yearly` - annual financials

### 3. Start API Server

```bash
cd ../..
npm run api
```

### 4. Test the API

**Fetch fundamentals for symbols:**
```bash
curl -X POST http://localhost:8003/api/v1/fundamentals/fetch \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["RELIANCE", "TCS"], "exchange": "NSE"}'
```

**Get stored data:**
```bash
curl http://localhost:8003/api/v1/fundamentals/RELIANCE
```

**List all symbols:**
```bash
curl http://localhost:8003/api/v1/fundamentals/
```

### 5. Run Test Script (Optional)

```bash
cd backend
python test_fundamentals.py
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/fundamentals/fetch` | Fetch & store for multiple symbols |
| GET | `/api/v1/fundamentals/{symbol}` | Get stored fundamentals |
| GET | `/api/v1/fundamentals/` | List all symbols |
| DELETE | `/api/v1/fundamentals/{symbol}` | Delete data for symbol |

## Rate Limiting

- 1 second delay between each symbol (free Yahoo API limit)
- Max 50 symbols per request
- For large batches, split into multiple requests with delays

## Files Created

```
backend/
├── requirements.txt                      # Added yfinance>=0.2.40
├── main.py                              # Registered fundamentals router
├── services/yahoo_fundamentals.py       # Core service logic
├── routers/fundamentals.py              # REST API endpoints
├── migrations/
│   ├── 003_create_fundamentals_tables.sql
│   └── run_migration.py
└── test_fundamentals.py                 # Test script

docs/
└── fundamentals_api.md                  # Full documentation
```

## Documentation

Full API documentation: `docs/fundamentals_api.md`

Interactive docs: `http://localhost:8003/docs` (Swagger UI)

## Next Steps

1. Fetch fundamentals for your watchlist symbols
2. Use the data for screening/filtering stocks
3. Build dashboards showing PE ratios, market cap, financials
4. Schedule periodic refresh (weekly/monthly)

## Notes

- Yahoo Finance updates daily after market close
- Some fields may be `null` if not available
- Re-running fetch updates existing data (UPSERT)
- Check `last_updated` timestamp to see data freshness
