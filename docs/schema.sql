-- SignalAI application tables
-- Run against the MySQL stocks database on 209.182.232.165

CREATE TABLE IF NOT EXISTS `strategies` (
  `id`            VARCHAR(36)   NOT NULL,
  `user_id`       VARCHAR(255)  NOT NULL,
  `name`          VARCHAR(255)  NOT NULL,
  `strategy_json` JSON          NOT NULL,
  `is_active`     TINYINT(1)    NOT NULL DEFAULT 0,
  `mode`          VARCHAR(20)   NOT NULL DEFAULT 'paper',
  `status`        VARCHAR(20)   NOT NULL DEFAULT 'draft',
  `created_at`    DATETIME      NOT NULL,
  `updated_at`    DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_strategies_user` (`user_id`),
  KEY `idx_strategies_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `orders` (
  `id`              VARCHAR(36)   NOT NULL,
  `user_id`         VARCHAR(255)  NOT NULL,
  `strategy_id`     VARCHAR(36)   DEFAULT NULL,
  `trade_id`        VARCHAR(36)   DEFAULT NULL,
  `symbol`          VARCHAR(50)   NOT NULL,
  `side`            VARCHAR(10)   NOT NULL,
  `quantity`        INT           NOT NULL,
  `price`           DECIMAL(12,4) NOT NULL,
  `order_type`      VARCHAR(20)   NOT NULL DEFAULT 'MARKET',
  `mode`            VARCHAR(20)   NOT NULL DEFAULT 'paper',
  `status`          VARCHAR(30)   NOT NULL DEFAULT 'filled',
  `broker_order_id` VARCHAR(100)  DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_orders_user` (`user_id`),
  KEY `idx_orders_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `trades` (
  `id`          VARCHAR(36)   NOT NULL,
  `user_id`     VARCHAR(255)  NOT NULL,
  `strategy_id` VARCHAR(36)   DEFAULT NULL,
  `symbol`      VARCHAR(50)   NOT NULL,
  `side`        VARCHAR(10)   NOT NULL,
  `quantity`    INT           NOT NULL,
  `entry_price` DECIMAL(12,4) NOT NULL,
  `exit_price`  DECIMAL(12,4) DEFAULT NULL,
  `pnl`         DECIMAL(14,4) DEFAULT NULL,
  `status`      VARCHAR(20)   NOT NULL DEFAULT 'open',
  `opened_at`   DATETIME      NOT NULL,
  `closed_at`   DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_trades_user` (`user_id`),
  KEY `idx_trades_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `logs` (
  `id`          VARCHAR(36)   NOT NULL,
  `user_id`     VARCHAR(255)  NOT NULL,
  `strategy_id` VARCHAR(36)   DEFAULT NULL,
  `level`       VARCHAR(10)   NOT NULL DEFAULT 'info',
  `event`       VARCHAR(255)  NOT NULL,
  `data`        JSON          DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_logs_user` (`user_id`),
  KEY `idx_logs_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `candle_data` (
  `id`             BIGINT         NOT NULL AUTO_INCREMENT,
  `symbol`         VARCHAR(50)    NOT NULL,
  `exchange`       VARCHAR(20)    NOT NULL,
  `isin`           VARCHAR(20)    DEFAULT NULL,
  `interval_type`  VARCHAR(20)    NOT NULL,
  `interval_value` VARCHAR(10)    NOT NULL,
  `time`           DATETIME       NOT NULL,
  `open`           DECIMAL(12,4)  NOT NULL,
  `high`           DECIMAL(12,4)  NOT NULL,
  `low`            DECIMAL(12,4)  NOT NULL,
  `close`          DECIMAL(12,4)  NOT NULL,
  `volume`         BIGINT         NOT NULL DEFAULT 0,
  `oi`             BIGINT         NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_candle` (`symbol`, `exchange`, `interval_type`, `interval_value`, `time`),
  KEY `idx_candle_symbol_time` (`symbol`, `time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
