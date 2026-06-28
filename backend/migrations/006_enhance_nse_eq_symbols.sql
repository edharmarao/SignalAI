-- Migration: Enhance nse_eq_symbols with market cap and index classifications
-- Created: 2026-06-28
-- Purpose: Add market cap, index memberships, cap classification, and listing date

-- ============================================================================
-- Add market cap and cap classification
-- ============================================================================
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `market_cap` DECIMAL(15,2) COMMENT 'Market capitalization in Crores' AFTER `industry`,
  ADD COLUMN `market_cap_rank` INT COMMENT 'Rank by market cap (1 = largest)' AFTER `market_cap`,
  ADD COLUMN `cap_type` VARCHAR(20) COMMENT 'LARGE/MID/SMALL/MICRO based on market cap' AFTER `market_cap_rank`,
  ADD COLUMN `listing_date` DATE COMMENT 'Date listed on NSE' AFTER `cap_type`;

-- ============================================================================
-- Add index membership flags
-- ============================================================================
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `is_nifty_50` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY 50' AFTER `listing_date`,
  ADD COLUMN `is_nifty_next_50` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Next 50' AFTER `is_nifty_50`,
  ADD COLUMN `is_nifty_100` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY 100' AFTER `is_nifty_next_50`,
  ADD COLUMN `is_nifty_200` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY 200' AFTER `is_nifty_100`,
  ADD COLUMN `is_nifty_500` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY 500' AFTER `is_nifty_200`,
  ADD COLUMN `is_nifty_midcap_50` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Midcap 50' AFTER `is_nifty_500`,
  ADD COLUMN `is_nifty_midcap_100` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Midcap 100' AFTER `is_nifty_midcap_50`,
  ADD COLUMN `is_nifty_midcap_150` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Midcap 150' AFTER `is_nifty_midcap_100`,
  ADD COLUMN `is_nifty_smallcap_50` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Smallcap 50' AFTER `is_nifty_midcap_150`,
  ADD COLUMN `is_nifty_smallcap_100` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Smallcap 100' AFTER `is_nifty_smallcap_50`,
  ADD COLUMN `is_nifty_smallcap_250` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Smallcap 250' AFTER `is_nifty_smallcap_100`,
  ADD COLUMN `is_nifty_microcap_250` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Microcap 250' AFTER `is_nifty_smallcap_250`,
  ADD COLUMN `is_fo_enabled` BOOLEAN DEFAULT FALSE COMMENT 'F&O enabled' AFTER `is_nifty_microcap_250`;

-- ============================================================================
-- Add sectoral and thematic index flags (optional, commonly used)
-- ============================================================================
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `is_nifty_bank` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Bank' AFTER `is_fo_enabled`,
  ADD COLUMN `is_nifty_financial` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Financial Services' AFTER `is_nifty_bank`,
  ADD COLUMN `is_nifty_it` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY IT' AFTER `is_nifty_financial`,
  ADD COLUMN `is_nifty_pharma` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Pharma' AFTER `is_nifty_it`,
  ADD COLUMN `is_nifty_auto` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Auto' AFTER `is_nifty_pharma`,
  ADD COLUMN `is_nifty_metal` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Metal' AFTER `is_nifty_auto`,
  ADD COLUMN `is_nifty_realty` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Realty' AFTER `is_nifty_metal`,
  ADD COLUMN `is_nifty_energy` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY Energy' AFTER `is_nifty_realty`,
  ADD COLUMN `is_nifty_fmcg` BOOLEAN DEFAULT FALSE COMMENT 'Member of NIFTY FMCG' AFTER `is_nifty_energy`;

-- ============================================================================
-- Add metadata fields
-- ============================================================================
ALTER TABLE `nse_eq_symbols`
  ADD COLUMN `is_active` BOOLEAN DEFAULT TRUE COMMENT 'Active for trading' AFTER `is_nifty_fmcg`,
  ADD COLUMN `is_suspended` BOOLEAN DEFAULT FALSE COMMENT 'Trading suspended' AFTER `is_active`,
  ADD COLUMN `last_traded_date` DATE COMMENT 'Last date traded' AFTER `is_suspended`,
  ADD COLUMN `avg_volume_30d` BIGINT COMMENT 'Average daily volume (30 days)' AFTER `last_traded_date`,
  ADD COLUMN `notes` TEXT COMMENT 'Additional notes' AFTER `avg_volume_30d`;

-- ============================================================================
-- Add indexes for better query performance
-- ============================================================================
CREATE INDEX `idx_market_cap` ON `nse_eq_symbols` (`market_cap` DESC);
CREATE INDEX `idx_cap_type` ON `nse_eq_symbols` (`cap_type`);
CREATE INDEX `idx_nifty_50` ON `nse_eq_symbols` (`is_nifty_50`);
CREATE INDEX `idx_nifty_500` ON `nse_eq_symbols` (`is_nifty_500`);
CREATE INDEX `idx_fo_enabled` ON `nse_eq_symbols` (`is_fo_enabled`);
CREATE INDEX `idx_active` ON `nse_eq_symbols` (`is_active`);

-- ============================================================================
-- Notes on cap classification (based on SEBI/AMFI guidelines)
-- ============================================================================
-- LARGE CAP: Top 100 by market cap
-- MID CAP: Rank 101-250 by market cap
-- SMALL CAP: Rank 251-500 by market cap
-- MICRO CAP: Rank 501+ by market cap
--
-- Update cap_type with:
-- UPDATE nse_eq_symbols SET cap_type = 'LARGE' WHERE market_cap_rank <= 100;
-- UPDATE nse_eq_symbols SET cap_type = 'MID' WHERE market_cap_rank BETWEEN 101 AND 250;
-- UPDATE nse_eq_symbols SET cap_type = 'SMALL' WHERE market_cap_rank BETWEEN 251 AND 500;
-- UPDATE nse_eq_symbols SET cap_type = 'MICRO' WHERE market_cap_rank > 500;
