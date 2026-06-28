-- Migration: Create fundamentals tables for Yahoo Finance data
-- Created: 2026-06-28

-- ============================================================================
-- Table: fundamentals_info
-- Stores static/semi-static fundamental info (market cap, sector, industry, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `fundamentals_info` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(50) NOT NULL,
  `exchange` VARCHAR(20) DEFAULT 'NSE',
  `company_name` VARCHAR(255),
  `sector` VARCHAR(100),
  `industry` VARCHAR(100),
  `market_cap` BIGINT,
  `enterprise_value` BIGINT,
  `trailing_pe` DECIMAL(10,2),
  `forward_pe` DECIMAL(10,2),
  `peg_ratio` DECIMAL(10,2),
  `price_to_book` DECIMAL(10,2),
  `price_to_sales` DECIMAL(10,2),
  `dividend_yield` DECIMAL(10,4),
  `beta` DECIMAL(10,4),
  `fifty_two_week_high` DECIMAL(12,2),
  `fifty_two_week_low` DECIMAL(12,2),
  `fifty_day_average` DECIMAL(12,2),
  `two_hundred_day_average` DECIMAL(12,2),
  `shares_outstanding` BIGINT,
  `float_shares` BIGINT,
  `held_percent_insiders` DECIMAL(10,4),
  `held_percent_institutions` DECIMAL(10,4),
  `short_ratio` DECIMAL(10,2),
  `book_value` DECIMAL(12,2),
  `profit_margins` DECIMAL(10,4),
  `return_on_assets` DECIMAL(10,4),
  `return_on_equity` DECIMAL(10,4),
  `revenue_growth` DECIMAL(10,4),
  `earnings_growth` DECIMAL(10,4),
  `current_ratio` DECIMAL(10,2),
  `debt_to_equity` DECIMAL(10,2),
  `quick_ratio` DECIMAL(10,2),
  `total_cash` BIGINT,
  `total_debt` BIGINT,
  `total_revenue` BIGINT,
  `gross_profits` BIGINT,
  `free_cashflow` BIGINT,
  `operating_cashflow` BIGINT,
  `ebitda` BIGINT,
  `website` VARCHAR(255),
  `last_updated` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol` (`symbol`),
  KEY `idx_sector` (`sector`),
  KEY `idx_industry` (`industry`),
  KEY `idx_market_cap` (`market_cap`),
  KEY `idx_last_updated` (`last_updated`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- Table: fundamentals_quarterly
-- Stores quarterly financial data
-- ============================================================================
CREATE TABLE IF NOT EXISTS `fundamentals_quarterly` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(50) NOT NULL,
  `quarter_end_date` DATE NOT NULL,
  `total_revenue` BIGINT,
  `gross_profit` BIGINT,
  `operating_income` BIGINT,
  `net_income` BIGINT,
  `ebitda` BIGINT,
  `eps_basic` DECIMAL(12,4),
  `eps_diluted` DECIMAL(12,4),
  `total_assets` BIGINT,
  `total_liabilities` BIGINT,
  `stockholders_equity` BIGINT,
  `total_debt` BIGINT,
  `current_assets` BIGINT,
  `current_liabilities` BIGINT,
  `cash_and_equivalents` BIGINT,
  `operating_cashflow` BIGINT,
  `investing_cashflow` BIGINT,
  `financing_cashflow` BIGINT,
  `free_cashflow` BIGINT,
  `capital_expenditure` BIGINT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol_quarter` (`symbol`, `quarter_end_date`),
  KEY `idx_symbol` (`symbol`),
  KEY `idx_quarter_date` (`quarter_end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- Table: fundamentals_yearly
-- Stores annual financial data
-- ============================================================================
CREATE TABLE IF NOT EXISTS `fundamentals_yearly` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(50) NOT NULL,
  `fiscal_year_end` DATE NOT NULL,
  `total_revenue` BIGINT,
  `gross_profit` BIGINT,
  `operating_income` BIGINT,
  `net_income` BIGINT,
  `ebitda` BIGINT,
  `eps_basic` DECIMAL(12,4),
  `eps_diluted` DECIMAL(12,4),
  `total_assets` BIGINT,
  `total_liabilities` BIGINT,
  `stockholders_equity` BIGINT,
  `total_debt` BIGINT,
  `current_assets` BIGINT,
  `current_liabilities` BIGINT,
  `cash_and_equivalents` BIGINT,
  `operating_cashflow` BIGINT,
  `investing_cashflow` BIGINT,
  `financing_cashflow` BIGINT,
  `free_cashflow` BIGINT,
  `capital_expenditure` BIGINT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_symbol_year` (`symbol`, `fiscal_year_end`),
  KEY `idx_symbol` (`symbol`),
  KEY `idx_fiscal_year` (`fiscal_year_end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
