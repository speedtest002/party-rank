-- migration-script.sql for Better Auth

-- 1. Rename 'users' to 'user'
ALTER TABLE "users" RENAME TO "user";

-- 2. Add Better Auth fields to 'user' table
ALTER TABLE "user" ADD COLUMN "name" TEXT;
ALTER TABLE "user" ADD COLUMN "email" TEXT;
ALTER TABLE "user" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN "image" TEXT;
ALTER TABLE "user" ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "user" ADD COLUMN "isAnonymous" BOOLEAN DEFAULT FALSE;

-- Migrate existing data
UPDATE "user" SET "name" = discord_username, "image" = discord_avatar;

-- Sync timestamps
ALTER TABLE "user" RENAME COLUMN created_at TO "createdAt";

-- 3. Create 'session' table
CREATE TABLE "session" (
    "id" TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

-- 4. Create 'account' table
CREATE TABLE "account" (
    "id" TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create 'verification' table
CREATE TABLE "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
