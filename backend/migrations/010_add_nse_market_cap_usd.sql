-- Migration: Add USD market cap to NSE equity symbols
-- Purpose: Store the USD value written by the Yahoo fundamentals sync.

ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `market_cap_usd` DECIMAL(15,1)
  COMMENT 'Market capitalization in USD Millions'
  AFTER `market_cap`;

CREATE INDEX `idx_nse_eq_market_cap_usd`
  ON `nse_eq_symbols` (`market_cap_usd` DESC);
