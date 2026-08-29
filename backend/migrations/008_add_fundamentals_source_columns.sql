-- Preserve source and Screener-specific metrics alongside shared fundamentals.
ALTER TABLE `fundamentals_info`
  ADD COLUMN `source` VARCHAR(30) DEFAULT 'yahoo' AFTER `website`,
  ADD COLUMN `source_file` VARCHAR(512) DEFAULT NULL AFTER `source`,
  ADD COLUMN `current_price` DECIMAL(12,2) DEFAULT NULL AFTER `source_file`,
  ADD COLUMN `face_value` DECIMAL(12,2) DEFAULT NULL AFTER `current_price`;

ALTER TABLE `fundamentals_quarterly`
  ADD COLUMN `source` VARCHAR(30) DEFAULT 'yahoo' AFTER `updated_at`,
  ADD COLUMN `source_file` VARCHAR(512) DEFAULT NULL AFTER `source`;

ALTER TABLE `fundamentals_yearly`
  ADD COLUMN `source` VARCHAR(30) DEFAULT 'yahoo' AFTER `updated_at`,
  ADD COLUMN `source_file` VARCHAR(512) DEFAULT NULL AFTER `source`;