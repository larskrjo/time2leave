-- Schema for the `time2leave` database.
-- Multi-user trips app: users sign in via Google OAuth (gated by an
-- allowlist) and manage up to N trips. Commute samples are gathered weekly
-- for every active trip in both directions.

CREATE DATABASE IF NOT EXISTS time2leave
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE time2leave;

-- Legacy table from the single-user era. Dropped on purpose so there's a
-- clean cutover to the multi-user schema. If a volume already carries the
-- old table, this drop clears it.
DROP TABLE IF EXISTS commute_slots;

CREATE TABLE IF NOT EXISTS users (
    `id`            int           NOT NULL AUTO_INCREMENT,
    `google_sub`    varchar(255)  NOT NULL,
    `email`         varchar(320)  NOT NULL,
    `name`          varchar(255)          DEFAULT NULL,
    `picture_url`   varchar(1024)         DEFAULT NULL,
    `created_at`    timestamp     NULL    DEFAULT CURRENT_TIMESTAMP,
    `last_login_at` timestamp     NULL    DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_users_google_sub` (`google_sub`),
    UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_allowlist (
    `id`         int          NOT NULL AUTO_INCREMENT,
    `email`      varchar(320) NOT NULL,
    `added_by`   varchar(320)          DEFAULT NULL,
    `created_at` timestamp    NULL     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_allowlist_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- `slug` is the public-facing trip identifier (10-char hex, e.g. `a1b2c3d4e5`).
-- `id` stays as the internal int PK so commute_samples / trip_mutation_log
-- can keep their cheap int FKs. The slug is what the SPA, URLs, and
-- the JSON API see, so we never leak a sequential count of trips.
CREATE TABLE IF NOT EXISTS trips (
    `id`                  int           NOT NULL AUTO_INCREMENT,
    `slug`                varchar(16)   NOT NULL,
    `user_id`             int           NOT NULL,
    `name`                varchar(255)           DEFAULT NULL,
    `origin_address`      varchar(1024) NOT NULL,
    `destination_address` varchar(1024) NOT NULL,
    `created_at`          timestamp     NULL     DEFAULT CURRENT_TIMESTAMP,
    `deleted_at`          timestamp     NULL     DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_trips_slug` (`slug`),
    KEY `idx_trips_user_active` (`user_id`, `deleted_at`),
    CONSTRAINT `fk_trips_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Per-user audit log of "billed" trip mutations: trip creates and trip
-- patches that change addresses (or swap them). Each of those operations
-- triggers a Routes Matrix backfill, which costs real money.
--
-- Used to enforce a rolling-7-day mutation cap per user (see
-- `Settings.max_trip_mutations_per_week`) so a single user can't drain
-- the Google Maps budget by edit-spamming. Name-only patches and
-- deletes are NOT logged here because they don't call Google.
--
-- We keep `trip_id` even after a trip is deleted (no FK + ON DELETE
-- CASCADE) so the audit history survives churn. NULL is not used.
CREATE TABLE IF NOT EXISTS trip_mutation_log (
    `id`         int         NOT NULL AUTO_INCREMENT,
    `user_id`    int         NOT NULL,
    `trip_id`    int         NOT NULL,
    `kind`       varchar(32) NOT NULL,
    `created_at` timestamp   NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_mutations_user_time` (`user_id`, `created_at`),
    CONSTRAINT `fk_mutations_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS commute_samples (
    `id`                     int           NOT NULL AUTO_INCREMENT,
    `trip_id`                int           NOT NULL,
    `week_start_date`        date          NOT NULL,
    `direction`              enum('outbound','return') NOT NULL,
    `date_local`             date          NOT NULL,
    `weekday`                tinyint       NOT NULL,
    `hhmm`                   char(5)       NOT NULL,
    `local_departure_time`   varchar(50)   NOT NULL,
    `departure_time_rfc3339` varchar(100)  NOT NULL,
    `distance_meters`        int                    DEFAULT NULL,
    `duration_seconds`       int                    DEFAULT NULL,
    `condition`              varchar(50)            DEFAULT NULL,
    `status_code`            varchar(50)            DEFAULT NULL,
    `status_message`         text,
    `created_at`             timestamp     NULL     DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             timestamp     NULL     DEFAULT CURRENT_TIMESTAMP
                                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_sample_slot` (`trip_id`, `direction`, `departure_time_rfc3339`),
    KEY `idx_samples_trip_week` (`trip_id`, `week_start_date`),
    KEY `idx_samples_trip_direction_week` (`trip_id`, `direction`, `week_start_date`),
    CONSTRAINT `fk_samples_trip` FOREIGN KEY (`trip_id`)
        REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
