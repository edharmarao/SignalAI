# SignalAI Database Schema Documentation

**Last Updated:** 2026-06-28  
**Database:** stocks  
**Total Tables:** 34  
**DDL Location:** `sql/stocks_ddl.sql`

---

## Table of Contents

1. [Stock Data Tables (15)](#stock-data-tables)
2. [Options Data Tables (5)](#options-data-tables)
3. [Fundamentals Tables (3)](#fundamentals-tables)
4. [Symbol/Script Tables (5)](#symbolscript-tables)
5. [Trading Tables (3)](#trading-tables)
6. [System Tables (3)](#system-tables)

---

## Stock Data Tables

OHLCV (Open, High, Low, Close, Volume) candle data for various timeframes.

### Current Data Volume
| Table | Timeframe | Rows | Status |
|-------|-----------|------|--------|
| `stock_data_5min` | 5 minutes | 38,374,689 | ✅ Active |
| `stock_data_15min` | 15 minutes | 10,767,617 | ✅ Active |
| `stock_data_25min` | 25 minutes | 6,462,165 | ✅ Active |
| `stock_data_75min` | 75 minutes | 2,155,307 | ✅ Active |
| `stock_data_125min` | 125 minutes | 1,293,922 | ✅ Active |
| `stock_data_daily` | 1 day | 1,784,838 | ✅ Active |
| `stock_data_weekly` | 1 week | 530,422 | ✅ Active |
| `stock_data_monthly` | 1 month | 119,854 | ✅ Active |
| `stock_data_quarterly` | 1 quarter | 39,531 | ✅ Active |
| `stock_data_yearly` | 1 year | 9,700 | ✅ Active |
| `stock_data_1sec` | 1 second | 3,267 | 🔶 Limited |
| `stock_data_5sec` | 5 seconds | 982 | 🔶 Limited |
| `stock_data_1min` | 1 minute | 0 | ⚪ Empty |
| `stock_data_30min` | 30 minutes | 0 | ⚪ Empty |
| `stock_data_1hour` | 1 hour | 0 | ⚪ Empty |

### Schema Structure
All stock_data_* tables follow the same schema:

```sql
CREATE TABLE `stock_data_<timeframe>` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stock_code` VARCHAR(50) NOT NULL,
  `candle_time` DATETIME NOT NULL,
  `open` DECIMAL(12,4) NOT NULL,
  `high` DECIMAL(12,4) NOT NULL,
  `low` DECIMAL(12,4) NOT NULL,
  `close` DECIMAL(12,4) NOT NULL,
  `volume` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_<timeframe>` (`stock_code`, `candle_time`),
  KEY `idx_<timeframe>_code_time` (`stock_code`, `candle_time`)
) ENGINE=InnoDB;
```

**Total Stock Data Rows:** 61,542,294

---

## Options Data Tables

Options chain data for various timeframes (currently empty).

| Table | Timeframe | Rows | Status |
|-------|-----------|------|--------|
| `options_data_1sec` | 1 second | 0 | ⚪ Not in use |
| `options_data_1min` | 1 minute | 0 | ⚪ Not in use |
| `options_data_5min` | 5 minutes | 0 | ⚪ Not in use |
| `options_data_15min` | 15 minutes | 0 | ⚪ Not in use |
| `options_data_60min` | 60 minutes | 0 | ⚪ Not in use |

### Schema Structure
```sql
CREATE TABLE `options_data_<timeframe>` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stock_code` VARCHAR(50) NOT NULL,
  `candle_time` DATETIME NOT NULL,
  `open` DECIMAL(12,4),
  `high` DECIMAL(12,4),
  `low` DECIMAL(12,4),
  `close` DECIMAL(12,4),
  `volume` BIGINT,
  `oi` BIGINT,
  `strike_price` DECIMAL(12,2),
  `option_type` VARCHAR(10),
  `expiry_date` DATE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_<timeframe>` (`stock_code`, `candle_time`, `strike_price`, `option_type`, `expiry_date`)
) ENGINE=InnoDB;
```

---

## Fundamentals Tables

Yahoo Finance fundamentals data with **dual-currency support** (INR Crores + USD Millions).

| Table | Description | Rows | Last Updated |
|-------|-------------|------|--------------|
| `fundamentals_info` | Company info, ratios, market cap | 13 | 2026-06-28 |
| `fundamentals_quarterly` | Quarterly financials | 46 | 2026-06-28 |
| `fundamentals_yearly` | Annual financials | 36 | 2026-06-28 |

### Features

✅ **Dual Currency Storage**
- INR values in Crores (1 Cr = 10 Million)
- USD values in Millions (1 M = 1,000,000)
- Auto-detects company reporting currency (USD vs INR)

✅ **Data Coverage**
- Company profile (name, sector, industry)
- Market metrics (market cap, enterprise value)
- Financial statements (revenue, profit, cash flow)
- Key ratios (P/E, P/B, ROE, debt-to-equity)
- Historical quarterly & yearly data

### fundamentals_info Schema
```sql
CREATE TABLE `fundamentals_info` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(50) NOT NULL,
  `exchange` VARCHAR(20) DEFAULT 'NSE',
  `currency` VARCHAR(10) DEFAULT 'INR',
  `company_name` VARCHAR(255),
  `sector` VARCHAR(100),
  `industry` VARCHAR(100),
  -- Market metrics (INR Crores)
  `market_cap` DECIMAL(15,1),
  `enterprise_value` DECIMAL(15,1),
  `total_revenue` DECIMAL(15,1),
  `ebitda` DECIMAL(15,1),
  `free_cashflow` DECIMAL(15,1),
  -- Market metrics (USD Millions)
  `market_cap_usd` DECIMAL(15,1),
  `enterprise_value_usd` DECIMAL(15,1),
  `total_revenue_usd` DECIMAL(15,1),
  `ebitda_usd` DECIMAL(15,1),
  `free_cashflow_usd` DECIMAL(15,1),
  -- Ratios (currency-independent)
  `trailing_pe` DECIMAL(10,2),
  `price_to_book` DECIMAL(10,2),
  `debt_to_equity` DECIMAL(10,2),
  `return_on_equity` DECIMAL(10,4),
  -- ... (44 columns total)
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol` (`symbol`)
) ENGINE=InnoDB;
```

### fundamentals_quarterly Schema
```sql
CREATE TABLE `fundamentals_quarterly` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(50) NOT NULL,
  `quarter_end_date` DATE NOT NULL,
  `currency` VARCHAR(10) DEFAULT 'INR',
  -- Income statement (INR Crores + USD Millions)
  `total_revenue` DECIMAL(15,1),
  `total_revenue_usd` DECIMAL(15,1),
  `net_income` DECIMAL(15,1),
  `net_income_usd` DECIMAL(15,1),
  `ebitda` DECIMAL(15,1),
  `ebitda_usd` DECIMAL(15,1),
  -- Balance sheet (INR Crores + USD Millions)
  `total_assets` DECIMAL(15,1),
  `total_assets_usd` DECIMAL(15,1),
  -- Cash flow (INR Crores + USD Millions)
  `operating_cashflow` DECIMAL(15,1),
  `operating_cashflow_usd` DECIMAL(15,1),
  -- ... (40 columns total)
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol_quarter` (`symbol`, `quarter_end_date`)
) ENGINE=InnoDB;
```

### Example Data

**INFY (Infosys - USD Reporter)**
```
Currency: USD
Market Cap:       ₹35,047,805.0 Cr  |  $4,222,627.1 M
Total Revenue:    ₹   167,311.0 Cr  |  $   20,158.0 M
Q1 2026 Revenue:  ₹    41,832.0 Cr  |  $    5,040.0 M
```

**RELIANCE (Reliance Industries - INR Reporter)**
```
Currency: INR
Market Cap:       ₹1,781,550.0 Cr  |  $214,644.6 M
Total Revenue:    ₹1,057,219.0 Cr  |  $127,375.8 M
Q4 2026 Revenue:  ₹  294,059.0 Cr  |  $ 35,428.8 M
```

---

## Symbol/Script Tables

Symbol master data from exchanges.

| Table | Exchange | Rows | Status |
|-------|----------|------|--------|
| `nse_eq_symbols` | NSE Equity | 750 | ✅ Active |
| `nse_symbol_indexes` | NSE Indexes | 750 | ✅ Active |
| `stocks_master` | Master List | 501 | ✅ Active |
| `BSE_EQ_SCRIPTS` | BSE Equity | 0 | ⚪ Empty |
| `BSE_FO_SCRIPTS` | BSE F&O | 0 | ⚪ Empty |
| `NSE_CD_SCRIPTS` | NSE Currency | 0 | ⚪ Empty |
| `NSE_FO_SCRIPTS` | NSE F&O | 0 | ⚪ Empty |

### nse_eq_symbols Schema
```sql
CREATE TABLE `nse_eq_symbols` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stock_code` VARCHAR(50) NOT NULL,
  `company_name` VARCHAR(255),
  `series` VARCHAR(10),
  `isin` VARCHAR(20),
  `face_value` DECIMAL(10,2),
  `industry` VARCHAR(100),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_code` (`stock_code`)
) ENGINE=InnoDB;
```

---

## Trading Tables

Order and trade execution tracking.

| Table | Description | Rows | Status |
|-------|-------------|------|--------|
| `strategies` | Strategy definitions | 3 | ✅ Active |
| `orders` | Order history | 12 | ✅ Active |
| `trades` | Trade executions | 0 | ⚪ Empty |

### strategies Schema
```sql
CREATE TABLE `strategies` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `strategy_json` TEXT NOT NULL,
  `is_active` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
```

### orders Schema
```sql
CREATE TABLE `orders` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `strategy_id` VARCHAR(36),
  `stock_code` VARCHAR(50) NOT NULL,
  `order_type` VARCHAR(20) NOT NULL,
  `quantity` INT NOT NULL,
  `price` DECIMAL(12,2),
  `status` VARCHAR(20) DEFAULT 'pending',
  `broker_order_id` VARCHAR(100),
  `executed_price` DECIMAL(12,2),
  `executed_quantity` INT,
  `executed_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
```

---

## System Tables

Application logs and metadata.

| Table | Description | Rows | Status |
|-------|-------------|------|--------|
| `logs` | Application logs | 0 | ⚪ Empty |

---

## Key Statistics

### Storage Summary
- **Total Tables:** 34
- **Total Rows:** 61,543,150+
- **Largest Table:** stock_data_5min (38M+ rows)
- **Active Tables:** 24
- **Empty Tables:** 10

### Data Distribution
- **Stock Data:** 61,542,294 rows (99.9%)
- **Symbols:** 2,001 rows (0.003%)
- **Fundamentals:** 95 rows (0.0001%)
- **Trading:** 15 rows (0.00002%)

### Timeframe Coverage
- **Intraday:** 5min, 15min, 25min, 75min, 125min
- **Daily+:** daily, weekly, monthly, quarterly, yearly
- **Real-time:** 1sec, 5sec (limited data)

---

## Recent Changes

### 2026-06-28: Dual-Currency Fundamentals Support
- ✅ Added 43 USD columns across fundamentals tables
- ✅ Auto-detection of USD vs INR reporting
- ✅ Exchange rate conversion (1 USD = 83 INR)
- ✅ Migration: `005_add_usd_columns.sql`

### Previous Updates
- Yahoo Finance API integration
- Fundamentals data in Crores format
- Rate limiting (1 sec between symbols)
- UPSERT support for data refresh

---

## API Endpoints

### Fundamentals API (`/api/v1/fundamentals`)
- `GET /` - List all symbols with fundamentals
- `GET /{symbol}` - Get symbol details with quarterly/yearly data
- `POST /fetch` - Fetch from Yahoo Finance and upsert
- `DELETE /{symbol}` - Delete fundamentals data

### Charts API (`/api/v1/charts`)
- `GET /symbols` - List NSE EQ symbols
- `GET /candles` - OHLCV candle data
- `GET /summary` - Latest price + 52-week range
- `POST /indicator-backtest` - Technical indicator backtesting

---

## Schema Files

- **DDL Export:** `sql/stocks_ddl.sql` (756 lines)
- **Migrations:** `backend/migrations/*.sql`
- **Test Results:** `backend/TEST_RESULTS_USD_INR.md`

---

## Next Steps

1. ✅ Schema documented and exported
2. 🔶 Populate BSE/NSE_FO script tables
3. 🔶 Enable options data collection
4. 🔶 Add more fundamentals symbols
5. 🔶 Implement trade execution logging

---

**Documentation Status:** ✅ Up to date  
**Schema Export Date:** 2026-06-28  
**Verified Against:** Production stocks database
