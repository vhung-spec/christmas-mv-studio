# MV Prompt Studio 🎙️

Công cụ tạo **bộ prompt video hoàn chỉnh** cho MV phong cách 1950s American (Doo-Wop, Rock & Roll, Rockabilly).
Bạn chỉ nhập **ý tưởng** của từng bài (1 dòng), công cụ tự sinh:

- **Character Bible**: mô tả cố định của cặp đôi, được chèn **nguyên văn** vào mọi prompt để nhân vật nhất quán giữa các clip.
- **Storyboard** chia theo cấu trúc bài hát (Intro → Verse → Pre-chorus → Chorus → … → Outro), mỗi cảnh có thời gian, mô tả tiếng Việt và **prompt tiếng Anh** đã gắn style preset ở cuối.
- **Thumbnail prompt**, 3 gợi ý **tiêu đề YouTube**, **mô tả** theo giọng văn kênh và **ghi chú dựng phim**.
- **Kiểm tra niên đại** (xe đời sau, điện thoại, LED, vòng đu quay trên Santa Monica Pier…), độ dài prompt, chữ trên màn hình, thương hiệu/người thật, nhịp dựng và **trùng lặp trong series**.

Chạy được **hàng loạt** (ví dụ 50 bài một lần) và xuất **XLSX (mỗi MV một sheet)**, CSV, Markdown, TXT, JSON, “Copy tất cả prompt” hoặc **File prompt (.txt)** — chỉ gồm các prompt, mỗi prompt cách nhau một dòng trống.

Khi công cụ tạo video trả clip về, app **ghép clip với nhạc thành MV hoàn chỉnh (MP4)**: ghép nguyên từng clip theo thứ tự cảnh và lặp lại cho tới hết bài (xem mục 2b).

Dùng **Muse (Meta)** thì app lo luôn phần clip: app tự gửi từng cảnh cho Muse, clip nào xong tự vào đúng cảnh, đủ clip thì tự dựng (mục 2c). Menu **Tự động** chạy trọn **ý tưởng → kịch bản → bài hát → clip → MP4** bằng một nút (mục 2d).

---

## 1. Bắt đầu nhanh (không cần biết code)

1. **Cài Node.js** (một lần): tải bản **LTS** tại <https://nodejs.org> và cài như phần mềm bình thường.
2. **Tải app**: trên GitHub bấm **Code → Download ZIP**, rồi giải nén ra một thư mục (ví dụ `Documents/MV Prompt Studio`).
3. **Mở app**: bấm đúp vào
   - Windows: **`Chay-MV-Prompt-Studio.bat`**
   - macOS: **`Chay-MV-Prompt-Studio.command`** (lần đầu: chuột phải → *Open* → *Open* để macOS cho phép chạy.
     Nếu báo không có quyền chạy: mở Terminal, gõ `bash ` rồi kéo file này vào cửa sổ Terminal và nhấn Enter.)

   Lần đầu app tự cài thư viện và chuẩn bị (vài phút), các lần sau chỉ vài giây. Trình duyệt tự mở trang app.
   **Giữ cửa sổ đen (terminal) mở** trong khi dùng; đóng nó là tắt app.
4. Vào **Cài đặt → Cách tạo nội dung** và chọn một trong hai cách bên dưới.

### Chọn cách tạo nội dung

| | **claude.ai (copy – dán)** | **Claude API** |
|---|---|---|
| Cần gì | Tài khoản claude.ai (Free/Pro/Max) | API key (trả phí theo token) |
| Chi phí | **0 đ** phí API (dùng gói claude.ai của bạn) | khoảng **$0,10–0,20 / MV** (≈ 2.800–5.400 đ) với `claude-sonnet-5-5` |
| Cách làm | Mỗi MV: bấm **Copy yêu cầu** → dán vào claude.ai → dán câu trả lời lại vào app | Bấm **Chạy batch**, app tự làm hết (50 bài một lần) |
| Hợp với | Làm vài bài mỗi ngày | Làm hàng loạt |

- Chế độ **Tự động** (mặc định): có API key thì dùng API, chưa có thì dùng claude.ai.
- **Nhập API key ngay trong app**: Cài đặt → *API key của Claude* → dán key → **Lưu key** (app kiểm tra key luôn). Key được lưu trong file `.env.local` trên máy bạn.
  Lấy key tại <https://platform.claude.com/settings/keys>.
- Còn chế độ **Demo** (ghép từ mẫu, không dùng AI) để thử giao diện.

### Chi phí ($ và đ)

- Trước khi chạy, bảng xem trước hiện **ước tính chi phí** cho cả batch và trung bình mỗi MV.
- Sau khi chạy bằng API, app ghi **chi phí thật** (theo số token Claude báo về, gồm cả các lần sinh lại cảnh) ở trang kết quả, trang batch (tổng cả batch),
  Lịch sử (từng MV, tổng series, tổng phần đã chọn) và sheet “Tổng quan” trong file XLSX.
- Sửa **bảng giá** và **tỷ giá đ/USD** ở Cài đặt → *Chi phí & tỷ giá* (mặc định 26.000 đ/USD). Chi phí render clip trên Veo/Kling… không tính ở đây.

## 2. Cách dùng

1. **Nhập ý tưởng** → tab **Dán bảng** → bấm **“Dùng 5 dòng ví dụ”** (hoặc dán bảng của bạn từ Google Docs/Sheets) → **Đọc bảng & xem trước**.
   Bảng xem trước cho biết năm, địa điểm đã khớp thư viện hay sẽ tự suy luận, chủ đề có trong thư viện chưa, số prompt và chi phí ước tính.
2. - **Claude API**: bấm **Chạy batch** → trang **Chạy batch** hiện thanh tiến trình. Có thể **Tạm dừng**, **Dừng ngay**, **Chạy tiếp**, **Thử lại mục lỗi**.
     Batch vẫn chạy khi bạn chuyển sang xem trang khác; nếu tải lại trang, bấm “Chạy tiếp”.
   - **claude.ai**: bấm **Tạo … yêu cầu cho claude.ai** → trang **claude.ai** liệt kê từng MV với 3 bước: **Copy yêu cầu** → **Mở claude.ai** (cuộc trò chuyện mới, dán, gửi)
     → dán câu trả lời của Claude vào ô và bấm **Hoàn tất MV**.
3. Bấm **Mở storyboard** để xem từng MV: mỗi cảnh có nút **Copy prompt**, **Sinh lại cảnh này** (kèm yêu cầu, vd. “góc máy khác”; ở chế độ claude.ai cũng là copy – dán) và **Sửa tay**.
4. Xuất file: **XLSX** (sheet “Tổng quan” + mỗi MV một sheet), **CSV** (có cột `mv_id`), **MD/TXT** (đọc nhanh), **JSON** (nhập lại được ở trang Lịch sử), **Copy tất cả prompt** (mỗi prompt một dòng), hoặc **File prompt (.txt)**: chỉ gồm các prompt, mỗi prompt cách nhau một dòng trống — tiện nhập hàng loạt vào công cụ tạo video. Có ở trang batch, trang kết quả và Lịch sử (cả theo series).

## 2b. Ghép video với nhạc (ra MP4 hoàn chỉnh)

Trên trang kết quả của MV bấm **🎬 Ghép video với nhạc**:

1. **Bài hát**: chọn hoặc thả file nhạc (MP3, WAV, M4A, FLAC…). App đo độ dài, **nhận nhịp (BPM)** và vẽ dạng sóng âm.
2. **Clip video**: **thả tất cả clip (hoặc cả thư mục) vào một lần** — hoặc bấm **Chọn clip** / **Chọn cả thư mục**. Không cần chọn cho từng cảnh:
   app tự xếp — file có số cảnh trong tên (`shot-03.mp4`, `cảnh 3.mov`, `03.mp4`) vào đúng chỗ, còn lại theo **thứ tự tên file**
   (nên tải clip về theo thứ tự cảnh, vd. `veo_20261019_101500.mp4`, `veo_20261019_102233.mp4`…). Có **nhiều clip hơn số cảnh** cũng được:
   clip thêm được phát nối tiếp sau cảnh cuối. Các clip hiện thành một dải theo đúng thứ tự phát; muốn tải bộ khác thì **Xoá tất cả clip**.
   Mục **Sửa từng cảnh** (không bắt buộc) để thay / chuyển một clip, hoặc copy prompt cho cảnh còn thiếu.
3. **Cách dựng** — chọn một trong hai cách ghép:
   - **Ghép nguyên clip, lặp đến hết bài** (mặc định): mỗi clip phát **trọn vẹn** (không cắt nhỏ) theo thứ tự cảnh 1 → N; hết lượt thì lặp lại từ clip 1
     cho tới khi hết nhạc, clip cuối được cắt đúng lúc bài kết thúc. Ví dụ 20 clip × 8 giây = một vòng 2:40; bài 3:00 → phát 20 clip rồi lặp thêm 3 clip đầu.
     **🎲 Xáo các vòng sau**: vòng đầu vẫn theo thứ tự, các vòng lặp sau đổi thứ tự (không bao giờ hai clip giống nhau liền nhau).
   - **Cắt theo nhịp nhạc**: cắt clip thành nhiều nhát ngắn 2–5 giây, đoạn nào dùng cảnh của đoạn đó, điểm cắt đúng phách.

   Tuỳ chọn chung: khung hình (1080p, 720p, dọc 9:16 cho Shorts/TikTok), cắt cho đầy khung hay thêm viền đen, 24/30 hình/giây, mờ dần đầu/cuối,
   lật ngang khi lặp. Xem trước ngay trên **timeline** (bấm vào để nghe từ chỗ đó).
4. **Âm thanh, logo & intro** (cách xuất của Bokin Studio Music):
   - **Cân bằng âm lượng**: Chuẩn YouTube −14 LUFS (mặc định), −18 LUFS (mặc định của Bokin Studio Music), hoặc tắt.
   - **Chất lượng xuất**: YouTube (đẹp nhất) hoặc Nhanh (để xem thử).
   - **Logo kênh** ở góc: vị trí, cỡ, độ hiện, lề, cắt tròn, hiện từ giây thứ mấy.
   - **Intro tiêu đề**: tiêu đề (để trống = tên bài), dòng phụ (vd. tên kênh), độ dài, độ nhoè nền, font riêng (.ttf/.otf) nếu muốn.
   - **Thông tin video** ghi vào file MP4 **tự động cho từng MV** từ gợi ý lúc dựng kịch bản: tiêu đề = gợi ý tiêu đề YouTube số 1,
     mô tả = mô tả YouTube, từ khoá = các hashtag trong mô tả, năm = năm dựng; chỉ cần nhập một lần **tên kênh** và **thể loại**.
     File tải về cũng mang tên theo tiêu đề đó — YouTube lấy tên file làm tiêu đề mặc định khi upload.
   - **Xem thử khung hình** ở một giây bất kỳ để kiểm tra logo / intro mà không cần dựng cả video.
5. Bấm **Dựng video** → xem ngay trên trang và **Tải MP4 về máy**. File cũng nằm trong `data/media/<mã MV>/`.
   Dưới video có báo cáo: âm lượng trước → sau, đỉnh tiếng, và kết quả kiểm tra (đủ khung hình, độ dài hình/tiếng).

### Dựng nhiều MV một lượt: **Hàng chờ dựng**

Thiết lập ở bước 3–4 (cách ghép, khung hình, chất lượng, âm lượng, logo, font, intro, thông tin video) là **thiết lập chung cho mọi MV** —
chỉ cần chọn **một lần**, sửa ở trang của MV nào hay ở trang **Hàng chờ dựng** cũng là sửa chung. Tiêu đề intro / tiêu đề video để trống thì mỗi MV
tự lấy tên bài của mình. Riêng nhạc, clip, BPM và mốc các đoạn (khi cắt theo nhịp) là của từng MV.

Trang **Hàng chờ dựng** (thanh menu trên cùng):

1. **Thiết lập dựng** — xem / sửa thiết lập chung (có nút xem thử khung hình).
2. **Chọn MV để dựng** — bảng mọi MV với tình trạng bài hát và số clip; **Chọn tất cả MV đủ nhạc + clip** → **Thêm & ▶ chạy ngay**
   (hoặc chỉ thêm vào hàng chờ rồi chạy sau). MV chưa có nhạc / clip không chọn được — bấm **Tải nhạc / clip** để mở trang của MV đó.
3. **Hàng chờ** — app dựng **lần lượt từng MV** (mỗi lúc một MV để máy không quá tải), hiện tiến độ của MV đang dựng; xong MV nào có nút **⬇ Tải MP4** ngay.
   **‖ Dừng sau MV này**, **✖ Huỷ MV đang dựng**, **↻ Dựng lại** mục lỗi / bỏ qua, **Xoá các mục đã xong**. MV thiếu nhạc hoặc clip được **bỏ qua** (ghi rõ lý do)
   và app dựng tiếp MV sau.

Cũng thêm được MV vào hàng chờ từ trang Ghép video của MV (**➕ Thêm vào hàng chờ**) hoặc từ trang **Lịch sử** (chọn nhiều MV → **🎬 Thêm vào hàng chờ dựng**).
Hàng chờ được lưu lại (`data/render_queue.json`); nếu tắt app giữa chừng, MV đang dựng dở sẽ quay về hàng chờ — mở app, bấm **▶ Chạy hàng chờ** để tiếp tục.

App dựng thế nào:

- Ghép nguyên clip: các clip nối liền nhau, chuyển clip đúng khung hình; cảnh nào chưa có clip thì bỏ qua và lặp các clip đã có.
  Nếu cuối bài chỉ còn chưa tới 1 giây, app giữ khung cuối của clip đang phát (lúc đó hình đang mờ dần) thay vì chớp sang clip mới.
  Clip giống hệt nhau ở các vòng lặp chỉ phải dựng một lần nên nhanh hơn.
- Cắt theo nhịp: mỗi đoạn của bài (Intro, Verse, Chorus…) dùng **cảnh của chính đoạn đó**, đoạn thiếu clip mượn cảnh cùng loại (vd. Chorus 1 ↔ Chorus 2),
  lần lặp sau lấy **khúc khác** trong clip; điệp khúc cắt nhanh (khoảng 2–2,5 giây/nhát), verse ~4 giây, intro/outro giữ lâu hơn; khi nhận ra nhịp,
  mọi điểm cắt rơi **đúng phách nhạc**. Các đoạn được giãn theo độ dài thật của bài; nếu điệp khúc thật bắt đầu ở chỗ khác, mở **Mốc các đoạn trong bài**,
  phát nhạc và bấm **⏱ Đặt ở đây** đúng lúc đoạn bắt đầu.
- Tiếng của clip (Veo có tiếng) được tắt — MV chỉ dùng nhạc của bài. Video xuất ra là MP4 H.264 + AAC, xem được trên mọi máy và tải thẳng lên YouTube.
- **Khâu xuất chuyển từ engine của Bokin Studio Music** (`loop_music/loudness.py`, `quality.py`, `branding.py`, `engine.py`):
  - Bài hát được chuẩn hoá về 48 kHz stereo 24-bit (bài mono được nhân đôi đúng mức).
  - Âm lượng được đo bằng ebur128 (true peak), rồi chỉnh bằng **một mức gain cố định** = min(mục tiêu − độ to, −1,5 dBTP − đỉnh, +12 dB) — không nén, không loudnorm.
  - Sau khi mã hoá AAC, app đo lại đỉnh trên tiếng đã giải mã; vượt trần thì giảm gain và mã hoá lại (tối đa 3 lần).
  - Preset YouTube: H.264 High, CRF 17, giới hạn bitrate theo bảng upload SDR của YouTube (×1,5), keyframe mỗi nửa giây, không B-frame, đổi màu sang BT.709 (lanczos) và gắn thẻ màu cho mọi khung, AAC 384 kbps.
  - Logo (mặt nạ tròn, độ hiện, mờ dần) và intro "title" (mờ từ đen 1,5 s, chữ hiện từ 0,6 s, tắt trong giây cuối, nền nhoè rồi rõ dần 1,5 s) giữ đúng thông số của Bokin Studio Music.
    Chữ được đọc từ file (libass hoặc drawtext) nên không phải escape tên bài.
  - Trước khi công bố file, app **kiểm tra đầu ra**: giải mã toàn bộ hình và tiếng, đúng H.264 + AAC, đủ số khung hình, độ dài hình và tiếng lệch bài hát không quá 0,1 giây.
- Phần ghép / lặp 15–20 clip là của MV Prompt Studio — engine của Bokin Studio Music chỉ lặp một video nền dưới danh sách bài.
- Muốn tự dựng trong CapCut / Premiere: bấm **Danh sách cắt (.csv)** để có thời điểm và clip của từng nhát cắt.
- Cần **ffmpeg**: app tự cài kèm (`ffmpeg-static`) khi chạy file khởi động. Nếu báo thiếu, cài ffmpeg (Windows: `winget install ffmpeg`, macOS: `brew install ffmpeg`)
  hoặc đặt biến môi trường `FFMPEG_PATH` trỏ tới file ffmpeg.
- Thời gian dựng (máy thử 4 nhân, bài 3 phút, 20 clip, 1080p, chất lượng YouTube): ghép nguyên clip khoảng **2 phút** (bật lật ngang khi lặp: khoảng 2 phút 30 giây,
  vì clip lật phải dựng riêng), cắt theo nhịp khoảng **2 phút 50 giây**. Chất lượng Nhanh và 720p nhanh hơn nhiều.

### Cách chạy cho người dùng dòng lệnh

```bash
npm install
npm run dev          # http://127.0.0.1:3000 (tự cập nhật khi sửa mã)
# hoặc bản tối ưu:
npm run build && npm start
# hoặc giống file bấm đúp: node scripts/start.mjs
```

API key cũng có thể đặt trong file `.env` (xem `.env.example`). App chỉ mở trên máy của bạn (`127.0.0.1`), máy khác trong mạng không truy cập được.

### Định dạng bảng đầu vào

Mỗi dòng: `id | world_location | theme | outline | [tên bài] | [thời lượng] | [nhịp] | [lời] | [series]`
(tách bằng **tab** khi copy từ Sheets, hoặc bằng `|`). Có thể có dòng tiêu đề, tiếng Việt hay tiếng Anh đều được. Bảng copy (hoặc tải về dạng .txt) từ
**Google Docs** — mỗi ô nằm trên một dòng riêng — app cũng tự nhận ra; tiêu đề bảng kiểu `1–50 · California – …` được dùng làm series:

| Trường | Bắt buộc | Ví dụ |
|---|---|---|
| `id` | có (tự đánh số nếu thiếu) | `1` |
| `world_location` | có — **nên có năm** | `Hollywood Boulevard Summer 1954` |
| `theme_code` | có | `T01` hoặc `T01 Sét ái tình` |
| `outline` | có (tiếng Việt) | `Chàng trai bắt gặp cô gái…` |
| `song_title` | không | `Ferris Wheel Heart` |
| `duration_sec` | không (mặc định 180) | `200`, `3:20` |
| `bpm` / `tempo` | không | `slow`, `mid`, `fast`, `150` |
| `lyrics` | không | lời bài hát; nên có nhãn `[Verse 1]`, `[Chorus]`… |
| `series` | không | `1–50 · California – Las Vegas – Route 66 – New York` |

Upload **CSV/XLSX**: dòng đầu là tiêu đề cột như trên (sheet đầu tiên của file XLSX được đọc).

## 2c. Tạo clip bằng Muse

**Muse** là trợ lý AI của Meta (muse.ai) — nó làm được video từ prompt. App có hai cách gửi cảnh cho Muse (chọn ở **Cài đặt → Tạo clip bằng Muse**):

| | **Tự động (Muse trong app)** — mặc định | **HaoHao (dán tay)** — dự phòng |
|---|---|---|
| Gửi đi | App **tự gửi** từng cảnh (kèm ảnh tham chiếu nhân vật nếu có) | App copy prompt, bạn **dán một lần** vào tab Studio của HaoHao |
| Nhận về | Tự động: clip xong tự vào đúng cảnh | Tự động: app **chỉ đọc** hàng đợi của HaoHao (`tasks.json`), so nội dung prompt để biết clip của cảnh nào |
| Cần gì | Google Chrome | Tool HaoHao đã cài và đăng nhập |

Cả hai cách đều: tiến độ từng cảnh trên app, MV đủ clip + có bài hát thì **tự vào hàng chờ dựng** (tắt được), tắt app giữa chừng mở lại vẫn nhận tiếp
(tiến độ lưu ở `data/muse.json`).

### Muse trong app làm việc thế nào

App mở **Google Chrome với profile riêng**, gửi prompt vào Muse như người gõ (“Tạo video · tỷ lệ 16:9 ngang” + prompt), chờ Muse làm xong rồi tải video về.
Phần này chạy ngay trong app (mã ở `src/lib/museEngine/`), không có server hay cổng mạng riêng; tắt app là Chrome của Muse cũng tắt.

- **Làm lần lượt từng cảnh** trên một tài khoản Muse, nghỉ khoảng 15 giây giữa hai lần gửi (không gửi dồn). Một cảnh mất khoảng 1–2 phút.
  Thử thật 20/10/2026 (2 cảnh): Muse ra clip **10 giây, 1280×720, 24 hình/giây, H.264, có tiếng** (AAC mono — MV tắt tiếng clip), đúng nội dung prompt.
- **Không tự gửi lại** khi Muse đã nhận lệnh: mất mạng lúc chờ thì app dò lại đúng phiên đó (không tốn thêm lượt). Muse không ra video → cảnh báo lỗi kèm
  lời Muse trả lời.
- **Hết hạn mức**: Muse không còn cho xem % hạn mức tuần (trang Muse đã đổi). Khi Muse **báo hết hạn mức** (lúc từ chối lệnh hoặc trong câu trả lời), app
  tạm dừng gửi, trả cảnh về hàng chờ (không tính lượt) — bấm **Kiểm tra** để chạy tiếp, hoặc app tự thử lại sau 6 giờ.
- **Dữ liệu** (profile Chrome có phiên đăng nhập Muse, hàng đợi, video tải về) nằm **ngoài thư mục app**, ngay bên cạnh, cùng ổ đĩa — vd.
  `D:\bokin-rockroll-muse-gateway` (đổi bằng biến `MUSE_ENGINE_DIR`). Lúc build, Next.js đọc file trong thư mục app và sẽ vấp vào profile Chrome đang mở.
  Không bao giờ được commit.
- **Xem thử không tốn lượt**: chạy app với biến `MUSE_FAKE=1` → “Muse giả” (video sọc màu 10 giây, không mở Chrome).
- Lưu ý: app điều khiển trang web Muse giống người dùng; Meta đổi trang thì có thể phải sửa (`src/lib/museEngine/page.ts`). Tự động hoá có thể trái điều
  khoản của Meta — app chỉ dùng **một tài khoản**, không proxy, không xoay vòng tài khoản.
- **Đổi tài khoản khi tài khoản bị lỗi / bị khoá** (Cài đặt → *Tài khoản Muse*): mỗi tài khoản một thư mục hồ sơ Chrome **cố
  định** (tài khoản đầu: `chrome-profile`, thêm sau: `chrome-profile--<mã>`; thư mục cất tay như `chrome-profile-cu` cũng được
  nhận). **Thêm tài khoản mới** → thư mục mới trống, mở Chrome để đăng nhập (trang đăng nhập của Meta — thường là Instagram /
  Facebook; đăng nhập xong mà trang dừng ở Instagram / Facebook thì app tự mở lại Muse); **Dùng tài khoản này** → đổi về tài khoản
  đã lưu; **🗑 Xoá** → bỏ khỏi danh sách, hồ sơ vào **Thùng rác** (không xoá được tài khoản đang dùng). Mỗi lần đổi: dừng nhận việc,
  (bạn đồng ý thì) đưa các cảnh đang làm về hàng chờ để gửi lại bằng tài khoản mới — tài khoản mới không đọc được phiên chat của
  tài khoản cũ — đóng Chrome, mở lại Chrome bằng thư mục của tài khoản kia (**không đổi tên thư mục nào** — Windows hay chặn đổi tên
  khi Chrome / File Explorer còn giữ file). Không xoá hồ sơ nào; chỉ một tài khoản mỗi lúc,
  đổi bằng tay (app không tự xoay vòng khi hết hạn mức). Danh sách: `accounts.json` trong thư mục dữ liệu Muse. Mã:
  `src/lib/museEngine/accounts.ts`.
- **Tự đổi khi tài khoản lỗi** (cùng thẻ, tắt sẵn): bật lên và tick *Dự phòng* ở các tài khoản đã đăng nhập sẵn. Mỗi 2 phút app
  kiểm tra (`failoverTick`): tài khoản đang dùng **bị đăng xuất quá 10 phút** mà kiểm tra lại vẫn chưa đăng nhập, hoặc **3 cảnh
  kết thúc gần nhất đều bị Muse từ chối nhận lệnh** (không phải vì hết lượt) → đổi sang tài khoản dự phòng đầu tiên chưa bị đánh
  dấu lỗi; cảnh đang làm và các cảnh bị từ chối được gửi lại bằng tài khoản mới. Chỉ **hết lượt tuần** thì **không** đổi (chờ như
  thường). Tài khoản bị đổi khỏi được đánh dấu ⚠ (không tự dùng lại cho tới khi bạn tự chọn lại); hai lần tự đổi cách nhau ≥ 30
  phút; hết dự phòng thì ghi "hết tài khoản dự phòng" và dừng chờ. Chrome của Muse bị tắt bất thường → sau 5 phút tự mở lại (cùng
  tài khoản). Mọi lần tự đổi ghi vào nhật ký (thẻ Tài khoản Muse) và báo đỏ trên trang theo dõi trong 24 giờ.

### Chuẩn bị (một lần)

1. Cài **Google Chrome** (nếu chưa có). Mở app bằng **`Chay-MV-Prompt-Studio`**.
2. Vào **Cài đặt → Tạo clip bằng Muse**: chọn **Tự động (Muse trong app)** (mặc định).
3. Bấm **Đăng nhập Muse** → cửa sổ Chrome của Muse hiện ra → **bạn tự đăng nhập** Muse (tài khoản Meta). Đăng nhập xong cửa sổ tự cất đi; thẻ báo
   “Đã đăng nhập Muse”. App không bao giờ thấy hay lưu mật khẩu; phiên đăng nhập nằm trong profile Chrome của Muse.
4. Ở thẻ **Công cụ video & storyboard** chọn **Meta Muse** để Claude viết prompt đúng kiểu Muse (clip 10 giây, một đoạn văn liền, không mô tả âm thanh vì MV
   dùng nhạc của bài). Giới hạn ký tự trong hồ sơ này là ước tính — chỉnh ở trang **Thư viện** nếu cần.
5. Tuỳ chọn: **Thư mục nhạc** (để tự ghép bài hát — mục 2d), **Đủ clip + có bài hát → tự thêm vào hàng chờ dựng và chạy** (bật sẵn), **Ghép negative prompt
   vào cuối prompt (“Avoid: …”)** (bật sẵn — Muse không có ô negative prompt riêng).

### Tạo clip

1. Một MV: trang **🎬 Ghép video với nhạc** → thẻ **Tạo clip bằng Muse** → **🎬 Gửi N cảnh chưa có clip sang Muse**.
   Nhiều MV: menu **Clip Muse** → chọn MV → **🎬 Gửi sang Muse**. (Chạy hết cả quy trình thì dùng menu **Tự động** — mục 2d.)
   App hỏi lại trước khi gửi vì **mỗi cảnh là một lượt Muse** (tính vào hạn mức tuần).
2. Xong. Mỗi cảnh hiện một ô theo tiến độ: **Đang chờ tới lượt** → **Muse đang làm** → **✓ Đã vào MV**. Ô đỏ = lỗi, rê chuột để xem lý do.
3. MV đủ clip cho mọi cảnh và đã có bài hát → app tự thêm vào **Hàng chờ dựng** và dựng (nếu bật).

Chi tiết:

- **Bấm gửi hai lần** không gửi lại cảnh đang làm. Hai cảnh trùng hệt prompt chỉ gửi một lần (dùng chung clip).
- **Không tốn lượt thừa**: cảnh chưa có clip mà **đã có sẵn video cùng prompt** (vd. bạn xoá nhầm clip) → app nhận luôn video đó, không gửi lại.
- **Clip bạn tự thêm** vào một cảnh sau khi gửi thì được giữ nguyên, app không đè bằng clip Muse.
- **Muse làm xong mà đưa clip vào MV bị lỗi**: bấm **↻ Nhận lại N clip (không tốn lượt)** — app chỉ lấy lại file. Lỗi “file đang bận” thoáng qua trên Windows
  thì app tự thử lại.
- **Cảnh báo lỗi mà có thể Muse đã làm xong** (vd. Muse trả lời “Muốn mình làm thêm bản biến tấu khác…”): bấm **↻ Kiểm tra lại N cảnh (không tốn lượt)** —
  app đọc lại đúng cuộc chat cũ và tải video nếu có. App cũng tự tìm video Muse ghi trong câu trả lời khi không có “thẻ video” riêng (gặp khi thử thật).
  Chỉ khi kiểm tra lại vẫn lỗi mới cần **↻ Gửi lại** (tốn thêm lượt).
- **Bỏ qua cảnh lỗi mà vẫn dựng MV** (vd. Muse từ chối một cảnh): khi Muse đã làm xong các cảnh khác, bấm **⤼ Bỏ qua N cảnh lỗi & dựng** — cảnh đó
  không có clip riêng, khi dựng đoạn của nó mượn / lặp cảnh khác; MV đủ clip còn lại + có bài hát thì tự vào hàng chờ dựng. Muốn có clip riêng sau này:
  **↻ Gửi lại N cảnh đã bỏ qua**. Tự động khi bạn vắng mặt (Cài đặt → **Tự bỏ qua cảnh lỗi**, mặc định 20% số cảnh, luôn được ít nhất 1 cảnh):
  app tự Kiểm tra lại cảnh lỗi một lần (không tốn lượt), vẫn lỗi thì bỏ qua và dựng; lỗi nhiều cảnh hơn mức đó thì chờ bạn. 0 = tắt.
- Video gốc vẫn nằm trong thư mục `videos/` của Muse (hoặc thư mục lưu của HaoHao); app chép một bản vào `data/media/<mã MV>/`.

### Cách dán tay vào HaoHao (dự phòng)

Chọn **HaoHao (dán tay)** trong Cài đặt. Đăng nhập Muse trong HaoHao, và nên đổi **Thư mục lưu** của HaoHao sang ổ còn nhiều chỗ (mặc định là
`Videos\MuseStudioPro` trên ổ C). Thư mục dữ liệu HaoHao để trống là app tự tìm (Windows: `%APPDATA%\HaoHao`, macOS: `~/Library/Application Support/HaoHao`).
Bấm **🎬 Tạo N cảnh chưa có clip** → app copy sẵn các prompt (cách nhau một dòng trống) → mở **HaoHao → tab Studio** → chọn **Video**, tỉ lệ **16:9** → **dán** → tạo.
Cảnh lỗi: bấm **Thử lại** ngay trong HaoHao (app tự theo) hoặc **↻ Gửi lại** trong app rồi dán lại. Lỡ mất chữ đã copy: **📋 Copy lại N prompt chờ dán**.
App không sửa gì bên HaoHao. Đổi cách gửi giữa chừng: cảnh gửi bằng cách cũ được giữ nguyên kèm lời nhắc.

## 2d. Tự động: ý tưởng → MP4 (một nút)

Menu **Tự động**: mỗi việc là một MV chạy qua 4 bước, không cần bấm gì thêm:

1. **Kịch bản** — Claude viết từ một dòng ý tưởng (cần **Claude API key**: Cài đặt → *API key của Claude*; chế độ **Demo** cũng chạy được để thử).
   Ở chế độ claude.ai (copy – dán) thì viết kịch bản như mục 2 rồi chọn **Từ MV có sẵn**. Viết lần lượt từng MV.
2. **Bài hát** — MV chưa có bài → app tìm file trùng **tên bài** trong **Thư mục nhạc** (Cài đặt), vd. `D:\Downloads\Nhạc kênh khúc nhạc thời gian`.
   So tên không phân biệt dấu / hoa thường, bỏ phần phiên bản sau dấu “ - ” (Rock Version, Nam Metal Rock…), chữ “rock” và số dính ở cuối:
   tên bài “Đèn Khuya” khớp “Đèn Khuya - Rock Version.wav”. Có hai bản cùng tên (vd. “- Nam Rock” và “- Rock Version”) thì ghi rõ phiên bản trong tên bài
   (“Đèn Khuya - Rock Version”); không ghi thì app chọn bản đầu theo tên và ghi chú lại. Ý tưởng không ghi thời lượng → kịch bản lấy đúng độ dài bài.
   Không thấy bài → việc chờ; thả file vào thư mục nhạc (hoặc tải lên ở trang Ghép video) là app tự chạy tiếp.
3. **Clip Muse** — gửi các cảnh chưa có clip sang Muse trong app (mục 2c), clip xong tự vào đúng cảnh.
4. **Dựng MP4** — đủ clip + có bài hát → thêm vào **Hàng chờ dựng** (thiết lập dựng chung), dựng xong có nút **⬇ Tải MP4**.

Cách dùng: menu **Tự động** → tab **Từ ý tưởng** (dán bảng như trang Nhập ý tưởng → **Đọc bảng** → **＋ Đưa N ý tưởng vào kho**, hoặc **▶ Chạy ngay cả N
ý tưởng** để đưa cả bảng vào dây chuyền một lúc) hoặc tab **Từ MV có sẵn**
(chọn MV → **▶ Chạy tự động N MV**). App hỏi lại kèm chi phí ước tính (lượt Muse, tiền Claude API). Mỗi việc hiện 4 ô Kịch bản / Bài hát / Clip Muse / Dựng MP4;
bước lỗi có **↻ Thử lại bước lỗi**; cảnh Muse lỗi thì vào **Clip Muse** để Kiểm tra lại / Gửi lại / Bỏ qua cảnh lỗi & dựng (ít cảnh lỗi thì app tự bỏ qua, xem trên). Tiến độ lưu ở `data/pipeline.json`, tắt app mở lại chạy tiếp.

### MV hoàn thiện: ảnh bìa, tiêu đề, thư mục kết quả

- **Cảnh đời sống thập niên 50** (Cài đặt → *Cảnh đời sống thập niên 50 (% số cảnh)*, mặc định 30%): cảnh mở đầu và các cảnh rải
  đều trong bài (không liền nhau, không phải cảnh cuối / signature / cảnh nhảy) là đời sống thường ngày của nơi và năm đó — quầy
  soda, jukebox, phố chính với xe cổ, gia đình bên TV đen trắng, rạp chiếu ngoài trời… — **không có cặp đôi**, để MV như thước phim
  kỷ niệm của một thời. Bảng cảnh đánh dấu 📻; cảnh này mà có cặp đôi thì app cảnh báo. 0 = tắt.
- **Ảnh bìa** (tạo ngay sau khi dựng, không tốn lượt Muse): khung hình đẹp từ chính clip của MV (ưu tiên cảnh có cả cặp đôi ở điệp
  khúc / signature), cắt 1280×720, màu ấm hơn, nền tối dần ở dưới, **tên bài** to (tên bài, hoặc câu hook điệp khúc trong thư
  viện lời, hoặc phần đầu tiêu đề YouTube) + dòng “địa điểm · năm”, logo kênh ở góc nếu có. Font như intro (font tải lên, hoặc
  font hệ thống có dấu tiếng Việt). Kèm file **tiêu đề + mô tả** (tiêu đề YouTube số 1, 2 tiêu đề dự phòng, mô tả + hashtag). Mã:
  `src/lib/cover.ts`.
- **Thư mục kết quả** (Cài đặt → *Thư mục kết quả*, mặc định `KET QUA` cạnh thư mục app): mỗi MV xong một thư mục
  `008 - Santa Monica Moonlight 1959` gồm video (tên file = tiêu đề YouTube), `Ảnh bìa.jpg`, `Tiêu đề - mô tả.txt`. Cùng ổ đĩa
  thì video là liên kết cứng (không tốn thêm chỗ), khác ổ thì chép; dựng lại MV thì thêm thư mục ` (2)`. Đặt thư mục kết quả trong
  ổ **Google Drive cho máy tính** (vd. `G:\My Drive\MV hoàn thiện`) thì kết quả tự lên Drive — app không cần đăng nhập Google.
  Mã: `src/lib/results.ts`. Thẻ Dây chuyền và trang theo dõi hiện ảnh bìa, tiêu đề và nút tải.

### Kho nhạc đánh số theo ý tưởng

Kênh làm nhạc theo số ý tưởng: ý tưởng số 12 có thư mục bài “12” (tài liệu = địa điểm + chủ đề + dàn ý + lời) và file nhạc `12.wav`, `12 (1).wav`
(hoặc `12.mp3`, `12_1.mp3`) — mỗi lần tạo nhạc ra 2 bản. Bản đã làm MV thì đổi tên thêm chữ **“đã dùng”** (vd. `12 đã dùng.wav`).

- **Thư mục nhạc** (Cài đặt) trỏ tới thư mục chứa các file này (vd. bản tải về của thư mục *KHO NHẠC* trên Drive). Ý tưởng không ghi tên bài → app lấy file
  theo số ý tưởng, **bản chưa có chữ “đã dùng” trước** (theo thứ tự bản, WAV trước MP3). Mọi bản đều “đã dùng” → kho ý tưởng **bỏ qua** ý tưởng đó (ghi lý
  do trong thẻ Kho ý tưởng), việc đang chạy thì chờ.
- **Chỉ lấy ý tưởng đã có nhạc** (thẻ Kho ý tưởng, bật sẵn khi đã đặt Thư mục nhạc): ý tưởng chưa có file nhạc cùng số (hoặc trùng tên bài) nằm chờ
  trong kho, không tốn lượt Muse; thả file nhạc vào thư mục là dây chuyền tự lấy. Thẻ hiện số ý tưởng “đã có nhạc / chờ nhạc”.
- **Thư viện lời bài hát** `data/song_library.json` (không commit): mỗi số bài một mục — địa điểm, chủ đề, dàn ý, lời. Ý tưởng cùng số **và cùng địa điểm**
  mà chưa có lời thì lúc viết kịch bản app lấy lời ở đây, nên các cảnh bám đúng Intro / Verse / Chorus / Bridge của bài. Nhãn kiểu Suno có mô tả
  (`[Intro - bright, hand claps in]`, `[Sax Solo]`, `[Hand Clap Break - …]`) được hiểu là nhãn đoạn, không lẫn vào lời.
- **Thư viện chủ đề** (`data/themes.json`) theo đúng bảng mã của kênh: T01–T18 tình yêu · T19–T22 thử thách · T23–T24 hôn nhân · T25–T27 hoài niệm ·
  T28–T30 cuộc sống & tự do (mỗi mã có tên, nhóm, không khí, nhịp, cảnh đặc trưng).

### Kho ý tưởng: chạy liên tục, hết ý tưởng thì Claude đề xuất thêm

Thẻ **Kho ý tưởng** (trang Tự động) giữ mọi ý tưởng của bạn và đánh dấu **chưa dùng / đã dùng** (lưu ở `data/ideas.json`):

- **Dây chuyền tự lấy ý tưởng trong kho, mỗi lúc N MV** (mặc định 2): chỉ lấy ý tưởng mới khi số MV đang viết kịch bản hoặc chờ clip Muse ít hơn N — nên
  dây chuyền tự đi theo tốc độ của Muse (kể cả khi Muse báo hết hạn mức tuần), không viết dồn 200 kịch bản một lúc. MV đang lỗi vẫn giữ chỗ, để khi API key
  hay Muse hỏng thì app không lấy dồn cả kho. MV chỉ còn chờ bài hát thì không giữ chỗ.
- **Kho sắp hết thì nhờ Claude đề xuất M ý tưởng mới** (mặc định 10): khi số ý tưởng chưa dùng còn ≤ N, Claude đọc các ý tưởng đã có (của bạn, trong dây
  chuyền và các MV đã viết, cả ý tưởng đã bỏ) rồi viết ý tưởng mới **cùng kiểu**: địa điểm + thời điểm + năm 1950–1959 (tiếng Anh), mã chủ đề có trong
  thư viện hoặc trong bảng của bạn (ưu tiên chủ đề ít dùng), dàn ý tiếng Việt. App bỏ ý tưởng trùng địa điểm hoặc sai định dạng, đánh số tiếp (201, 202…),
  mỗi 50 ý tưởng là một series (“201–250 · …”). Mỗi lần đề xuất tốn vài cent tiền Claude API.
- **Ý tưởng mới nghiêng dần sang 🍂 mùa thu rồi ❄️ mùa đông** (bật sẵn): ý tưởng của kênh phần lớn là mùa hè, nên mỗi lần đề xuất app dặn Claude đúng số
  ý tưởng thu / đông — lần đầu 4/10 (3 thu, 1 đông), tăng dần theo số ý tưởng Claude đã đề xuất (ý tưởng đã bỏ không tính), sau khoảng 60 ý tưởng thì
  9/10 (2 thu, 7 đông) và giữ mức đó. Vùng nắng ấm (California, Florida, Las Vegas) thì thể hiện mùa qua lễ hội, ánh đèn, trang phục thay vì tuyết.
  Thẻ ghi sẵn số thu / đông của lần đề xuất tới; ý tưởng thu / đông có dấu 🍂 / ❄️. Bỏ tick = mùa nào cũng được như trước.
- **Chờ tôi duyệt** (mặc định): ý tưởng Claude đề xuất nằm trong khung vàng, bấm **✓ Dùng / ✗ Bỏ** từng cái hoặc **Duyệt tất cả**; chưa duyệt thì dây chuyền
  không dùng và Claude không đề xuất thêm. **Dùng luôn, không cần duyệt**: chạy liên tục không cần bạn (vẫn theo tốc độ của Muse).
- **✨ Nhờ Claude đề xuất ngay**: đề xuất bất cứ lúc nào. Lần đề xuất tự động bị lỗi (vd. chưa có API key) thì 30 phút sau app mới tự thử lại.
- Cần **Claude API key** (Cài đặt → *API key của Claude*); chế độ **Demo** cho ý tưởng mẫu để thử, không tốn phí.

## 2e. Chạy trên máy khác (máy chạy riêng, điều khiển từ xa)

App có thể chạy suốt trên một máy Windows khác; bạn điều khiển bằng phần mềm xem màn hình (UltraViewer, Chrome Remote Desktop).
App vẫn chỉ mở trong chính máy đó (127.0.0.1). Hướng dẫn từng bước cho người không rành máy: **`HUONG-DAN-MAY-MOI.txt`**.

- **Đóng gói**: bấm đúp `Dong-goi-cai-moi.bat` → `MV-Prompt-Studio-cai-moi.zip` (thư mục `MV-Prompt-Studio-goi` cạnh thư mục app):
  mã nguồn + dữ liệu của bạn (cài đặt, chủ đề, địa điểm, cặp đôi, thư viện lời, kho ý tưởng). **Không** có API key (`.env*`),
  phiên đăng nhập Muse, nhạc, video hay lịch sử MV. `Dong-goi-cap-nhat.bat` → bản chỉ có mã nguồn, giải nén đè để cập nhật app
  ở máy kia mà giữ nguyên dữ liệu ở đó. Thêm `--ra <thư mục>` để đổi nơi để file zip.
- **Kho nhạc trên Google Drive** (trang Tự động): dán link thư mục kho nhạc (chia sẻ “Bất kỳ ai có đường liên kết”) → **Đồng bộ
  ngay**. App đọc lời từ các thư mục bài đánh số vào `data/song_library.json`, tải các bản nhạc **chưa dùng** còn thiếu về
  Thư mục nhạc, bản nào trên Drive đổi tên (vd. vừa ghi “đã dùng”) thì đổi tên bản ở máy cho khớp; không xoá file nào.
  **Tự đồng bộ mỗi 6 giờ** (bật sẵn) — chỉ tải bản mới. Mã: `src/lib/driveSync.ts`.
- **Tự chạy tiếp khi mở lại**: lúc server khởi động (`src/instrumentation.ts` → `src/lib/autostart.ts`), app tự chạy tiếp
  dây chuyền, Muse và tự đồng bộ khi đến hạn — không cần ai mở trình duyệt. `Bat-tu-chay-khi-mo-may.bat` tạo lối tắt trong
  thư mục Startup để app tự mở mỗi lần đăng nhập Windows (`Tat-tu-chay-khi-mo-may.bat` để thôi). `NO_AUTOSTART=1` để tắt.
- **Một tài khoản Muse chỉ chạy ở một máy**: chuyển sang máy chạy rồi thì tắt app ở máy cũ.
- **Máy chỉ có ổ C**: Thư mục nhạc ghi không kèm ổ đĩa (gói cài ghi `KHO NHAC`) = thư mục cạnh thư mục app, vd. app ở
  `C:\MV-Prompt-Studio` → nhạc ở `C:\KHO NHAC`.
- **Theo dõi từ máy chính** (Cài đặt → *Theo dõi từ máy khác (Tailscale)*): trang **chỉ xem** — dây chuyền, MV đã xong (tải MP4),
  Muse, kho ý tưởng, dung lượng ổ, lỗi cần chú ý; tự cập nhật 5 giây/lần. Đây là một cổng riêng (mặc định 3300) **chỉ mở trên
  địa chỉ Tailscale** của máy chạy (100.64.0.0/10) nên máy cùng wifi / người ngoài không vào được, và cần mật khẩu (HTTP Basic;
  lưu dạng băm scrypt trong `.env.local` = `MONITOR_PASSWORD_HASH`, không commit). App chính vẫn chỉ ở 127.0.0.1. Chưa đặt
  mật khẩu thì không mở. Mã: `src/lib/monitor.ts`, `src/lib/monitorPage.ts`.

## 3. Logic sinh MV

1. **Character Bible** — Claude tạo cặp đôi HE/SHE (hoặc dùng **cặp đôi cố định cho cả series** nếu bật trong Cài đặt).
   Claude viết prompt với placeholder `{{HE}}`, `{{SHE}}`; công cụ thay bằng mô tả nguyên văn, nên nhân vật luôn đồng nhất.
2. **Cấu trúc bài hát → danh sách cảnh** (thuần code, `src/lib/structure.ts`): số cảnh = `ceil(thời lượng / độ dài clip)`, rồi giới hạn trong khoảng
   **tối thiểu – tối đa** của Cài đặt (mặc định **15–20 cảnh = 15–20 prompt mỗi MV**). Khi bật **“Cảnh sẽ được lặp lại khi dựng”**, Claude viết mỗi cảnh
   thành một clip độc lập, dùng lại được, và ghi chú dựng có mục **“Lặp cảnh”** gợi ý dùng lại cảnh nào ở đoạn nào. Các đoạn chia theo tỉ lệ
   Intro 8% · Verse 1 17% · Pre-chorus 8% · Chorus 1 15% · Verse 2 15% · Chorus 2 12% · Bridge 10% · Final chorus 10% · Outro 5%.
   Nhịp `fast` → chorus dùng clip ngắn hơn (nhiều cảnh hơn). Mỗi chorus được gán ít nhất một cảnh nhảy/chuyển động mạnh,
   `signature_shots` của chủ đề được gán ≥ 2 lần, cỡ cảnh luân phiên, lời bài hát (nếu có) được khớp vào từng cảnh.
3. **Prompt từng cảnh** — một lời gọi Claude với *structured output* (JSON schema), theo công thức
   `[Cỡ cảnh] + [Chủ thể] + [Hành động] + [Bối cảnh đúng niên đại] + [Ánh sáng] + [Máy quay] + [Cảm xúc] + [STYLE]`.
   Nếu JSON lỗi / thiếu cảnh, công cụ tự **retry một lần**. Prompt dài quá giới hạn của công cụ video được Claude **rút gọn**, sau đó cắt tự động nếu vẫn dài.
4. **Tài nguyên bổ sung** — thumbnail 16:9, 3 tiêu đề, mô tả YouTube, ghi chú dựng phim, mạch truyện.

Sau khi sinh: **era check** (`src/lib/eraCheck.ts`) theo `data/era_rules.json` và quy tắc riêng của địa điểm, kiểm tra độ dài, style, tiếng Việt lẫn trong prompt,
chữ trên màn hình, thương hiệu/người thật, và so sánh với các MV khác **cùng series** để cảnh báo cảnh trùng lặp.

## 4. Thư viện cấu hình (`data/`)

Sửa trên giao diện (trang **Thư viện**) hoặc sửa trực tiếp file JSON:

| File | Nội dung |
|---|---|
| `themes.json` | 12 mã chủ đề T01–T12 (mood, nhịp dựng, signature shots). Các mã có `needs_review: true` là **tên gợi ý** — hãy sửa cho đúng. |
| `locations.json` | 24 địa điểm California – Las Vegas – Route 66 – New York (landmark, xe, trang phục, đạo cụ, ánh sáng, thứ **không được xuất hiện**). Địa điểm chưa có sẽ được Claude tự suy luận và lưu với `auto_generated: true` để bạn duyệt. |
| `era_rules.json` | Quy tắc theo từng năm 1950–1959, vật dụng theo năm ra đời (hula hoop 1958, Thunderbird 1955…), đồ hiện đại bị cấm, thương hiệu/người thật. |
| `style_presets.json` | Kodachrome 35mm (mặc định), Technicolor musical, Black & white noir, Faded home-movie 8mm. |
| `pricing.json` | Giá Claude API (USD / 1 triệu token) theo model và tỷ giá đ/USD — dùng để quy đổi chi phí. |
| `video_models.json` | Veo, Kling, Hailuo, Sora, Runway, Meta Muse: giới hạn ký tự, độ dài clip, có âm thanh hay không, cách viết prompt. |
| `settings.json` | Cài đặt (model, công cụ video, độ dài clip, số cảnh tối thiểu–tối đa, lặp cảnh, cặp đôi cố định, số luồng song song…). |
| `couples.json` | Cặp đôi cố định đã lưu cho từng series. |

Dữ liệu sinh ra khi chạy (không commit): `data/history/` (lịch sử MV, mỗi MV một file JSON), `data/drafts/` (MV đang chờ câu trả lời từ claude.ai), `data/uploads/` (ảnh tham chiếu nhân vật)
và `data/media/` (nhạc, clip và video đã dựng của từng MV — xoá MV trong Lịch sử thì thư mục này của MV cũng bị xoá;
`data/media/_shared/` là thiết lập dựng chung, logo và font), `data/render_queue.json` (hàng chờ dựng), `data/muse.json` (các cảnh đang tạo clip bằng Muse).

## 5. Cài đặt đáng chú ý

- **Model**: mặc định `claude-sonnet-5-5`; đổi được trong trang Cài đặt. **Effort** `medium` là cân bằng tốt giữa chất lượng và tốc độ.
- **Fallback khi bị từ chối**: bật sẵn (server-side fallback của Claude API).
- **Số MV chạy song song**: mặc định 2 — giảm xuống nếu gặp lỗi *rate limit*.
- **Cặp đôi cố định cho cả series**: bật lên thì 50 MV cùng series dùng chung một cặp đôi.
- **Cách tạo nội dung**: Tự động / claude.ai (copy – dán) / Claude API / Demo.
- **Số cảnh mỗi MV**: mặc định 15–20 (= 15–20 prompt); bật “Cảnh sẽ được lặp lại khi dựng” để mỗi cảnh độc lập, dùng lại được.

## 6. Tính năng khác

- **Sinh lại toàn MV với giọng khác** (vui tươi hơn, buồn hơn, điện ảnh hơn) — tạo phiên bản mới, bản cũ vẫn giữ trong Lịch sử.
- **Sửa Character Bible** trên trang kết quả → tự ghép lại toàn bộ prompt (trừ cảnh đã sửa tay); có thể lưu làm cặp đôi cố định của series.
- **Đổi style preset** cho cả MV.
- **Ảnh tham chiếu nhân vật** (cho image-to-video): upload trên trang kết quả, đường dẫn được ghi vào Character Bible và file xuất.
- **Lịch sử**: tìm theo tên bài, địa điểm, series, chủ đề; chọn nhiều MV để xuất; **XLSX cả series**; nhập lại file JSON.

## 7. Dành cho người phát triển

```bash
npm test          # unit test (cấu trúc bài hát, parser, era check, ghép prompt, pipeline, chế độ claude.ai, chi phí, gọi Claude giả lập,
                  #   nhận nhịp, kế hoạch cắt cảnh, cân bằng âm lượng / preset YouTube / logo / intro, hàng chờ dựng,
                  #   dựng MP4 thật bằng ffmpeg từ clip + nhạc tự tạo, tạo clip bằng Muse với một "HaoHao giả" — không tốn lượt Muse)
npm run typecheck
```

Cấu trúc mã nguồn:

```
data/                   thư viện cấu hình (JSON)
src/lib/
  structure.ts          chia cấu trúc bài hát → danh sách cảnh (thuần code)
  parser.ts             đọc bảng dán / CSV / ma trận XLSX
  llm.ts                gọi Claude (structured output, retry)
  prompts.ts            system prompt + user prompt
  llmSchemas.ts         JSON schema của kết quả
  generate.ts           pipeline sinh MV, sinh lại cảnh, sửa tay, bản nháp claude.ai
  manual.ts             chế độ claude.ai: yêu cầu để copy, đọc JSON dán về
  cost.ts               quy đổi token → $ / đ, ước tính chi phí
  apikey.ts             lưu API key vào .env.local
  assemble.ts           ghép prompt: Character Bible nguyên văn + style
  eraCheck.ts           kiểm tra niên đại, thương hiệu, chữ trên màn hình
  validate.ts           kiểm tra độ dài, nhịp dựng, signature shots…
  duplicates.ts         cảnh báo trùng lặp trong series
  exporters.ts, xlsx.ts xuất CSV / MD / TXT / JSON / XLSX
  mock.ts               chế độ demo
  store.ts              đọc/ghi data/
  edit.ts               kế hoạch dựng: rải cảnh lên bài hát, lặp cảnh, cắt theo phách (thuần code, dùng cả trên trình duyệt)
  beats.ts              ước tính BPM và vị trí phách từ âm thanh
  clipNames.ts          đoán clip thuộc cảnh nào theo tên file
  media.ts              lưu nhạc / clip của từng MV (data/media/)
  ffmpeg.ts, render.ts  gọi ffmpeg, dựng MP4 chạy nền (tiến độ, huỷ, kiểm tra đầu ra)
  queue.ts              hàng chờ dựng: dựng lần lượt nhiều MV với thiết lập chung (data/media/_shared)
  muse.ts               tạo clip bằng Muse — phần thuần: chữ gửi Muse, khớp task với cảnh, trạng thái từng cảnh
  museEngine/           Muse trong app: chrome.ts (Chrome qua CDP pipe), page.ts (script trong trang muse.ai), runner.ts (gửi / dò / tải, Worker,
                        nhận ra hết hạn mức), tasks.ts (hàng đợi), fake.ts (Muse giả — MUSE_FAKE=1), index.ts (một bản cho cả app)
  songs.ts              tự ghép bài hát: so tên bài với tên file trong thư mục nhạc
  pipeline.ts           dây chuyền tự động: kịch bản → bài hát → clip Muse → MP4 (data/pipeline.json); pipelineSteps.ts = kiểu + nhãn
  haohao.ts             đọc (chỉ đọc) hàng đợi tasks.json và thư mục lưu của tool HaoHao (cách dán tay)
  museJobs.ts           theo dõi các cảnh (data/muse.json), dò chạy nền, đưa clip vào đúng cảnh, tự thêm vào hàng chờ dựng
  loudness.ts           cân bằng âm lượng (chuyển từ loop_music/loudness.py của Bokin Studio Music)
  quality.ts            preset YouTube (chuyển từ loop_music/quality.py)
  branding.ts, fonts.ts logo kênh, intro tiêu đề, thông tin MP4 (chuyển từ loop_music/branding.py, mp4meta.py)
src/app/                các trang: Nhập ý tưởng, Chạy batch, claude.ai (/manual), Kết quả (/mv/[id]), Ghép video (/mv/[id]/video), Clip Muse (/muse),
                        Hàng chờ dựng (/render-queue), Lịch sử, Thư viện, Cài đặt; API trong src/app/api/
scripts/start.mjs       khởi động một lệnh (dùng bởi Chay-MV-Prompt-Studio.bat / .command)
tests/                  vitest (fakeMuse.ts = "Muse giả" điều khiển được, cho test)
```
