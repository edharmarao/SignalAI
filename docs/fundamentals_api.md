# Fundamentals API - Yahoo Finance Integration

## Overview

The Fundamentals API fetches fundamental data from Yahoo Finance for NSE equity symbols and stores it in MySQL. It provides company info, quarterly financials, and annual financials.

## Features

- ✅ Fetches data for single or multiple symbols
- ✅ Rate limiting to avoid free API concurrency issues (1 sec delay between symbols)
- ✅ Stores company info, quarterly, and yearly financials
- ✅ Auto-updates existing data (UPSERT logic)
- ✅ Comprehensive financial metrics (PE ratio, market cap, revenue, cashflow, etc.)

## Database Tables

### `fundamentals_info`
Static/semi-static company information:
- Company name, sector, industry
- Market cap, enterprise value
- PE ratios, PEG ratio, price multiples
- 52-week high/low, moving averages
- Share structure, insider/institutional holdings
- Profitability ratios (ROA, ROE, profit margins)
- Balance sheet ratios (current ratio, debt-to-equity)

### `fundamentals_quarterly`
Quarterly financial statements:
- Income statement (revenue, profit, EBITDA, EPS)
- Balance sheet (assets, liabilities, equity, debt)
- Cashflow (operating, investing, financing, free cashflow)

### `fundamentals_yearly`
Annual financial statements (same structure as quarterly)

## API Endpoints

### 1. Fetch Fundamentals

**Endpoint:** `POST /api/v1/fundamentals/fetch`

Fetch and store fundamentals data for one or multiple symbols.

**Request Body:**
```json
{
  "symbols": ["RELIANCE", "TCS", "INFY"],
  "exchange": "NSE"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Successfully fetched and stored fundamentals for all 3 symbols",
  "total": 3,
  "success": 3,
  "failed": 0,
  "details": [
    {
      "symbol": "RELIANCE",
      "status": "success",
      "info_stored": true,
      "quarterly_periods": 8,
      "yearly_periods": 5
    },
    {
      "symbol": "TCS",
      "status": "success",
      "info_stored": true,
      "quarterly_periods": 8,
      "yearly_periods": 5
    },
    {
      "symbol": "INFY",
      "status": "success",
      "info_stored": true,
      "quarterly_periods": 8,
      "yearly_periods": 5
    }
  ]
}
```

**Rate Limiting:**
- Sequential processing with 1 second delay between symbols
- Max 50 symbols per request

### 2. Get Fundamentals

**Endpoint:** `GET /api/v1/fundamentals/{symbol}`

Retrieve stored fundamentals data for a specific symbol.

**Query Parameters:**
- `quarterly_limit` (optional, default: 8) - Number of quarterly periods
- `yearly_limit` (optional, default: 5) - Number of yearly periods

**Example:**
```
GET /api/v1/fundamentals/RELIANCE?quarterly_limit=8&yearly_limit=5
```

**Response:**
```json
{
  "symbol": "RELIANCE",
  "info": {
    "symbol": "RELIANCE",
    "company_name": "Reliance Industries Limited",
    "sector": "Energy",
    "industry": "Oil & Gas Refining & Marketing",
    "market_cap": 17500000000000,
    "trailing_pe": 25.3,
    "forward_pe": 22.1,
    "price_to_book": 2.5,
    "dividend_yield": 0.0035,
    "return_on_equity": 0.089,
    "debt_to_equity": 45.2,
    "last_updated": "2026-06-28T10:30:00"
  },
  "quarterly": [
    {
      "symbol": "RELIANCE",
      "quarter_end_date": "2026-03-31",
      "total_revenue": 2250000000000,
      "net_income": 180000000000,
      "eps_diluted": 26.5,
      "operating_cashflow": 200000000000
    }
  ],
  "yearly": [
    {
      "symbol": "RELIANCE",
      "fiscal_year_end": "2025-03-31",
      "total_revenue": 9100000000000,
      "net_income": 720000000000,
      "eps_diluted": 106.2
    }
  ]
}
```

### 3. List Symbols

**Endpoint:** `GET /api/v1/fundamentals/`

List all symbols that have fundamentals data stored.

**Response:**
```json
{
  "total": 150,
  "symbols": [
    {
      "symbol": "RELIANCE",
      "company_name": "Reliance Industries Limited",
      "sector": "Energy",
      "industry": "Oil & Gas Refining & Marketing",
      "market_cap": 17500000000000,
      "last_updated": "2026-06-28T10:30:00"
    }
  ]
}
```

### 4. Delete Fundamentals

**Endpoint:** `DELETE /api/v1/fundamentals/{symbol}`

Delete all fundamentals data for a symbol.

**Example:**
```
DELETE /api/v1/fundamentals/RELIANCE
```

**Response:**
```json
{
  "status": "success",
  "message": "Deleted all fundamentals data for RELIANCE"
}
```

## Setup & Installation

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs `yfinance>=0.2.40` along with other dependencies.

### 2. Run Database Migration

```bash
cd backend/migrations
python run_migration.py 003_create_fundamentals_tables.sql
```

This creates the three fundamentals tables.

### 3. Start the API

```bash
cd ../..
npm run api
```

The fundamentals endpoints will be available at `http://localhost:8003/api/v1/fundamentals/`

## Usage Examples

### Fetch data for multiple symbols

```bash
curl -X POST http://localhost:8003/api/v1/fundamentals/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
    "exchange": "NSE"
  }'
```

### Get fundamentals for one symbol

```bash
curl http://localhost:8003/api/v1/fundamentals/RELIANCE
```

### List all symbols with data

```bash
curl http://localhost:8003/api/v1/fundamentals/
```

## Rate Limiting Strategy

To avoid hitting Yahoo Finance free API limits:

1. **Sequential processing** - symbols are processed one at a time
2. **1 second delay** between each symbol fetch
3. **Max 50 symbols** per request
4. **Async/await with thread pool** - blocking yfinance calls run in background threads

For large batches (100+ symbols), split into multiple requests with delays:

```python
import requests
import time

symbols = ["SYM1", "SYM2", ..., "SYM100"]
batch_size = 20

for i in range(0, len(symbols), batch_size):
    batch = symbols[i:i+batch_size]
    response = requests.post(
        "http://localhost:8003/api/v1/fundamentals/fetch",
        json={"symbols": batch, "exchange": "NSE"}
    )
    print(f"Batch {i//batch_size + 1}: {response.json()}")
    
    # Delay between batches
    if i + batch_size < len(symbols):
        time.sleep(30)  # 30 sec between batches
```

## Data Freshness

- Yahoo Finance data is typically updated daily after market close
- Re-running fetch for the same symbol updates existing data (UPSERT)
- Check `last_updated` timestamp in `fundamentals_info` to see when data was last fetched
- Recommended: refresh data weekly or monthly for portfolio tracking

## Error Handling

The API handles various error scenarios:

- **Symbol not found on Yahoo Finance** - returns failed status with error message
- **Network timeout** - continues with remaining symbols
- **Invalid data format** - skips problematic fields, stores what's available
- **Database errors** - rolls back transaction, returns error response

## Notes

- Yahoo Finance symbol format for NSE: `SYMBOL.NS` (e.g., `RELIANCE.NS`)
- The service automatically appends `.NS` suffix for NSE exchange
- Some fields may be `null` if not available from Yahoo Finance
- Quarterly/yearly data typically has 8 and 5 periods respectively

## API Documentation

Full interactive API docs available at:
- Swagger UI: `http://localhost:8003/docs`
- ReDoc: `http://localhost:8003/redoc`
