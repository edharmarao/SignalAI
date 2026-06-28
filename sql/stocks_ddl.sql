-- Stocks Database Schema Export
-- Generated: 2026-06-28
-- Total Tables: 34
-- ============================================

-- Table: BSE_EQ_SCRIPTS
CREATE TABLE `BSE_EQ_SCRIPTS` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(20) NOT NULL,
  `short_name` varchar(100) DEFAULT NULL,
  `series` varchar(10) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `tick_size` decimal(10,4) DEFAULT NULL,
  `lot_size` int DEFAULT NULL,
  `isin_code` varchar(20) DEFAULT NULL,
  `fifty_two_weeks_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_weeks_low` decimal(12,2) DEFAULT NULL,
  `life_time_high` decimal(12,2) DEFAULT NULL,
  `life_time_low` decimal(12,2) DEFAULT NULL,
  `warning_percent` decimal(5,2) DEFAULT NULL,
  `freeze_percent` decimal(5,2) DEFAULT NULL,
  `exchange_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`token`),
  KEY `idx_short_name` (`short_name`),
  KEY `idx_series` (`series`),
  KEY `idx_exchange_code` (`exchange_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: BSE_FO_SCRIPTS
CREATE TABLE `BSE_FO_SCRIPTS` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(20) NOT NULL,
  `short_name` varchar(100) DEFAULT NULL,
  `series` varchar(10) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `tick_size` decimal(10,4) DEFAULT NULL,
  `lot_size` int DEFAULT NULL,
  `isin_code` varchar(20) DEFAULT NULL,
  `fifty_two_weeks_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_weeks_low` decimal(12,2) DEFAULT NULL,
  `life_time_high` decimal(12,2) DEFAULT NULL,
  `life_time_low` decimal(12,2) DEFAULT NULL,
  `warning_percent` decimal(5,2) DEFAULT NULL,
  `freeze_percent` decimal(5,2) DEFAULT NULL,
  `exchange_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`token`),
  KEY `idx_short_name` (`short_name`),
  KEY `idx_series` (`series`),
  KEY `idx_exchange_code` (`exchange_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: NSE_CD_SCRIPTS
CREATE TABLE `NSE_CD_SCRIPTS` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(20) NOT NULL,
  `short_name` varchar(100) DEFAULT NULL,
  `series` varchar(10) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `tick_size` decimal(10,4) DEFAULT NULL,
  `lot_size` int DEFAULT NULL,
  `isin_code` varchar(20) DEFAULT NULL,
  `fifty_two_weeks_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_weeks_low` decimal(12,2) DEFAULT NULL,
  `life_time_high` decimal(12,2) DEFAULT NULL,
  `life_time_low` decimal(12,2) DEFAULT NULL,
  `warning_percent` decimal(5,2) DEFAULT NULL,
  `freeze_percent` decimal(5,2) DEFAULT NULL,
  `exchange_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`token`),
  KEY `idx_short_name` (`short_name`),
  KEY `idx_series` (`series`),
  KEY `idx_exchange_code` (`exchange_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: NSE_FO_SCRIPTS
CREATE TABLE `NSE_FO_SCRIPTS` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(20) NOT NULL,
  `short_name` varchar(100) DEFAULT NULL,
  `series` varchar(10) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `tick_size` decimal(10,4) DEFAULT NULL,
  `lot_size` int DEFAULT NULL,
  `isin_code` varchar(20) DEFAULT NULL,
  `fifty_two_weeks_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_weeks_low` decimal(12,2) DEFAULT NULL,
  `life_time_high` decimal(12,2) DEFAULT NULL,
  `life_time_low` decimal(12,2) DEFAULT NULL,
  `warning_percent` decimal(5,2) DEFAULT NULL,
  `freeze_percent` decimal(5,2) DEFAULT NULL,
  `exchange_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`token`),
  KEY `idx_short_name` (`short_name`),
  KEY `idx_series` (`series`),
  KEY `idx_exchange_code` (`exchange_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: fundamentals_info
CREATE TABLE `fundamentals_info` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(50) NOT NULL,
  `exchange` varchar(20) DEFAULT 'NSE',
  `currency` varchar(10) DEFAULT 'INR',
  `company_name` varchar(255) DEFAULT NULL,
  `sector` varchar(100) DEFAULT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `market_cap` bigint DEFAULT NULL,
  `market_cap_usd` decimal(15,1) DEFAULT NULL,
  `enterprise_value` bigint DEFAULT NULL,
  `enterprise_value_usd` decimal(15,1) DEFAULT NULL,
  `trailing_pe` decimal(10,2) DEFAULT NULL,
  `forward_pe` decimal(10,2) DEFAULT NULL,
  `peg_ratio` decimal(10,2) DEFAULT NULL,
  `price_to_book` decimal(10,2) DEFAULT NULL,
  `price_to_sales` decimal(10,2) DEFAULT NULL,
  `dividend_yield` decimal(10,4) DEFAULT NULL,
  `beta` decimal(10,4) DEFAULT NULL,
  `fifty_two_week_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_week_low` decimal(12,2) DEFAULT NULL,
  `fifty_day_average` decimal(12,2) DEFAULT NULL,
  `two_hundred_day_average` decimal(12,2) DEFAULT NULL,
  `shares_outstanding` bigint DEFAULT NULL,
  `float_shares` bigint DEFAULT NULL,
  `held_percent_insiders` decimal(10,4) DEFAULT NULL,
  `held_percent_institutions` decimal(10,4) DEFAULT NULL,
  `short_ratio` decimal(10,2) DEFAULT NULL,
  `book_value` decimal(12,2) DEFAULT NULL,
  `profit_margins` decimal(10,4) DEFAULT NULL,
  `return_on_assets` decimal(10,4) DEFAULT NULL,
  `return_on_equity` decimal(10,4) DEFAULT NULL,
  `revenue_growth` decimal(10,4) DEFAULT NULL,
  `earnings_growth` decimal(10,4) DEFAULT NULL,
  `current_ratio` decimal(10,2) DEFAULT NULL,
  `debt_to_equity` decimal(10,2) DEFAULT NULL,
  `quick_ratio` decimal(10,2) DEFAULT NULL,
  `total_cash` bigint DEFAULT NULL,
  `total_cash_usd` decimal(15,1) DEFAULT NULL,
  `total_debt` bigint DEFAULT NULL,
  `total_debt_usd` decimal(15,1) DEFAULT NULL,
  `total_revenue` bigint DEFAULT NULL,
  `total_revenue_usd` decimal(15,1) DEFAULT NULL,
  `gross_profits` bigint DEFAULT NULL,
  `gross_profits_usd` decimal(15,1) DEFAULT NULL,
  `free_cashflow` bigint DEFAULT NULL,
  `free_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `operating_cashflow` bigint DEFAULT NULL,
  `operating_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `ebitda` bigint DEFAULT NULL,
  `ebitda_usd` decimal(15,1) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `last_updated` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol` (`symbol`),
  KEY `idx_sector` (`sector`),
  KEY `idx_industry` (`industry`),
  KEY `idx_market_cap` (`market_cap`),
  KEY `idx_last_updated` (`last_updated`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: fundamentals_quarterly
CREATE TABLE `fundamentals_quarterly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(50) NOT NULL,
  `quarter_end_date` date NOT NULL,
  `currency` varchar(10) DEFAULT 'INR',
  `total_revenue` bigint DEFAULT NULL,
  `total_revenue_usd` decimal(15,1) DEFAULT NULL,
  `gross_profit` bigint DEFAULT NULL,
  `gross_profit_usd` decimal(15,1) DEFAULT NULL,
  `operating_income` bigint DEFAULT NULL,
  `operating_income_usd` decimal(15,1) DEFAULT NULL,
  `net_income` bigint DEFAULT NULL,
  `net_income_usd` decimal(15,1) DEFAULT NULL,
  `ebitda` bigint DEFAULT NULL,
  `ebitda_usd` decimal(15,1) DEFAULT NULL,
  `eps_basic` decimal(12,4) DEFAULT NULL,
  `eps_diluted` decimal(12,4) DEFAULT NULL,
  `total_assets` bigint DEFAULT NULL,
  `total_assets_usd` decimal(15,1) DEFAULT NULL,
  `total_liabilities` bigint DEFAULT NULL,
  `total_liabilities_usd` decimal(15,1) DEFAULT NULL,
  `stockholders_equity` bigint DEFAULT NULL,
  `stockholders_equity_usd` decimal(15,1) DEFAULT NULL,
  `total_debt` bigint DEFAULT NULL,
  `total_debt_usd` decimal(15,1) DEFAULT NULL,
  `current_assets` bigint DEFAULT NULL,
  `current_assets_usd` decimal(15,1) DEFAULT NULL,
  `current_liabilities` bigint DEFAULT NULL,
  `current_liabilities_usd` decimal(15,1) DEFAULT NULL,
  `cash_and_equivalents` bigint DEFAULT NULL,
  `cash_and_equivalents_usd` decimal(15,1) DEFAULT NULL,
  `operating_cashflow` bigint DEFAULT NULL,
  `operating_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `investing_cashflow` bigint DEFAULT NULL,
  `investing_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `financing_cashflow` bigint DEFAULT NULL,
  `financing_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `free_cashflow` bigint DEFAULT NULL,
  `free_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `capital_expenditure` bigint DEFAULT NULL,
  `capital_expenditure_usd` decimal(15,1) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol_quarter` (`symbol`,`quarter_end_date`),
  KEY `idx_symbol` (`symbol`),
  KEY `idx_quarter_date` (`quarter_end_date`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: fundamentals_yearly
CREATE TABLE `fundamentals_yearly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `symbol` varchar(50) NOT NULL,
  `fiscal_year_end` date NOT NULL,
  `currency` varchar(10) DEFAULT 'INR',
  `total_revenue` bigint DEFAULT NULL,
  `total_revenue_usd` decimal(15,1) DEFAULT NULL,
  `gross_profit` bigint DEFAULT NULL,
  `gross_profit_usd` decimal(15,1) DEFAULT NULL,
  `operating_income` bigint DEFAULT NULL,
  `operating_income_usd` decimal(15,1) DEFAULT NULL,
  `net_income` bigint DEFAULT NULL,
  `net_income_usd` decimal(15,1) DEFAULT NULL,
  `ebitda` bigint DEFAULT NULL,
  `ebitda_usd` decimal(15,1) DEFAULT NULL,
  `eps_basic` decimal(12,4) DEFAULT NULL,
  `eps_diluted` decimal(12,4) DEFAULT NULL,
  `total_assets` bigint DEFAULT NULL,
  `total_assets_usd` decimal(15,1) DEFAULT NULL,
  `total_liabilities` bigint DEFAULT NULL,
  `total_liabilities_usd` decimal(15,1) DEFAULT NULL,
  `stockholders_equity` bigint DEFAULT NULL,
  `stockholders_equity_usd` decimal(15,1) DEFAULT NULL,
  `total_debt` bigint DEFAULT NULL,
  `total_debt_usd` decimal(15,1) DEFAULT NULL,
  `current_assets` bigint DEFAULT NULL,
  `current_assets_usd` decimal(15,1) DEFAULT NULL,
  `current_liabilities` bigint DEFAULT NULL,
  `current_liabilities_usd` decimal(15,1) DEFAULT NULL,
  `cash_and_equivalents` bigint DEFAULT NULL,
  `cash_and_equivalents_usd` decimal(15,1) DEFAULT NULL,
  `operating_cashflow` bigint DEFAULT NULL,
  `operating_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `investing_cashflow` bigint DEFAULT NULL,
  `investing_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `financing_cashflow` bigint DEFAULT NULL,
  `financing_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `free_cashflow` bigint DEFAULT NULL,
  `free_cashflow_usd` decimal(15,1) DEFAULT NULL,
  `capital_expenditure` bigint DEFAULT NULL,
  `capital_expenditure_usd` decimal(15,1) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol_year` (`symbol`,`fiscal_year_end`),
  KEY `idx_symbol` (`symbol`),
  KEY `idx_fiscal_year` (`fiscal_year_end`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: logs
CREATE TABLE `logs` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `strategy_id` varchar(36) DEFAULT NULL,
  `level` varchar(20) DEFAULT NULL,
  `message` text,
  `desk` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: nse_eq_symbols
CREATE TABLE `nse_eq_symbols` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_name` varchar(512) DEFAULT NULL,
  `industry` varchar(512) DEFAULT NULL,
  `symbol` varchar(512) NOT NULL,
  `series` varchar(10) DEFAULT NULL,
  `isin_code` varchar(20) DEFAULT NULL,
  `fyers_token` varchar(512) DEFAULT NULL,
  `tick_size` decimal(10,4) DEFAULT NULL,
  `lot_size` int DEFAULT NULL,
  `fifty_two_weeks_high` decimal(12,2) DEFAULT NULL,
  `fifty_two_weeks_low` decimal(12,2) DEFAULT NULL,
  `life_time_high` decimal(12,2) DEFAULT NULL,
  `life_time_low` decimal(12,2) DEFAULT NULL,
  `warning_percent` decimal(5,2) DEFAULT NULL,
  `freeze_percent` decimal(5,2) DEFAULT NULL,
  `exchange_code` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`symbol`),
  KEY `idx_short_name` (`symbol`),
  KEY `idx_series` (`series`),
  KEY `idx_exchange_code` (`exchange_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3017 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: nse_symbol_indexes
CREATE TABLE `nse_symbol_indexes` (
  `symbol` varchar(50) NOT NULL,
  `n50` tinyint(1) NOT NULL DEFAULT '0',
  `next50` tinyint(1) NOT NULL DEFAULT '0',
  `n100` tinyint(1) NOT NULL DEFAULT '0',
  `midcap150` tinyint(1) NOT NULL DEFAULT '0',
  `midcap250` tinyint(1) NOT NULL DEFAULT '0',
  `smallcap250` tinyint(1) NOT NULL DEFAULT '0',
  `n500` tinyint(1) NOT NULL DEFAULT '0',
  `microcap250` tinyint(1) NOT NULL DEFAULT '0',
  `fo` tinyint(1) NOT NULL DEFAULT '0',
  `script_name` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: options_data_15min
CREATE TABLE `options_data_15min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `options_data_15min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: options_data_1min
CREATE TABLE `options_data_1min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `options_data_1min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: options_data_1sec
CREATE TABLE `options_data_1sec` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `options_data_1sec_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: options_data_5min
CREATE TABLE `options_data_5min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `options_data_5min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: options_data_60min
CREATE TABLE `options_data_60min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `options_data_15min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: orders
CREATE TABLE `orders` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `strategy_id` varchar(36) DEFAULT NULL,
  `trade_id` varchar(36) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `side` varchar(10) NOT NULL,
  `quantity` int NOT NULL,
  `price` decimal(12,4) NOT NULL,
  `order_type` varchar(20) NOT NULL DEFAULT 'MARKET',
  `mode` varchar(20) NOT NULL DEFAULT 'paper',
  `status` varchar(30) NOT NULL DEFAULT 'filled',
  `broker_order_id` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_orders_user` (`user_id`),
  KEY `idx_orders_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_125min
CREATE TABLE `stock_data_125min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_125min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=1293923 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_15min
CREATE TABLE `stock_data_15min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_15min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=10889098 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_1hour
CREATE TABLE `stock_data_1hour` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) NOT NULL,
  `candle_time` datetime NOT NULL,
  `open` decimal(12,4) NOT NULL,
  `high` decimal(12,4) NOT NULL,
  `low` decimal(12,4) NOT NULL,
  `close` decimal(12,4) NOT NULL,
  `volume` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_1hour` (`stock_code`,`candle_time`),
  KEY `idx_1hour_code_time` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_1min
CREATE TABLE `stock_data_1min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_1min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_1sec
CREATE TABLE `stock_data_1sec` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) NOT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `candle_time` datetime NOT NULL,
  `indicators` json DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_1sec_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=984 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_25min
CREATE TABLE `stock_data_25min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_25min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=6490164 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_30min
CREATE TABLE `stock_data_30min` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) NOT NULL,
  `candle_time` datetime NOT NULL,
  `open` decimal(12,4) NOT NULL,
  `high` decimal(12,4) NOT NULL,
  `low` decimal(12,4) NOT NULL,
  `close` decimal(12,4) NOT NULL,
  `volume` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_30min` (`stock_code`,`candle_time`),
  KEY `idx_30min_code_time` (`stock_code`,`candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_5min
CREATE TABLE `stock_data_5min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_5min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=46733454 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_5sec
CREATE TABLE `stock_data_5sec` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) NOT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `candle_time` datetime NOT NULL,
  `indicators` json DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_5sec_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=70332 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_75min
CREATE TABLE `stock_data_75min` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_75min_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=2155308 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_daily
CREATE TABLE `stock_data_daily` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_daily_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=1882153 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_monthly
CREATE TABLE `stock_data_monthly` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_monthly_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=751570 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_quarterly
CREATE TABLE `stock_data_quarterly` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  `price_levels` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_quarterly_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=105070 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_weekly
CREATE TABLE `stock_data_weekly` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  `price_levels` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_weekly_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=3248936 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stock_data_yearly
CREATE TABLE `stock_data_yearly` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_code` varchar(50) DEFAULT NULL,
  `open` decimal(10,1) DEFAULT NULL,
  `high` decimal(10,1) DEFAULT NULL,
  `low` decimal(10,1) DEFAULT NULL,
  `close` decimal(10,1) DEFAULT NULL,
  `volume` bigint DEFAULT NULL,
  `oi` bigint DEFAULT NULL,
  `candle_time` datetime DEFAULT NULL,
  `tech_indicators` json DEFAULT NULL,
  `fundamental_data` json DEFAULT NULL,
  `financial_data` json DEFAULT NULL,
  `analysis` json DEFAULT NULL,
  `price_levels` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_data_yearly_pk` (`stock_code`,`candle_time`)
) ENGINE=InnoDB AUTO_INCREMENT=9703 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: stocks_master
CREATE TABLE `stocks_master` (
  `symbol` varchar(50) DEFAULT NULL,
  `company` varchar(100) DEFAULT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `fo` tinyint(1) DEFAULT NULL,
  `marketcap` int DEFAULT NULL,
  `nifty50per` double DEFAULT NULL,
  `nifty500per` double DEFAULT NULL,
  `bankniftyper` double DEFAULT NULL,
  `nifty100per` double DEFAULT NULL,
  `nifty200per` double DEFAULT NULL,
  `lotsize` int DEFAULT NULL,
  UNIQUE KEY `symbol` (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: strategies
CREATE TABLE `strategies` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `strategy_json` json NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `mode` varchar(20) NOT NULL DEFAULT 'paper',
  `status` varchar(20) NOT NULL DEFAULT 'draft',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_strategies_user` (`user_id`),
  KEY `idx_strategies_user_status` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: trades
CREATE TABLE `trades` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `strategy_id` varchar(36) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `side` varchar(10) NOT NULL,
  `quantity` int NOT NULL,
  `entry_price` decimal(12,4) NOT NULL,
  `exit_price` decimal(12,4) DEFAULT NULL,
  `pnl` decimal(14,4) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  `opened_at` datetime NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_trades_user` (`user_id`),
  KEY `idx_trades_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
