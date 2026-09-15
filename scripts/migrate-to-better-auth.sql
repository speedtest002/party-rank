-- migration-script.sql for Better Auth
-- Chuyển đổi từ schema cũ (Clerk/UUID) sang Better Auth (NanoID/TEXT)

-- 1. Đổi tên bảng 'users' thành 'user' nếu nó tồn tại
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'users') THEN
        ALTER TABLE "users" RENAME TO "user";
    END IF;
END $$;

-- 2. Tạm thời xoá Foreign Key để có thể đổi kiểu dữ liệu
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_userId_fkey";
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_userId_fkey";
-- Trong trường hợp tên constraint khác (ví dụ từ Prisma hoặc tool khác tự tạo)
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_fkey";
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_fkey";

-- 3. Chuyển đổi 'id' và 'userId' từ UUID sang TEXT
ALTER TABLE "user" ALTER COLUMN "id" TYPE TEXT;

-- 4. Thêm các cột mới cho Better Auth (nếu chưa có)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN DEFAULT FALSE;

-- Di chuyển dữ liệu cũ sang các cột mới của Better Auth (nếu có)
UPDATE "user" SET "name" = discord_username, "image" = discord_avatar WHERE "name" IS NULL;

-- Đổi tên created_at sang createdAt cho đúng chuẩn Better Auth
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name='user' AND column_name='created_at') THEN
        ALTER TABLE "user" RENAME COLUMN created_at TO "createdAt";
    END IF;
END $$;

-- 5. Tạo hoặc cập nhật bảng 'session'
CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
ALTER TABLE "session" ALTER COLUMN "id" TYPE TEXT;
ALTER TABLE "session" ALTER COLUMN "userId" TYPE TEXT;

-- 6. Tạo hoặc cập nhật bảng 'account'
CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
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
ALTER TABLE "account" ALTER COLUMN "id" TYPE TEXT;
ALTER TABLE "account" ALTER COLUMN "userId" TYPE TEXT;

-- 7. Tạo hoặc cập nhật bảng 'verification'
CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "verification" ALTER COLUMN "id" TYPE TEXT;

-- 8. Tạo lại các Foreign Key sau khi đã đổi kiểu dữ liệu thành TEXT
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- 9. TỰ ĐỘNG LIÊN KẾT: Nếu user đã có sẵn từ Clerk (discord_id), 
-- hãy tạo bản ghi trong bảng 'account' để Better Auth nhận diện được user cũ.
INSERT INTO "account" (id, "userId", "accountId", "providerId", "createdAt", "updatedAt")
SELECT 
    encode(gen_random_bytes(16), 'hex'), -- Tạo một ID ngẫu nhiên
    id, 
    discord_id, 
    'discord', 
    NOW(), 
    NOW()
FROM "user"
WHERE discord_id IS NOT NULL
ON CONFLICT DO NOTHING;
