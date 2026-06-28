-- Migration: Change fundamentals columns from BIGINT to DECIMAL(15,1) for Crores storage
-- Created: 2026-06-28
-- Purpose: Store values in Crores with single decimal precision (e.g., 294059.0)

-- ============================================================================
-- Update fundamentals_info table
-- ============================================================================
ALTER TABLE `fundamentals_info`
  MODIFY COLUMN `market_cap` DECIMAL(15,1),
  MODIFY COLUMN `enterprise_value` DECIMAL(15,1),
  MODIFY COLUMN `shares_outstanding` DECIMAL(15,1),
  MODIFY COLUMN `float_shares` DECIMAL(15,1),
  MODIFY COLUMN `total_cash` DECIMAL(15,1),
  MODIFY COLUMN `total_debt` DECIMAL(15,1),
  MODIFY COLUMN `total_revenue` DECIMAL(15,1),
  MODIFY COLUMN `gross_profits` DECIMAL(15,1),
  MODIFY COLUMN `free_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `operating_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `ebitda` DECIMAL(15,1);

-- ============================================================================
-- Update fundamentals_quarterly table
-- ============================================================================
ALTER TABLE `fundamentals_quarterly`
  MODIFY COLUMN `total_revenue` DECIMAL(15,1),
  MODIFY COLUMN `gross_profit` DECIMAL(15,1),
  MODIFY COLUMN `operating_income` DECIMAL(15,1),
  MODIFY COLUMN `net_income` DECIMAL(15,1),
  MODIFY COLUMN `ebitda` DECIMAL(15,1),
  MODIFY COLUMN `total_assets` DECIMAL(15,1),
  MODIFY COLUMN `total_liabilities` DECIMAL(15,1),
  MODIFY COLUMN `stockholders_equity` DECIMAL(15,1),
  MODIFY COLUMN `total_debt` DECIMAL(15,1),
  MODIFY COLUMN `current_assets` DECIMAL(15,1),
  MODIFY COLUMN `current_liabilities` DECIMAL(15,1),
  MODIFY COLUMN `cash_and_equivalents` DECIMAL(15,1),
  MODIFY COLUMN `operating_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `investing_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `financing_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `free_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `capital_expenditure` DECIMAL(15,1);

-- ============================================================================
-- Update fundamentals_yearly table
-- ============================================================================
ALTER TABLE `fundamentals_yearly`
  MODIFY COLUMN `total_revenue` DECIMAL(15,1),
  MODIFY COLUMN `gross_profit` DECIMAL(15,1),
  MODIFY COLUMN `operating_income` DECIMAL(15,1),
  MODIFY COLUMN `net_income` DECIMAL(15,1),
  MODIFY COLUMN `ebitda` DECIMAL(15,1),
  MODIFY COLUMN `total_assets` DECIMAL(15,1),
  MODIFY COLUMN `total_liabilities` DECIMAL(15,1),
  MODIFY COLUMN `stockholders_equity` DECIMAL(15,1),
  MODIFY COLUMN `total_debt` DECIMAL(15,1),
  MODIFY COLUMN `current_assets` DECIMAL(15,1),
  MODIFY COLUMN `current_liabilities` DECIMAL(15,1),
  MODIFY COLUMN `cash_and_equivalents` DECIMAL(15,1),
  MODIFY COLUMN `operating_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `investing_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `financing_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `free_cashflow` DECIMAL(15,1),
  MODIFY COLUMN `capital_expenditure` DECIMAL(15,1);
