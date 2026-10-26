-- Migration: Add Shugo profile columns, assigned_guild, and guild application status to aion2_global_applications
-- Date: 2026-10-02
-- Constraints:
-- 1. Use ADD COLUMN IF NOT EXISTS
-- 2. No shugo_char_id
-- 3. No new unique constraints
-- 4. No backfill (assigned_guild, guild_app_status, guild_app_target remain NULL for existing rows)

ALTER TABLE aion2_global_applications 
ADD COLUMN IF NOT EXISTS character_name TEXT,
ADD COLUMN IF NOT EXISTS character_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS combat_power INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_image TEXT,
ADD COLUMN IF NOT EXISTS shugo_url TEXT,
ADD COLUMN IF NOT EXISTS race_name TEXT,
ADD COLUMN IF NOT EXISTS server_name TEXT,
ADD COLUMN IF NOT EXISTS character_data JSONB,
ADD COLUMN IF NOT EXISTS assigned_guild VARCHAR(32) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS guild_app_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS guild_app_target VARCHAR(32) DEFAULT NULL;
