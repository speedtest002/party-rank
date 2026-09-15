-- Fix UUID to TEXT mismatch for Better Auth
-- Run this if you get "invalid input syntax for type uuid" error

-- 1. Update "user" table
ALTER TABLE "user" ALTER COLUMN id TYPE TEXT;

-- 2. Update "session" table
-- We need to drop the FK before changing type or change both
ALTER TABLE "session" ALTER COLUMN id TYPE TEXT;
ALTER TABLE "session" ALTER COLUMN "userId" TYPE TEXT;

-- 3. Update "account" table
ALTER TABLE "account" ALTER COLUMN id TYPE TEXT;
ALTER TABLE "account" ALTER COLUMN "userId" TYPE TEXT;

-- 4. Update "verification" table
ALTER TABLE "verification" ALTER COLUMN id TYPE TEXT;
