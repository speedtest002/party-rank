-- ============================================================
-- PartyRank Schema
-- ============================================================

-- Đảm bảo toàn bộ session dùng UTC
SET timezone = 'UTC';

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id      TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  discord_avatar  TEXT,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- party_ranks
-- ============================================================
CREATE TABLE party_ranks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Định danh & hiển thị
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  cover_url     TEXT,

  -- Playlist
  spotify_url   TEXT,
  youtube_url   TEXT,

  -- Thời gian
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  starts_at     TIMESTAMPTZ,
  deadline      TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,

  -- Trạng thái
  -- draft → open → closed → revealed
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'open', 'closed', 'revealed')),

  -- Discord metadata
  discord_guild_id      TEXT,
  discord_channel_id    TEXT,
  discord_thread_id     TEXT,
  discord_message_id    TEXT,
  created_by_discord_id TEXT REFERENCES users(discord_id) ON DELETE SET NULL,

  -- Config
  allow_resubmit   BOOLEAN NOT NULL DEFAULT FALSE,
  max_participants INT,
  score_min        NUMERIC(4,1) NOT NULL DEFAULT 0,
  score_max        NUMERIC(4,1) NOT NULL DEFAULT 10,

  -- FIX #5: Logic guards
  CHECK (score_min < score_max),
  CHECK (starts_at IS NULL OR deadline IS NULL OR starts_at < deadline)
);

-- ============================================================
-- songs
-- ============================================================
CREATE TABLE songs (
  -- Composite PK: cùng 1 bài không thể xuất hiện 2 lần trong 1 PR
  ann_song_id INTEGER NOT NULL,  -- song_link.ann_song_id từ anisongdb
  pr_id       UUID    NOT NULL REFERENCES party_ranks(id) ON DELETE CASCADE,

  PRIMARY KEY (pr_id, ann_song_id),

  -- Thứ tự hiển thị — không UNIQUE, application tier lo reorder
  position    INT NOT NULL DEFAULT 0,

  -- IDs phụ để tra thêm từ anisongdb nếu cần
  ann_id      INTEGER,   -- anime.ann_id
  song_id     INTEGER,   -- song.song_id (composer, arranger, v.v.)

  -- Snapshot metadata tại thời điểm thêm vào PR
  anime       TEXT NOT NULL,
  song_title  TEXT NOT NULL,
  artist      TEXT,        -- display string đã resolve từ artist/groups
  song_type   SMALLINT CHECK (song_type IN (1, 2, 3)),
  -- 1 = OP, 2 = ED, 3 = IN (theo chuẩn anisongdb song_link.type)

  -- URLs snapshot từ song_urls
  audio_url   TEXT,   -- song_urls.audio
  video_url   TEXT,   -- COALESCE(song_urls.hq, song_urls.mq)

  cover_url   TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- participants
-- ============================================================
CREATE TABLE participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id           UUID NOT NULL REFERENCES party_ranks(id) ON DELETE CASCADE,

  discord_id      TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  discord_username TEXT,
  discord_avatar  TEXT,

  -- token ngẫu nhiên dùng trong URL — UNIQUE tự tạo index, không cần CREATE INDEX thêm
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  status          TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited', 'viewed', 'submitted')),

  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_viewed_at TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  submit_count    INT NOT NULL DEFAULT 0,

  -- UNIQUE (pr_id, discord_id) tự tạo index với left-prefix (pr_id, discord_id)
  UNIQUE (pr_id, discord_id)
);

-- ============================================================
-- scores
-- ============================================================
CREATE TABLE scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  ann_song_id     INTEGER NOT NULL,
  pr_id           UUID NOT NULL REFERENCES party_ranks(id) ON DELETE CASCADE,

  -- Tham chiếu mềm tới (pr_id, ann_song_id) của bảng songs
  FOREIGN KEY (pr_id, ann_song_id) REFERENCES songs(pr_id, ann_song_id) ON DELETE CASCADE,

  rank            INT NOT NULL CHECK (rank > 0),
  score           NUMERIC(4,1) NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- UNIQUE (participant_id, ann_song_id): left-prefix → query by participant_id vẫn dùng được index
  UNIQUE (participant_id, ann_song_id),

  -- FIX #2: Ràng buộc không trùng rank trong cùng một participant
  UNIQUE (participant_id, rank)
);

-- ============================================================
-- Indexes
-- Chỉ tạo những index CHƯA được tạo ngầm bởi UNIQUE / PRIMARY KEY
-- ============================================================

-- songs.pr_id đã là phần đầu của PK (pr_id, ann_song_id) → index tự động, không cần tạo thêm

-- participants.pr_id — FK không có UNIQUE nên cần tạo thủ công
CREATE INDEX idx_participants_pr_id ON participants(pr_id);

-- scores.pr_id — dùng cho query tổng hợp kết quả
CREATE INDEX idx_scores_pr          ON scores(pr_id);
-- scores.ann_song_id — UNIQUE (participant_id, ann_song_id) đã cover left-prefix, không cần thêm

-- party_ranks.status — dùng cho cron job lọc các PR đang 'open'
CREATE INDEX idx_pr_status          ON party_ranks(status);

-- FIX #1: Các index sau đã bị xoá vì UNIQUE đã tạo ngầm rồi:
--   idx_participants_token    (token UNIQUE)
--   idx_participants_discord  (UNIQUE (pr_id, discord_id), left-prefix đủ dùng)
--   idx_scores_participant    (UNIQUE (participant_id, song_id), left-prefix đủ dùng)
--   idx_pr_slug               (slug UNIQUE)

-- ============================================================
-- View: kết quả tổng hợp theo bài
-- ============================================================
CREATE VIEW song_results AS
SELECT
  s.ann_song_id,
  s.pr_id,
  s.ann_id,
  s.anime,
  s.song_title,
  s.artist,
  s.song_type,      -- SMALLINT: 1=OP 2=ED 3=IN
  s.position,
  COUNT(sc.id)                        AS vote_count,
  ROUND(AVG(sc.score), 2)             AS avg_score,
  ROUND(AVG(sc.rank), 2)              AS avg_rank,
  MIN(sc.score)                       AS min_score,
  MAX(sc.score)                       AS max_score,
  RANK() OVER (
    PARTITION BY s.pr_id
    -- FIX #3: NULLS LAST — bài chưa có vote không lọt top
    ORDER BY AVG(sc.rank) ASC NULLS LAST, AVG(sc.score) DESC NULLS LAST
  )                                   AS final_rank
FROM songs s
LEFT JOIN scores sc ON sc.ann_song_id = s.ann_song_id
                   AND sc.pr_id       = s.pr_id
GROUP BY s.pr_id, s.ann_song_id, s.ann_id,
         s.anime, s.song_title, s.artist, s.song_type, s.position;