-- Store one USD/INR conversion rate per calendar day for repeatable imports.
CREATE TABLE IF NOT EXISTS `fx_daily_rates` (
  `rate_date` DATE NOT NULL,
  `usd_inr` DECIMAL(12,6) NOT NULL,
  `fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rate_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
