-- Migration: add Apple Sign In support to users.
--
-- The init script (`db/init/001_schema.sql`) only runs against a
-- *fresh* MySQL data volume; existing databases (local dev or
-- prod) need this script applied manually.
--
-- What this changes:
--   1. Adds `apple_sub VARCHAR(255) NULL UNIQUE` so we can store
--      Apple's stable per-app user identifier alongside Google's.
--   2. Relaxes `google_sub` to `NULL` so an Apple-first user (no
--      Google account ever) is representable. The unique constraint
--      is preserved (MySQL treats multiple NULLs as distinct).
--
-- How to run:
--   docker exec -i time2leave-mysql-dev \
--     mysql -uroot -pAbcd1234 < backend/db/migrations/001_add_apple_sub.sql
--
-- Idempotency: re-running this script after a successful run is
-- safe — the INFORMATION_SCHEMA guards make every DDL a no-op on
-- the second pass. (MySQL 8 doesn't support `ADD COLUMN IF NOT
-- EXISTS` natively, hence the manual guards.)

USE time2leave;

-- 1. Relax google_sub. Always-safe to re-run; MODIFY is idempotent
--    when the target shape already matches.
ALTER TABLE users
    MODIFY COLUMN `google_sub` varchar(255) DEFAULT NULL;

-- 2. Add apple_sub column if it isn't there yet.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'apple_sub'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE users ADD COLUMN `apple_sub` varchar(255) DEFAULT NULL AFTER `google_sub`',
    'SELECT "apple_sub already exists, skipping"'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Add the unique index if it isn't there yet.
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND index_name = 'uniq_users_apple_sub'
);
SET @ddl := IF(
    @idx_exists = 0,
    'ALTER TABLE users ADD UNIQUE KEY `uniq_users_apple_sub` (`apple_sub`)',
    'SELECT "uniq_users_apple_sub already exists, skipping"'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
