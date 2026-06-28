# Sync API Usage Guide

## Endpoint: POST /api/v1/sync/symbols

Fetch Yahoo Finance fundamentals and sync to nse_eq_symbols table.

### What it does:
1. Fetches fundamentals from Yahoo Finance (company info, market cap, financials)
2. Updates `nse_eq_symbols` table with market cap and company data
3. Recalculates market cap rankings for all symbols
4. Updates index membership flags (NIFTY 50, 100, 500, etc.)
5. Assigns cap type (LARGE/MID/SMALL/MICRO)

### Rate Limit
- **1 symbol per second** (Yahoo Finance constraint)
- **Max 100 symbols per request**

---

## Test Examples

### 1. Sync Single Symbol
```bash
curl -X POST http://localhost:8003/api/v1/sync/symbols \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["TATAMOTORS"],
    "exchange": "NSE"
  }'
```

**Response:**
```json
{
  "total": 1,
  "fundamentals_fetched": 1,
  "fundamentals_failed": 0,
  "symbols_updated": 1,
  "cap_rankings_updated": true,
  "details": [
    {
      "symbol": "TATAMOTORS",
      "status": "updated",
      "updated": true,
      "market_cap": 345678.5
    }
  ]
}
```

---

### 2. Sync Multiple Symbols
```bash
curl -X POST http://localhost:8003/api/v1/sync/symbols \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["ASIANPAINT", "HINDUNILVR", "ITC"],
    "exchange": "NSE"
  }'
```

**Time:** ~3-4 seconds (3 symbols + delays)

---

### 3. Get Sync Status
```bash
curl http://localhost:8003/api/v1/sync/status
```

**Response:**
```json
{
  "total_symbols": 750,
  "symbols_with_market_cap": 16,
  "symbols_ranked": 16,
  "coverage_pct": 2.1,
  "market_cap_range": {
    "min": 127532.0,
    "max": 35047805.0
  },
  "cap_type_distribution": [
    {"cap_type": "LARGE", "count": 16}
  ],
  "index_coverage": {
    "nifty_50": 16,
    "nifty_100": 16,
    "nifty_500": 16,
    "midcap_150": 0,
    "smallcap_250": 0
  }
}
```

---

## Sync All 750 Symbols

### Option 1: Small Batches (Recommended)
```bash
# Batch 1: Top 50
curl -X POST http://localhost:8003/api/v1/sync/symbols \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "symbols": [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
    "LT", "BAJFINANCE", "MARUTI", "HCLTECH", "ASIANPAINT",
    "AXISBANK", "TITAN", "ULTRACEMCO", "SUNPHARMA", "WIPRO",
    "ONGC", "NTPC", "POWERGRID", "M&M", "TATAMOTORS",
    "NESTLEIND", "BAJAJFINSV", "ADANIENT", "JSWSTEEL", "TECHM"
  ],
  "exchange": "NSE"
}
EOF

# Wait ~30 seconds, then batch 2, etc.
```

### Option 2: Python Script (All at once)
```python
import requests
from db import db_query

# Get all symbols
symbols = db_query("SELECT symbol FROM nse_eq_symbols")
symbol_list = [s['symbol'] for s in symbols]

# Sync in batches of 50
batch_size = 50
for i in range(0, len(symbol_list), batch_size):
    batch = symbol_list[i:i+batch_size]
    
    response = requests.post(
        "http://localhost:8003/api/v1/sync/symbols",
        json={"symbols": batch, "exchange": "NSE"}
    )
    
    print(f"Batch {i//batch_size + 1}: {response.json()['symbols_updated']} updated")
    
    # Wait for next batch
    time.sleep(batch_size)  # 1 sec per symbol
```

**Total time:** ~750 seconds (12.5 minutes) for all 750 symbols

---

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `total` | int | Number of symbols requested |
| `fundamentals_fetched` | int | Successfully fetched from Yahoo |
| `fundamentals_failed` | int | Failed to fetch from Yahoo |
| `symbols_updated` | int | Updated in nse_eq_symbols |
| `cap_rankings_updated` | bool | Rankings recalculated |
| `details` | array | Per-symbol status |

### Detail Object
```json
{
  "symbol": "RELIANCE",
  "status": "updated",        // "updated", "no_fundamentals", "error"
  "updated": true,
  "market_cap": 1781550.0
}
```

---

## What Gets Updated

### fundamentals_info table
- Company profile (name, sector, industry)
- Market metrics (market cap, enterprise value)
- Financial data (revenue, EBITDA, cash flow)
- Ratios (P/E, P/B, ROE, D/E)
- **Dual currency:** INR (Crores) + USD (Millions)

### nse_eq_symbols table
- `market_cap` - Market cap in Crores
- `market_cap_rank` - Rank by market cap (1 = largest)
- `cap_type` - LARGE/MID/SMALL/MICRO
- `is_nifty_50` - NIFTY 50 member
- `is_nifty_100` - NIFTY 100 member
- `is_nifty_500` - NIFTY 500 member
- `is_nifty_midcap_150` - Midcap 150 member
- `is_nifty_smallcap_250` - Smallcap 250 member
- `company_name` - Updated if missing
- `industry` - Updated if missing

---

## Error Handling

### No Fundamentals Data
```json
{
  "symbol": "UNKNOWN",
  "status": "no_fundamentals",
  "updated": false
}
```

### Sync Error
```json
{
  "symbol": "ERROR",
  "status": "error",
  "updated": false,
  "error": "Error message here"
}
```

---

## Integration with Other APIs

### After Sync, Use:
```bash
# 1. List all large cap stocks
GET /api/v1/symbols?cap_type=LARGE

# 2. Get NIFTY 50 stocks
GET /api/v1/symbols?is_nifty_50=true

# 3. Compare symbols
GET /api/v1/symbols/compare?symbols=RELIANCE,TCS,INFY

# 4. Get fundamentals
GET /api/v1/fundamentals/RELIANCE
```

---

## Current Status (2026-06-28)

- ✅ API endpoint created
- ✅ Tested with 4 symbols successfully
- ✅ Rankings working correctly
- ✅ Index memberships updating
- 📊 **16/750 symbols synced** (2.1% coverage)
- ⏱️ Estimated time to sync all: ~12.5 minutes

---

## Next Steps

1. Run batch sync for top 100-200 symbols
2. Monitor for rate limiting issues
3. Set up periodic refresh (weekly/monthly)
4. Add sectoral index classifications (Bank, IT, etc.)
