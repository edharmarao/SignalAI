# Fundamentals API - Crores Formatting Update

**Date:** 2026-06-28  
**Status:** ✅ Implemented and Tested

---

## Overview

All financial values in the Fundamentals API are now formatted in **Crores** with **single decimal precision** for easy readability in Indian financial context.

## What Changed

### Before (Raw values):
```json
{
  "market_cap": 17815499177984,
  "total_revenue": 2940590000000,
  "net_income": 169710000000
}
```

### After (Formatted in Crores):
```json
{
  "market_cap": 1781549.9,
  "total_revenue": 294059.0,
  "net_income": 16971.0
}
```

## Benefits

✅ **Easy to Read:** "294059.0 Cr" instead of "2940590000000"  
✅ **Consistent Units:** All values in same unit (Crores)  
✅ **Indian Context:** Crores/Lakhs format familiar to Indian investors  
✅ **Single Decimal:** Precise enough, not overwhelming  
✅ **API-Wide:** Applied to all endpoints

## Formatted Fields

All large financial numbers are converted to Crores:

### Company Info (`fundamentals_info`)
- market_cap
- enterprise_value
- shares_outstanding
- float_shares
- total_cash
- total_debt
- total_revenue
- gross_profits
- free_cashflow
- operating_cashflow
- ebitda

### Quarterly/Yearly Data
- total_revenue
- gross_profit
- operating_income
- net_income
- total_assets
- total_liabilities
- stockholders_equity
- current_assets
- current_liabilities
- cash_and_equivalents
- operating_cashflow
- investing_cashflow
- financing_cashflow
- capital_expenditure
- free_cashflow

## Examples

### Market Cap Display
```
RELIANCE     ₹1,781,549.9 Cr  (₹17.8 Lakh Crores)
HDFCBANK     ₹1,225,937.1 Cr  (₹12.3 Lakh Crores)
TCS          ₹758,314.9 Cr    (₹7.6 Lakh Crores)
```

### Revenue & Profit
```
Q4 2026 - RELIANCE:
  Revenue:     294,059.0 Cr
  Net Income:   16,971.0 Cr
  EPS:          ₹12.54
```

### Financial Metrics
```
TCS - Financial Health:
  Total Revenue:   267,021.0 Cr
  EBITDA:           70,438.0 Cr
  Free Cash Flow:   36,946.7 Cr
  Total Cash:       41,080.0 Cr
  Total Debt:       11,283.0 Cr
```

## API Response Format

### GET /api/v1/fundamentals/{symbol}

```json
{
  "symbol": "TCS",
  "info": {
    "company_name": "Tata Consultancy Services Limited",
    "market_cap": 758314.9,
    "total_revenue": 267021.0,
    "ebitda": 70438.0,
    "free_cashflow": 36946.7
  },
  "quarterly": [
    {
      "quarter_end_date": "2026-03-31",
      "total_revenue": 70698.0,
      "net_income": 13718.0,
      "total_assets": 1563080.0
    }
  ]
}
```

### GET /api/v1/fundamentals/

```json
{
  "total": 7,
  "symbols": [
    {
      "symbol": "RELIANCE",
      "company_name": "Reliance Industries Limited",
      "market_cap": 1781549.9
    }
  ]
}
```

## Implementation Details

### Conversion Formula
```
Crores = Value ÷ 10,000,000
Rounded to 1 decimal place
```

### Example Calculations
```
17,815,499,177,984 ÷ 10,000,000 = 1,781,549.9 Cr
2,940,590,000,000 ÷ 10,000,000 = 294,059.0 Cr
169,710,000,000 ÷ 10,000,000 = 16,971.0 Cr
```

### Display Recommendations

**For Market Cap:**
- If > 1,00,000 Cr → Display as "X.X Lakh Cr"
- Example: 1,781,549.9 Cr = 17.8 Lakh Cr

**For Revenue/Profit:**
- Display as "X.X Cr"
- Example: 294,059.0 Cr (Q4 Revenue)

**For Smaller Values:**
- Display as "X.X Cr"
- Example: 5.4 Cr, 125.3 Cr

## Reading the Values

### Understanding Scale
- **1 Crore** = 10 Million = 1,00,00,000
- **1 Lakh Crore** = 1 Trillion = 1,00,000 Crore

### Examples
- **294059.0 Cr** = ₹2,940.59 Billion = $35.4 Billion USD
- **17.8 Lakh Cr** = ₹17.8 Trillion = $214 Billion USD

## Migration Notes

- ✅ No database changes required
- ✅ Values stored in original format in DB
- ✅ Formatting applied only in API response
- ✅ Existing data works without re-fetch
- ✅ Backward compatible (field names unchanged)

## Testing

```bash
# List all symbols with formatted market cap
curl http://localhost:8003/api/v1/fundamentals/

# Get detailed fundamentals with all values formatted
curl http://localhost:8003/api/v1/fundamentals/RELIANCE
```

## Files Modified

- `backend/routers/fundamentals.py`
  - Added `format_to_crores()` helper function
  - Added `format_financials()` to apply formatting
  - Applied formatting in GET endpoints

---

**Status:** Production-ready ✅  
**All values now displayed in Crores with single decimal precision for maximum readability!**
