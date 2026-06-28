-- Migration: Add market_cap_usd to nse_eq_symbols
-- Created: 2026-06-28
-- Purpose: Store market cap in both INR (Crores) and USD (Millions)

-- Add market_cap_usd column
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `market_cap_usd` DECIMAL(15,2) COMMENT 'Market capitalization in USD Millions' AFTER `market_cap`;

-- Add 52-week high/low prices (if not already present)
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN IF NOT EXISTS `fifty_two_weeks_high` DECIMAL(10,2) COMMENT '52-week high price' AFTER `market_cap_usd`,
  ADD COLUMN IF NOT EXISTS `fifty_two_weeks_low` DECIMAL(10,2) COMMENT '52-week low price' AFTER `fifty_two_weeks_high`;

-- Create index for market_cap_usd
CREATE INDEX `idx_market_cap_usd` ON `nse_eq_symbols` (`market_cap_usd` DESC);
