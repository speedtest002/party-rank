-- ============================================================
-- PartyRank Seed Data
-- Dùng để test local, KHÔNG chạy trên production
-- ============================================================

SET timezone = 'UTC';

-- Dọn dẹp trước khi seed (giữ nguyên thứ tự do FK)
TRUNCATE scores, participants, songs, party_ranks, users RESTART IDENTITY CASCADE;

-- ============================================================
-- users
-- ============================================================
INSERT INTO users (id, discord_id, discord_username, discord_avatar, role) VALUES
('bbbbbbbb-0000-0000-0000-000000000001', '456789012345678901', 'Admin_Peashooter', 'admin_hash_1', 'admin'),
('bbbbbbbb-0000-0000-0000-000000000002', '123123123123123123', 'Mod_Hatsune', 'mod_hash_2', 'admin');

-- ============================================================
-- party_ranks
-- ============================================================
INSERT INTO party_ranks (
  id, slug, name, description,
  spotify_url, youtube_url,
  starts_at, deadline,
  status,
  discord_guild_id, discord_channel_id, discord_message_id,
  created_by_discord_id,
  allow_resubmit, max_participants,
  score_min, score_max
) VALUES
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'mygo-s2-final',
  'MyGO!!!!! · Mùa 2 · Vòng Chung Kết',
  'Bình chọn bài hát hay nhất trong mùa 2 của MyGO!!!!!',
  'https://open.spotify.com/playlist/example',
  'https://music.youtube.com/playlist?list=example',
  NOW() - INTERVAL '2 days',   -- đã mở 2 ngày trước
  NOW() + INTERVAL '1 day',    -- còn 1 ngày nữa mới hết
  'open',
  '123456789012345678',         -- discord guild id
  '234567890123456789',         -- discord channel id
  '345678901234567890',         -- discord message id
  '456789012345678901',         -- created by
  FALSE, 10,
  0, 10
),
(
  'aaaaaaaa-0000-0000-0000-000000000002',
  'bang-dream-s1',
  'BanG Dream! · Mùa 1 · Tổng kết',
  'Top những bài hát BanG Dream hay nhất mùa 1',
  NULL, NULL,
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '3 days',   -- đã hết hạn
  'revealed',                   -- đã công bố kết quả
  '123456789012345678',
  '234567890123456789',
  NULL,
  '456789012345678901',
  FALSE, NULL,
  0, 10
);

-- ============================================================
-- songs — PR 1: mygo-s2-final (5 bài)
-- ============================================================
-- ann_song_id/ann_id/song_id là giả định cho seed, thực tế lấy từ anisongdb
-- song_type: 1=OP, 2=ED, 3=IN
-- PK là (pr_id, ann_song_id) — không còn id UUID
INSERT INTO songs (ann_song_id, pr_id, position, ann_id, song_id, anime, song_title, artist, song_type, audio_url, video_url) VALUES
(1001, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 101, 201, 'MyGO!!!!!',        'Asu no Yozora Shoukaihan',          'CRYCHIC',           1, 'https://example.com/audio/asu-no-yozora.mp3',      'https://example.com/video/asu-no-yozora.mp4'),
(1002, 'aaaaaaaa-0000-0000-0000-000000000001', 2, 101, 202, 'MyGO!!!!!',        'Haru no Kao',                       'MyGO!!!!!',         2, 'https://example.com/audio/haru-no-kao.mp3',         NULL),
(1003, 'aaaaaaaa-0000-0000-0000-000000000001', 3, 102, 203, 'Bocchi the Rock!', 'Guitar, Loneliness and Blue Planet', 'KESSOKU BAND',      3, 'https://example.com/audio/guitar-loneliness.mp3',  'https://example.com/video/guitar-loneliness.mp4'),
(1004, 'aaaaaaaa-0000-0000-0000-000000000001', 4, 103, 204, 'K-ON!',            'Don''t say "lazy"',                  'Houkago Tea Time',  2, 'https://example.com/audio/dont-say-lazy.mp3',      'https://example.com/video/dont-say-lazy.mp4'),
(1005, 'aaaaaaaa-0000-0000-0000-000000000001', 5, 104, 205, 'Hibike! Euphonium','Tutti!',                            'Kitauji Quartet',   3, NULL,                                                'https://example.com/video/tutti.mp4');

-- songs — PR 2: bang-dream-s1 (3 bài, đã revealed)
INSERT INTO songs (ann_song_id, pr_id, position, ann_id, song_id, anime, song_title, artist, song_type, audio_url, video_url) VALUES
(2001, 'aaaaaaaa-0000-0000-0000-000000000002', 1, 201, 301, 'BanG Dream!', 'Shuwarin☆Dreaming',             'Pastel*Palettes', 1, 'https://example.com/audio/shuwarin.mp3',    'https://example.com/video/shuwarin.mp4'),
(2002, 'aaaaaaaa-0000-0000-0000-000000000002', 2, 201, 302, 'BanG Dream!', 'STAR BEAT! ~Hoshi no Kodou~',   'Poppin''Party',   1, 'https://example.com/audio/star-beat.mp3',   NULL),
(2003, 'aaaaaaaa-0000-0000-0000-000000000002', 3, 201, 303, 'BanG Dream!', 'Goka! Gokai!? Phantom Thief!',  'Phantom Thief',   2, 'https://example.com/audio/goka-gokai.mp3',  'https://example.com/video/goka-gokai.mp4');

-- ============================================================
-- participants
-- PR 1: 5 người (3 submitted, 1 viewed, 1 invited)
-- ============================================================
INSERT INTO participants (
  id, pr_id,
  discord_id, discord_username, discord_avatar,
  token, status,
  invited_at, first_viewed_at, submitted_at, submit_count
) VALUES
(
  'cccccccc-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '111111111111111111', 'Anon#1023', 'abc123',
  'token-anon-1023-aaaa',
  'submitted',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 day 20 hours',
  NOW() - INTERVAL '1 day 19 hours',
  1
),
(
  'cccccccc-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '222222222222222222', 'Sakura#4421', 'def456',
  'token-sakura-4421-bbbb',
  'submitted',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 day 18 hours',
  NOW() - INTERVAL '1 day 17 hours',
  1
),
(
  'cccccccc-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '333333333333333333', 'Tomo#8823', 'ghi789',
  'token-tomo-8823-cccc',
  'submitted',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 day 10 hours',
  NOW() - INTERVAL '1 day 9 hours',
  1
),
(
  'cccccccc-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '444444444444444444', 'Haru#2201', 'jkl012',
  'token-haru-2201-dddd',
  'viewed',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '5 hours',  -- đã xem nhưng chưa nộp
  NULL, 0
),
(
  'cccccccc-0000-0000-0000-000000000005',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '555555555555555555', 'Rei#0097', 'mno345',
  'token-rei-0097-eeee',
  'invited',
  NOW() - INTERVAL '2 days',
  NULL, NULL, 0  -- chưa mở link
);

-- PR 2: 3 người (tất cả đã submitted vì đã revealed)
INSERT INTO participants (
  id, pr_id,
  discord_id, discord_username, discord_avatar,
  token, status,
  invited_at, first_viewed_at, submitted_at, submit_count
) VALUES
(
  'cccccccc-0000-0000-0000-000000000011',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '111111111111111111', 'Anon#1023', 'abc123',
  'token-anon-1023-pr2-ffff',
  'submitted',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '9 days',
  1
),
(
  'cccccccc-0000-0000-0000-000000000012',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '222222222222222222', 'Sakura#4421', 'def456',
  'token-sakura-4421-pr2-gggg',
  'submitted',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '8 days',
  1
),
(
  'cccccccc-0000-0000-0000-000000000013',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '666666666666666666', 'Yuki#5512', 'pqr678',
  'token-yuki-5512-pr2-hhhh',
  'submitted',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days',
  1
);

-- ============================================================
-- scores — PR 1 (3 người đã submitted × 5 bài)
-- ============================================================

-- Anon#1023
-- scores dùng ann_song_id INTEGER thay vì song_id UUID
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000001', 1003, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 9.5),
('cccccccc-0000-0000-0000-000000000001', 1001, 'aaaaaaaa-0000-0000-0000-000000000001', 2, 8.5),
('cccccccc-0000-0000-0000-000000000001', 1004, 'aaaaaaaa-0000-0000-0000-000000000001', 3, 8.0),
('cccccccc-0000-0000-0000-000000000001', 1002, 'aaaaaaaa-0000-0000-0000-000000000001', 4, 7.5),
('cccccccc-0000-0000-0000-000000000001', 1005, 'aaaaaaaa-0000-0000-0000-000000000001', 5, 6.5);

-- Sakura#4421
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000002', 1003, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 9.0),
('cccccccc-0000-0000-0000-000000000002', 1001, 'aaaaaaaa-0000-0000-0000-000000000001', 2, 9.0),
('cccccccc-0000-0000-0000-000000000002', 1004, 'aaaaaaaa-0000-0000-0000-000000000001', 3, 7.5),
('cccccccc-0000-0000-0000-000000000002', 1002, 'aaaaaaaa-0000-0000-0000-000000000001', 4, 7.0),
('cccccccc-0000-0000-0000-000000000002', 1005, 'aaaaaaaa-0000-0000-0000-000000000001', 5, 6.0);

-- Tomo#8823
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000003', 1003, 'aaaaaaaa-0000-0000-0000-000000000001', 1, 9.0),
('cccccccc-0000-0000-0000-000000000003', 1001, 'aaaaaaaa-0000-0000-0000-000000000001', 2, 9.0),
('cccccccc-0000-0000-0000-000000000003', 1004, 'aaaaaaaa-0000-0000-0000-000000000001', 3, 8.0),
('cccccccc-0000-0000-0000-000000000003', 1005, 'aaaaaaaa-0000-0000-0000-000000000001', 4, 6.5),
('cccccccc-0000-0000-0000-000000000003', 1002, 'aaaaaaaa-0000-0000-0000-000000000001', 5, 6.0);

-- ============================================================
-- scores — PR 2 (3 người × 3 bài, đã revealed)
-- ============================================================
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000011', 2002, 'aaaaaaaa-0000-0000-0000-000000000002', 1, 9.0),
('cccccccc-0000-0000-0000-000000000011', 2001, 'aaaaaaaa-0000-0000-0000-000000000002', 2, 8.0),
('cccccccc-0000-0000-0000-000000000011', 2003, 'aaaaaaaa-0000-0000-0000-000000000002', 3, 7.0);

-- Sakura#4421
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000012', 2001, 'aaaaaaaa-0000-0000-0000-000000000002', 1, 9.5),
('cccccccc-0000-0000-0000-000000000012', 2002, 'aaaaaaaa-0000-0000-0000-000000000002', 2, 8.5),
('cccccccc-0000-0000-0000-000000000012', 2003, 'aaaaaaaa-0000-0000-0000-000000000002', 3, 6.5);

-- Yuki#5512
INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score) VALUES
('cccccccc-0000-0000-0000-000000000013', 2002, 'aaaaaaaa-0000-0000-0000-000000000002', 1, 9.0),
('cccccccc-0000-0000-0000-000000000013', 2001, 'aaaaaaaa-0000-0000-0000-000000000002', 2, 8.0),
('cccccccc-0000-0000-0000-000000000013', 2003, 'aaaaaaaa-0000-0000-0000-000000000002', 3, 7.5);

-- ============================================================
-- Kiểm tra nhanh sau khi seed
-- ============================================================
-- SELECT slug, status, deadline FROM party_ranks;
-- SELECT anime, song_title, final_rank, avg_score, vote_count FROM song_results WHERE pr_id = 'aaaaaaaa-0000-0000-0000-000000000001' ORDER BY final_rank;
-- SELECT discord_username, status FROM participants WHERE pr_id = 'aaaaaaaa-0000-0000-0000-000000000001';
