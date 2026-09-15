# PartyRank — Tính năng "Video Reveal" (Remotion)

> Tài liệu đặc tả để đưa cho coding agent build. Viết theo 3 góc nhìn: **Customer** (muốn gì), **Designer** (trông như thế nào), **PM** (build ra sao, khi nào xong). Đọc từ trên xuống dưới theo đúng thứ tự ưu tiên.

---

## 1. Bối cảnh

PartyRank là web app (Discord-integrated) cho phép một nhóm bạn cùng chấm điểm một playlist nhạc anime (OP/ED). Khi một "party rank" đóng vote (`status = 'closed'`) và được host công bố (`status → 'revealed'`), hệ thống cần **tự động render ra 1 video đếm ngược** hiển thị kết quả — mỗi bài hát là 1 cảnh, phát clip OP/ED gốc kèm overlay hiển thị điểm số của từng người tham gia.

Đây **không phải** một tool video editor cho người dùng thao tác tay — đây là **render engine tự động, chạy server-side**, sinh video sẵn để đăng lên Discord / YouTube / TikTok.

Schema DB liên quan (đã có sẵn): `party_ranks`, `songs`, `participants`, `scores`, view `song_results`.

---

## 2. Góc nhìn Customer — muốn gì

> *(Viết như lời yêu cầu của người dùng cuối / host của party rank)*

- "Tôi muốn sau khi đóng vote, chỉ cần bấm 1 nút 'Reveal', hệ thống tự làm ra video, tôi không phải tự dựng."
- "Video phải giữ được không khí hồi hộp — thấy avatar bạn bè, thấy điểm từng người, không chỉ là con số trung bình khô khan."
- "Số người tham gia mỗi lần khác nhau (có lúc 5 người, có lúc 50 người) — layout phải tự đẹp ở mọi trường hợp, tôi không muốn phải tự chỉnh tay."
- "Tôi muốn video xong tự động được bot đăng lại vào đúng thread Discord của group đó."
- "Sau này tôi có thể muốn đăng lên TikTok — nên nếu làm được cả bản dọc (9:16) thì tốt, nhưng bản ngang (16:9) là ưu tiên trước."

---

## 3. Phạm vi (Scope)

**Trong phạm vi (MVP):**
- Render 1 video/1 bài hát (1 "scene") từ dữ liệu party rank đã đóng.
- Layout động theo số người tham gia N.
- Tỉ lệ khung hình 16:9.
- Trigger tự động khi `status → 'revealed'`.
- Lưu output vào storage, trả về URL.

**Ngoài phạm vi (để sau — V2):**
- Ghép tất cả bài thành 1 video countdown liền mạch (concat).
- Bản dọc 9:16 cho TikTok/Shorts.
- Bot tự đăng video vào Discord thread.
- Cho phép host tùy biến theme màu/nhạc nền giới thiệu riêng.

---

## 4. Góc nhìn Designer — đặc tả giao diện video

### 4.1 Composition

| Thuộc tính | Giá trị |
|---|---|
| Kích thước | 1920×1080 (16:9), fps = 30 |
| Thời lượng / scene | 8 giây mặc định (có thể override bằng `clipDurationSeconds`) |
| Nền | Đen tuyền `#0A0A0A`, video nguồn phát full-bleed ở giữa khung hình |

### 4.2 Bảng màu

| Vai trò | Màu | Ghi chú |
|---|---|---|
| Nền tổng | `#0A0A0A` | gần đen, không dùng đen tuyệt đối để đỡ gắt |
| Chữ chính | `#FFFFFF` | tên người chấm, tiêu đề |
| Accent / viền khung số | `#5865F2` (Discord Blurple) | vì app gắn liền Discord — dùng làm màu thương hiệu mặc định, **có thể đổi nếu customer có brand color khác** |
| Điểm cao nhất bài đó | `#22C55E` (xanh lá) | viền + nền ô điểm |
| Điểm thấp nhất bài đó | `#EF4444` (đỏ) | viền + nền ô điểm |
| Điểm bình thường | `#3A3A3A` nền / `#FFFFFF` chữ | |

### 4.3 Typography

- Font chính: **Inter** (hoặc font sans hệ thống tương đương) — dễ đọc ở kích thước nhỏ, nhiều ngôn ngữ.
- Số điểm/rank: `font-weight: 800`, số liệu luôn căn giữa trong box.
- Tên người chấm: `font-weight: 500`, truncate nếu quá dài (max 1 dòng).

### 4.4 Bố cục (wireframe mô tả bằng chữ)

```
┌─────────────────────────────────────────────────────────┐
│  [#Rank]        [ TÊN ANIME — OP/ED ]         [ALLA...]  │ ← thanh tiêu đề, cao ~10% khung hình
├───────────┬───────────────────────────────┬──────────────┤
│           │                               │              │
│  Cột trái │                               │   Cột phải   │
│  (grid    │      VIDEO NGUỒN (OP/ED)      │   (grid      │
│  người    │      phát full, không crop    │   người      │
│  chấm)    │                               │   chấm)      │
│           │                               │       [Tổng] │ ← khung tổng điểm, góc dưới-phải vùng video
├───────────┴───────────────────────────────┴──────────────┤
│              "Tên bài" by Nghệ sĩ (caption)               │ ← thanh dưới cùng, cao ~8%
└─────────────────────────────────────────────────────────┘
```

Mỗi ô người chấm (participant tile) gồm: avatar hình vuông bo góc nhẹ (`border-radius: 8px`) + tên phía trên + box điểm số phía dưới avatar (giống mẫu tham khảo AllAnimeTops).

### 4.5 Quy tắc grid động theo N (số người tham gia)

| N (số người) | Bố cục | Kích thước tile | Ghi chú |
|---|---|---|---|
| ≤ 8 | 1 cột mỗi bên | ~140×140px | tile to, dễ nhìn |
| 9–20 | 2 cột mỗi bên | ~100×100px | giống mẫu tham khảo |
| 21–40 | 3 cột mỗi bên | ~75×75px | thu nhỏ font tên |
| > 40 | 3 cột mỗi bên, **chỉ hiện tối đa 40 người** (ưu tiên người có điểm lệch xa trung bình nhất — thú vị hơn để xem), thêm 1 tile cuối "+N người khác" | ~75×75px | tránh vỡ layout |

> Yêu cầu kỹ thuật: layout PHẢI dùng CSS Grid/Flexbox tự động co giãn theo N (không hard-code tọa độ từng ô), vì đây là component React trong Remotion.

### 4.6 Animation timeline (mỗi scene ~8s)

| Thời điểm | Sự kiện |
|---|---|
| 0.0s | Video nguồn + audio bắt đầu phát ngay |
| 0.0s–0.6s | Thanh tiêu đề + khung rank số fade/slide in từ trên xuống |
| 0.2s–1.2s | Các tile người chấm fade-in + scale bounce nhẹ, so le nhau (~30ms/tile — dùng `stagger` của Remotion) |
| 0.3s–1.3s | Số điểm mỗi người **đếm chạy từ 0 lên giá trị thật** (tạo cảm giác hồi hộp) |
| 1.5s–2.2s | Khung tổng điểm (góc dưới phải) đếm chạy lên sau khi các điểm cá nhân xong |
| 2.2s → hết scene | Giữ nguyên overlay, caption tên bài/nghệ sĩ fade-in ở thanh dưới, giữ đến hết 8s |

### 4.7 Trạng thái highlight

- Người chấm điểm **cao nhất** cho bài đó: box điểm màu xanh `#22C55E`, có thể thêm icon ⭐ nhỏ góc box.
- Người chấm điểm **thấp nhất**: box điểm màu đỏ `#EF4444`.
- Nếu hòa (nhiều người cùng cao nhất/thấp nhất): tất cả cùng được highlight, không chỉ 1 người.
- Logic tính `isHighest`/`isLowest` phải được **tính sẵn ở tầng data (API), không tính trong component render**.

---

## 5. Data Contract — JSON đầu vào cho Remotion

Đây là **shape chuẩn** mà 1 API endpoint nội bộ phải trả về cho mỗi bài hát, Remotion chỉ nhận và render, không tự query DB:

```json
{
  "partyRankId": "uuid",
  "partyRankName": "string",
  "song": {
    "annSongId": 12345,
    "rank": 8,
    "totalSongs": 20,
    "animeName": "string",
    "songTitle": "string",
    "artist": "string",
    "songType": "OP",
    "videoUrl": "https://...",
    "coverUrl": "https://...",
    "clipStartSeconds": 0,
    "clipDurationSeconds": 8,
    "avgScore": 8.6,
    "voteCount": 14
  },
  "participants": [
    {
      "discordId": "string",
      "displayName": "string",
      "avatarUrl": "https://cached-storage/...",
      "score": 9.5,
      "personalRank": 3,
      "isHighest": true,
      "isLowest": false
    }
  ]
}
```

**Lưu ý bắt buộc:** `avatarUrl` phải trỏ tới bản **đã cache ở storage riêng** (S3/R2/Cloudinary), KHÔNG dùng trực tiếp link Discord CDN — vì avatar có thể đổi/hết hạn giữa lúc vote và lúc render, và Discord CDN có thể rate-limit khi render hàng loạt.

---

## 6. Góc nhìn PM — đặc tả kỹ thuật & kiến trúc

### 6.1 Vị trí trong codebase

- Tạo package/app riêng trong repo hiện có, ví dụ `apps/render` hoặc `packages/remotion`, KHÔNG nhét chung vào web app chính — vì Remotion có thời gian build/render nặng, tách riêng dễ deploy độc lập.

### 6.2 Luồng dữ liệu

1. Backend có 1 endpoint mới: `GET /api/party-ranks/:id/render-data` → trả về **mảng** các object theo Data Contract ở mục 5, đã sort theo `rank` (thấp lên cao, để dựng đếm ngược), đã tính sẵn `isHighest`/`isLowest`.
2. Render worker gọi endpoint này, lấy JSON, loop qua từng bài, gọi Remotion (`renderMedia()`) với `inputProps` = 1 object bài hát.
3. Mỗi bài render ra 1 file `.mp4` riêng, upload lên storage (S3/R2), lưu URL.

### 6.3 Trigger & tự động hóa

- Khi `party_ranks.status` chuyển `'closed' → 'revealed'` (transition này nên đi qua 1 action rõ ràng ở backend, không update trực tiếp field), enqueue 1 background job (đề xuất: **BullMQ** nếu đã dùng Redis, hoặc **pg-boss** nếu muốn ở lại trong Postgres — không cần thêm hạ tầng mới).
- Job xử lý tuần tự từng bài (tránh render song song quá nhiều gây quá tải CPU), cập nhật tiến độ vào 1 bảng mới (xem 6.5) để frontend có thể hiển thị "đang xử lý X/N bài".

### 6.4 Output & lưu trữ

- File `.mp4` lưu ở object storage (S3-compatible), đặt tên dạng `party-ranks/{pr_id}/songs/{ann_song_id}.mp4`.
- Không bắt buộc CDN riêng ở MVP — link storage trực tiếp là đủ.

### 6.5 Bảng DB đề xuất thêm

```sql
CREATE TABLE renders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id        UUID NOT NULL REFERENCES party_ranks(id) ON DELETE CASCADE,
  ann_song_id  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'rendering', 'done', 'failed')),
  video_url    TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (pr_id, ann_song_id) REFERENCES songs(pr_id, ann_song_id) ON DELETE CASCADE,
  UNIQUE (pr_id, ann_song_id)
);
```

### 6.6 Xử lý lỗi cần có

- Bài hát thiếu `video_url` (song chưa resolve được từ anisongdb) → skip, đánh dấu `status = 'failed'`, không chặn các bài khác trong hàng đợi.
- Avatar cache lỗi/404 → dùng avatar mặc định (placeholder), không fail cả job.
- Timeout render 1 bài quá lâu (đề xuất ngưỡng 60s/bài) → retry tối đa 1 lần rồi đánh `failed`.

---

## 7. Yêu cầu phi chức năng (Non-functional)

- Render 1 bài không được vượt quá ~60 giây trên hạ tầng dự kiến (kiểm chứng thực tế khi build xong, không phải con số cứng).
- Layout PHẢI test qua ít nhất 3 mốc N (5, 20, 50 người) trước khi coi là "done" — xem mục 8.
- Toàn bộ text hiển thị phải hỗ trợ tiếng Việt có dấu (không bị lỗi font/encoding).

---

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

- [ ] Với 1 party rank có ≥ 2 bài hát và ≥ 3 người tham gia, bấm "Reveal" tạo ra đủ số video tương ứng số bài.
- [ ] Layout hiển thị đúng, không vỡ, ở cả 3 mốc N = 5, N = 20, N = 50.
- [ ] Người có điểm cao nhất/thấp nhất mỗi bài được highlight đúng màu quy định.
- [ ] Nếu 1 bài thiếu `video_url`, hệ thống không crash toàn bộ job, các bài khác vẫn render xong.
- [ ] Video output có audio đồng bộ với clip nguồn, không lệch tiếng.
- [ ] Có thể xem tiến độ render (X/N bài xong) từ phía host trong lúc chờ.

---

## 9. Lộ trình triển khai

**Phase 1 — MVP**
1. Xây endpoint `render-data` + bảng `renders`.
2. Component Remotion tĩnh (N cố định, dữ liệu giả) — chốt design trước khi làm động.
3. Grid động theo N + test 3 mốc N.
4. Nối job queue + trigger theo `status`.
5. Output lên storage, hiển thị link cho host.

**Phase 2 (sau MVP, không làm ngay)**
- Ghép toàn bộ bài thành 1 video countdown liền mạch.
- Bản 9:16 cho TikTok/Shorts.
- Bot Discord tự đăng video vào thread.

---

## 10. Câu hỏi mở — cần chốt trước khi build

1. Brand color chính thức của PartyRank là gì? (tài liệu này tạm dùng Discord Blurple `#5865F2` làm mặc định)
2. `clipStartSeconds` lấy từ đâu — anisongdb có sẵn timestamp hook/chorus, hay cần host tự chọn tay?
3. Với N > 40, ưu tiên hiển thị "người có điểm lệch xa trung bình nhất" có đúng ý muốn không, hay nên là "random" / "theo alphabet"?
4. Audio gốc video có cần xử lý âm lượng chuẩn hóa (loudness normalization) giữa các bài không, hay giữ nguyên như nguồn?
