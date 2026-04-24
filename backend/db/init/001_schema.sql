-- Schema for the traffic_larsjohansen_com database.
-- Mirrors the production schema (captured via SHOW CREATE TABLE) so local
-- dev and CI exercise exactly the same DDL prod runs on.

CREATE DATABASE IF NOT EXISTS traffic_larsjohansen_com
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE traffic_larsjohansen_com;

CREATE TABLE IF NOT EXISTS commute_slots (
    `id`                     int NOT NULL AUTO_INCREMENT,
    `date_local`             date NOT NULL,
    `local_departure_time`   varchar(50) NOT NULL,
    `departure_time_rfc3339` varchar(100) NOT NULL,
    `direction`              varchar(10) NOT NULL,
    `distance_meters`        int DEFAULT NULL,
    `duration`               varchar(50) DEFAULT NULL,
    `condition`              varchar(50) DEFAULT NULL,
    `status_code`            varchar(50) DEFAULT NULL,
    `status_message`         text,
    `created_at`             timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             timestamp NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_slot` (`departure_time_rfc3339`, `direction`),
    KEY `idx_date_direction` (`date_local`, `direction`),
    KEY `idx_departure_time` (`departure_time_rfc3339`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
