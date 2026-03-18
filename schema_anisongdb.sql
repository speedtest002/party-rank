-- ============================================================================
-- PostgreSQL Schema for Anisong Distributed Database
-- Source of Truth (Write DB) — Hosted on Aiven
-- ============================================================================
-- Conventions:
--   • All IDs use INTEGER
--   • Every table (except anime_fetch_status) has:
--       is_deleted BOOLEAN NOT NULL DEFAULT FALSE
--       updated_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
--   • "groups" is double-quoted everywhere (reserved keyword)
--   • updated_at is auto-bumped by trigger on every UPDATE
--   • Cascade soft-delete triggers propagate is_deleted downstream
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. SHARED TRIGGER FUNCTION: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Only bump timestamp if actual data changed
    IF OLD IS DISTINCT FROM NEW THEN
        NEW.updated_at = NOW() AT TIME ZONE 'UTC';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ARTIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS artist (
    artist_id       INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    name_normalized TEXT,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_artist_updated_at
    BEFORE UPDATE ON artist
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 2. GROUPS  (double-quoted — reserved keyword)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "groups" (
    group_id        INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    name_normalized TEXT,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON "groups"
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 3. ARTIST_ALT_NAME
-- ============================================================================

CREATE TABLE IF NOT EXISTS artist_alt_name (
    artist_id   INTEGER NOT NULL REFERENCES artist(artist_id),
    alt_id      INTEGER NOT NULL REFERENCES artist(artist_id),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (artist_id, alt_id)
);

CREATE TRIGGER trg_artist_alt_name_updated_at
    BEFORE UPDATE ON artist_alt_name
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 4. GROUP_ALT_NAME
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_alt_name (
    main_group_id INTEGER NOT NULL REFERENCES "groups"(group_id),
    alt_group_id  INTEGER NOT NULL REFERENCES "groups"(group_id),
    is_deleted    BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (main_group_id, alt_group_id)
);

CREATE TRIGGER trg_group_alt_name_updated_at
    BEFORE UPDATE ON group_alt_name
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 5. GROUP_ARTIST  (junction: which artists belong to which groups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_artist (
    artist_id   INTEGER NOT NULL REFERENCES artist(artist_id),
    group_id    INTEGER NOT NULL REFERENCES "groups"(group_id),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (artist_id, group_id)
);

CREATE TRIGGER trg_group_artist_updated_at
    BEFORE UPDATE ON group_artist
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 6. GROUP_GROUP  (junction: parent-child group relationships)
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_group (
    parent_group_id INTEGER NOT NULL REFERENCES "groups"(group_id),
    child_group_id  INTEGER NOT NULL REFERENCES "groups"(group_id),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (parent_group_id, child_group_id)
);

CREATE TRIGGER trg_group_group_updated_at
    BEFORE UPDATE ON group_group
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 7. SONG
-- ============================================================================

CREATE TABLE IF NOT EXISTS song (
    song_id             INTEGER PRIMARY KEY,
    name                TEXT    NOT NULL,
    name_normalized     TEXT,
    song_artist_id      INTEGER REFERENCES artist(artist_id),
    song_group_id       INTEGER REFERENCES "groups"(group_id),
    composer_artist_id  INTEGER REFERENCES artist(artist_id),
    composer_group_id   INTEGER REFERENCES "groups"(group_id),
    arranger_artist_id  INTEGER REFERENCES artist(artist_id),
    arranger_group_id   INTEGER REFERENCES "groups"(group_id),
    category            INTEGER,
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_song_updated_at
    BEFORE UPDATE ON song
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 8. ANIME
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime (
    ann_id          INTEGER PRIMARY KEY,
    category        TEXT,
    category_number NUMERIC,
    year            INTEGER,
    season_id       INTEGER,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_anime_updated_at
    BEFORE UPDATE ON anime
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 9. ANIME_NAME
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_name (
    ann_id          INTEGER NOT NULL REFERENCES anime(ann_id),
    language        TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    name_normalized TEXT,
    is_main         BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (ann_id, language, name)
);

CREATE TRIGGER trg_anime_name_updated_at
    BEFORE UPDATE ON anime_name
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 10. SONG_LINK
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_link (
    ann_song_id INTEGER PRIMARY KEY,
    song_id     INTEGER NOT NULL REFERENCES song(song_id),
    ann_id      INTEGER NOT NULL REFERENCES anime(ann_id),
    number      INTEGER NOT NULL DEFAULT 0,
    type        INTEGER NOT NULL DEFAULT 0,
    uploaded    BOOLEAN NOT NULL DEFAULT FALSE,
    rebroadcast BOOLEAN NOT NULL DEFAULT FALSE,
    dub         BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_song_link_updated_at
    BEFORE UPDATE ON song_link
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 11. ANIME_LIST  (external IDs: MAL, Kitsu, AniList)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_list (
    ann_id      INTEGER PRIMARY KEY REFERENCES anime(ann_id),
    mal_id      INTEGER,
    kitsu_id    INTEGER,
    anilist_id  INTEGER,
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_anime_list_updated_at
    BEFORE UPDATE ON anime_list
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 12. ANIME_GENRE
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_genre (
    ann_id      INTEGER NOT NULL REFERENCES anime(ann_id),
    genre_name  TEXT    NOT NULL CHECK (LENGTH(genre_name) > 0 AND LENGTH(genre_name) <= 100),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (ann_id, genre_name)
);

CREATE TRIGGER trg_anime_genre_updated_at
    BEFORE UPDATE ON anime_genre
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 13. ANIME_TAG
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_tag (
    ann_id      INTEGER NOT NULL REFERENCES anime(ann_id),
    tag_name    TEXT    NOT NULL CHECK (LENGTH(tag_name) > 0 AND LENGTH(tag_name) <= 100),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (ann_id, tag_name)
);

CREATE TRIGGER trg_anime_tag_updated_at
    BEFORE UPDATE ON anime_tag
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 14. SONG_URLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_urls (
    ann_song_id INTEGER PRIMARY KEY REFERENCES song_link(ann_song_id),
    difficulty  REAL    CHECK (difficulty IS NULL OR (difficulty >= 0 AND difficulty <= 100)),
    hq          TEXT    CHECK (hq IS NULL OR LENGTH(hq) <= 500),
    mq          TEXT    CHECK (mq IS NULL OR LENGTH(mq) <= 500),
    audio       TEXT    CHECK (audio IS NULL OR LENGTH(audio) <= 500),
    length      REAL    CHECK (length IS NULL OR (length > 0 AND length <= 3600)),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_song_urls_updated_at
    BEFORE UPDATE ON song_urls
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 15. SHORT NAMES TABLES
--     (for names ≤3 chars after normalize — BTREE index instead of FTS5 trigram)
-- ============================================================================

-- 15a. SONG_SHORT_NAMES
CREATE TABLE IF NOT EXISTS song_short_names (
    song_id         INTEGER PRIMARY KEY REFERENCES song(song_id),
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_song_short_names_updated_at
    BEFORE UPDATE ON song_short_names
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- 15b. ANIME_SHORT_NAMES
CREATE TABLE IF NOT EXISTS anime_short_names (
    ann_id          INTEGER NOT NULL REFERENCES anime(ann_id),
    language        TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    name_normalized TEXT    NOT NULL,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    PRIMARY KEY (ann_id, language, name)
);

CREATE TRIGGER trg_anime_short_names_updated_at
    BEFORE UPDATE ON anime_short_names
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- 15c. ARTIST_SHORT_NAMES
CREATE TABLE IF NOT EXISTS artist_short_names (
    artist_id       INTEGER PRIMARY KEY REFERENCES artist(artist_id),
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_artist_short_names_updated_at
    BEFORE UPDATE ON artist_short_names
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- 15d. GROUPS_SHORT_NAMES
CREATE TABLE IF NOT EXISTS groups_short_names (
    group_id        INTEGER PRIMARY KEY REFERENCES "groups"(group_id),
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TRIGGER trg_groups_short_names_updated_at
    BEFORE UPDATE ON groups_short_names
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- 16. ANIME_FETCH_STATUS  (Postgres-only — crawler tracking, NOT synced to D1)
--     This table does NOT have is_deleted / updated_at (internal tracking only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_fetch_status (
    ann_id              INTEGER PRIMARY KEY REFERENCES anime(ann_id),
    fetched_at          TIMESTAMPTZ DEFAULT (NOW() AT TIME ZONE 'UTC'),
    has_genres          INTEGER NOT NULL DEFAULT 0,
    has_tags            INTEGER NOT NULL DEFAULT 0,
    external_ids_count  INTEGER NOT NULL DEFAULT 0,
    fetch_success       INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- 17. CASCADE SOFT-DELETE TRIGGERS
-- ============================================================================

-- 17a. anime soft-delete → cascade to anime_name, anime_list, anime_genre,
--      anime_tag, song_link, anime_short_names
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_anime()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE anime_name
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;

        UPDATE anime_list
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;

        UPDATE anime_genre
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;

        UPDATE anime_tag
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;

        UPDATE song_link
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;

        UPDATE anime_short_names
           SET is_deleted = TRUE
         WHERE ann_id = NEW.ann_id AND is_deleted = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_soft_delete_anime
    AFTER UPDATE OF is_deleted ON anime
    FOR EACH ROW
    WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
    EXECUTE FUNCTION fn_cascade_soft_delete_anime();

-- 17b. song soft-delete → cascade to song_link, song_short_names
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_song()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE song_link
           SET is_deleted = TRUE
         WHERE song_id = NEW.song_id AND is_deleted = FALSE;

        UPDATE song_short_names
           SET is_deleted = TRUE
         WHERE song_id = NEW.song_id AND is_deleted = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_soft_delete_song
    AFTER UPDATE OF is_deleted ON song
    FOR EACH ROW
    WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
    EXECUTE FUNCTION fn_cascade_soft_delete_song();

-- 17c. song_link soft-delete → cascade to song_urls
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_song_link()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE song_urls
           SET is_deleted = TRUE
         WHERE ann_song_id = NEW.ann_song_id AND is_deleted = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_soft_delete_song_link
    AFTER UPDATE OF is_deleted ON song_link
    FOR EACH ROW
    WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
    EXECUTE FUNCTION fn_cascade_soft_delete_song_link();

-- 17d. artist soft-delete → cascade to artist_alt_name, group_artist, artist_short_names
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_artist()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE artist_alt_name
           SET is_deleted = TRUE
         WHERE artist_id = NEW.artist_id AND is_deleted = FALSE;

        UPDATE group_artist
           SET is_deleted = TRUE
         WHERE artist_id = NEW.artist_id AND is_deleted = FALSE;

        UPDATE artist_short_names
           SET is_deleted = TRUE
         WHERE artist_id = NEW.artist_id AND is_deleted = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_soft_delete_artist
    AFTER UPDATE OF is_deleted ON artist
    FOR EACH ROW
    WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
    EXECUTE FUNCTION fn_cascade_soft_delete_artist();

-- 17e. "groups" soft-delete → cascade to group_alt_name, group_group,
--      group_artist, groups_short_names
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cascade_soft_delete_groups()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE group_alt_name
           SET is_deleted = TRUE
         WHERE main_group_id = NEW.group_id AND is_deleted = FALSE;

        UPDATE group_group
           SET is_deleted = TRUE
         WHERE parent_group_id = NEW.group_id AND is_deleted = FALSE;

        UPDATE group_artist
           SET is_deleted = TRUE
         WHERE group_id = NEW.group_id AND is_deleted = FALSE;

        UPDATE groups_short_names
           SET is_deleted = TRUE
         WHERE group_id = NEW.group_id AND is_deleted = FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_soft_delete_groups
    AFTER UPDATE OF is_deleted ON "groups"
    FOR EACH ROW
    WHEN (NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE)
    EXECUTE FUNCTION fn_cascade_soft_delete_groups();

-- ============================================================================
-- 18. INDEXES
-- ============================================================================

-- Relational lookups
CREATE INDEX IF NOT EXISTS idx_anime_name_ann_id        ON anime_name(ann_id);
CREATE INDEX IF NOT EXISTS idx_song_link_song_id        ON song_link(song_id);
CREATE INDEX IF NOT EXISTS idx_song_link_ann_id         ON song_link(ann_id);
CREATE INDEX IF NOT EXISTS idx_group_artist_group_id    ON group_artist(group_id);

-- Song FK indexes
CREATE INDEX IF NOT EXISTS idx_song_artist              ON song(song_artist_id);
CREATE INDEX IF NOT EXISTS idx_song_composer            ON song(composer_artist_id);
CREATE INDEX IF NOT EXISTS idx_song_arranger            ON song(arranger_artist_id);
CREATE INDEX IF NOT EXISTS idx_song_group               ON song(song_group_id);
CREATE INDEX IF NOT EXISTS idx_song_composer_group      ON song(composer_group_id);
CREATE INDEX IF NOT EXISTS idx_song_arranger_group      ON song(arranger_group_id);

-- Short names indexes (BTREE lookup)
CREATE INDEX IF NOT EXISTS idx_song_short_normalized    ON song_short_names(name_normalized);
CREATE INDEX IF NOT EXISTS idx_song_short_name          ON song_short_names(name);
CREATE INDEX IF NOT EXISTS idx_anime_short_normalized   ON anime_short_names(name_normalized);
CREATE INDEX IF NOT EXISTS idx_anime_short_name         ON anime_short_names(name);
CREATE INDEX IF NOT EXISTS idx_artist_short_normalized  ON artist_short_names(name_normalized);
CREATE INDEX IF NOT EXISTS idx_artist_short_name        ON artist_short_names(name);
CREATE INDEX IF NOT EXISTS idx_groups_short_normalized  ON groups_short_names(name_normalized);
CREATE INDEX IF NOT EXISTS idx_groups_short_name        ON groups_short_names(name);

-- Delta-sync indexes: Worker queries filter by updated_at
CREATE INDEX IF NOT EXISTS idx_artist_updated_at            ON artist(updated_at);
CREATE INDEX IF NOT EXISTS idx_groups_updated_at            ON "groups"(updated_at);
CREATE INDEX IF NOT EXISTS idx_artist_alt_name_updated_at   ON artist_alt_name(updated_at);
CREATE INDEX IF NOT EXISTS idx_group_alt_name_updated_at    ON group_alt_name(updated_at);
CREATE INDEX IF NOT EXISTS idx_group_artist_updated_at      ON group_artist(updated_at);
CREATE INDEX IF NOT EXISTS idx_group_group_updated_at       ON group_group(updated_at);
CREATE INDEX IF NOT EXISTS idx_song_updated_at              ON song(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_updated_at             ON anime(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_name_updated_at        ON anime_name(updated_at);
CREATE INDEX IF NOT EXISTS idx_song_link_updated_at         ON song_link(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_list_updated_at        ON anime_list(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_genre_updated_at       ON anime_genre(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_tag_updated_at         ON anime_tag(updated_at);
CREATE INDEX IF NOT EXISTS idx_song_urls_updated_at         ON song_urls(updated_at);
CREATE INDEX IF NOT EXISTS idx_song_short_names_updated_at  ON song_short_names(updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_short_names_updated_at ON anime_short_names(updated_at);
CREATE INDEX IF NOT EXISTS idx_artist_short_names_updated_at ON artist_short_names(updated_at);
CREATE INDEX IF NOT EXISTS idx_groups_short_names_updated_at ON groups_short_names(updated_at);

COMMIT;