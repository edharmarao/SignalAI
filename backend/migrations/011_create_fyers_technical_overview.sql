CREATE TABLE IF NOT EXISTS `fyers_technical_overview` (
  `stock_code` VARCHAR(64) NOT NULL,
  `time_period` VARCHAR(10) NOT NULL,
  `data` JSON NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`stock_code`, `time_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
