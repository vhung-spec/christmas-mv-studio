# Christmas MV Studio 🎄

App làm **video nhạc Giáng sinh cổ điển nước Mỹ thập niên 1950, dài khoảng 1 tiếng**, để ghép nhạc Giáng sinh của kênh.
Tách ra từ **MV Prompt Studio** (app MV tình yêu rock'n'roll 1950s) — giữ nguyên toàn bộ phần máy, đổi nội dung sang Giáng sinh.
Bạn chỉ nhập **ý tưởng** của từng video (1 dòng), công cụ tự sinh:

- **Character Bible** theo ý tưởng: cặp đôi, gia đình, trẻ em, ông bà… hoặc **chỉ cảnh, không nhân vật chính** — mô tả nhân vật được chèn **nguyên văn** vào mọi prompt để nhất quán giữa các clip.
- **Storyboard một vòng 20–30 cảnh** (mỗi cảnh = 1 clip Muse ~10 giây), mô tả tiếng Việt và **prompt tiếng Anh** đã gắn style preset (phim Kodachrome Giáng sinh 1950s…) ở cuối; xen **cảnh đời sống Giáng sinh 50s** (nhóm hát mừng, chợ cây thông, ông già Noel ở cửa hàng, trẻ con trượt tuyết, tàu hơi nước trong tuyết…).
- **Thumbnail prompt**, 3 gợi ý **tiêu đề YouTube** (kèm độ dài, vd. “1 Hour”), **mô tả** theo giọng văn kênh và **ghi chú dựng phim**.
- **Kiểm tra niên đại** (xe đời sau, điện thoại, đèn LED / đồ bơm hơi, cây thông nhôm trước 1958, ngôi sao pha lê ở Rockefeller Center, tuyết ở Hollywood / Miami…), độ dài prompt, chữ trên màn hình, thương hiệu / nhân vật bản quyền (Rudolph, Frosty…), và **trùng lặp trong series**.

Trang **Kênh** (quản lý kênh, kế hoạch sản xuất, giao việc, kho ý tưởng) và trang **Dây chuyền** (sản xuất) chạy trọn **ý tưởng → kịch bản → nhạc →
clip Muse → MP4** (mục 2d) và **tự sản xuất**: mỗi kênh luôn có sẵn N video chưa đăng, kho hết ý tưởng thì Claude tự nghĩ (Giáng sinh ở một vùng đất,
chỉ cảnh, không nhân vật chính) và dùng luôn. Mỗi kênh đăng theo vòng: **N MV một bài** (mặc định 3; các cảnh Giáng sinh, bài Giáng sinh truyền thống
hay nhất kênh chưa dùng chọn lúc ghép nhạc, tiêu đề là tên bài) **rồi 1 playlist ~1 tiếng mở đầu bằng các bài vừa có MV**. Playlist: app **tự xếp danh sách nhạc như Bokin Playlist Studio** (bài cũ hay + bài mới,
theo mức hay trong `Kho bài hát.xlsx` và lịch sử của kênh) từ kho nhạc Giáng sinh (đồng bộ từ Google Drive như KHO NHẠC), nối thành khoảng 60 phút,
**lặp 20–30 clip** cho hết nhạc, rồi làm ảnh bìa, tiêu đề, mô tả **kèm danh sách bài + mốc thời gian** (YouTube tự tạo chương) và thư mục kết quả.
Làm cho nhiều **kênh** thì app **tự phân luồng**: mỗi video mới vào kênh đang có ít video nhất; các kênh dùng chung kho nhạc, mỗi kênh có lịch sử
nhạc và kho ý tưởng riêng.

### Khác gì MV Prompt Studio (app cũ)

| | MV Prompt Studio (cũ) | Christmas MV Studio (mới) |
|---|---|---|
| Nội dung | MV tình yêu rock'n'roll 1950s, luôn có cặp đôi | Giáng sinh 1950s; nhân vật theo ý tưởng (cặp đôi / gia đình / trẻ em / ông bà / chỉ cảnh) |
| Độ dài video | 1 bài ≈ 3 phút | mỗi vòng **N MV một bài** (~3–4 phút) rồi **1 playlist ~1 tiếng** (Cài đặt → *Độ dài video*, mặc định 60 phút); N riêng từng kênh |
| Nhạc | 1 bài theo số ý tưởng (ý tưởng 12 → `12.wav`) | MV: bài hay nhất kênh chưa dùng; playlist: **tự xếp ~1 tiếng như Bokin Playlist Studio** — bài cũ hay + bài mới theo `Kho bài hát.xlsx` (mức hay 1–3) và lịch sử của kênh, mở đầu bằng các bài vừa có MV; không cần ghi “đã dùng” |
| Kênh | một kênh | **nhiều kênh, tự phân luồng** (video mới vào kênh ít video nhất); chung kho nhạc, lịch sử nhạc + kho ý tưởng riêng; kết quả để theo thư mục kênh |
| Số cảnh | 15–20 | 20–30 (một vòng, khi dựng lặp lại — các vòng sau xáo thứ tự) |
| Chủ đề | T01–T30 tình yêu | T01–T22 Giáng sinh (Đêm Giáng sinh lãng mạn, Trang trí cây thông, Tuyết đầu mùa…) |
| Kho ý tưởng | một kho, nghiêng dần sang thu → đông | **mỗi kênh một kho**; bỏ nghiêng mùa (ý tưởng nào cũng là mùa lễ, từ tuyết đầu mùa tới Giao thừa) |
| Cổng | 3000 · trang theo dõi 3300 | **3100** · cổng từ xa **3301** (chạy song song được trên cùng máy) |
| Từ xa | trang theo dõi chỉ xem | **điều khiển cả app từ điện thoại** qua Tailscale (kể cả đăng nhập Muse ngay trên trang) |
| Cập nhật | giải nén gói cập nhật bằng tay | **tự cập nhật từ GitHub** khi app rảnh, lỗi thì tự quay về bản cũ |
| Dữ liệu Muse | `…-muse-gateway` cạnh app cũ | thư mục riêng cạnh app mới (vd. `D:\bokin-christmas-muse-gateway`) — đăng nhập Muse riêng |
| File chạy | `Chay-MV-Prompt-Studio.bat` | `Chay-Christmas-MV-Studio.bat` |

---

## 1. Bắt đầu nhanh (không cần biết code)

1. **Cài Node.js** (một lần): tải bản **LTS** tại <https://nodejs.org> và cài như phần mềm bình thường.
2. **Lấy app**: giải nén gói `Christmas-MV-Studio-cai-moi.zip` ra một thư mục (ví dụ `C:\Christmas-MV-Studio`) — xem `HUONG-DAN-MAY-MOI.txt`.
3. **Mở app**: bấm đúp vào
   - Windows: **`Chay-Christmas-MV-Studio.bat`** (mở ở <http://127.0.0.1:3100>)
   - macOS: **`Chay-Christmas-MV-Studio.command`** (lần đầu: chuột phải → *Open* → *Open* để macOS cho phép chạy.
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

1. Cài **Google Chrome** (nếu chưa có). Mở app bằng **`Chay-Christmas-MV-Studio`**.
2. Vào **Cài đặt → Tạo clip bằng Muse**: chọn **Tự động (Muse trong app)** (mặc định).
3. Bấm **Đăng nhập Muse** → cửa sổ Chrome của Muse hiện ra → **bạn tự đăng nhập** Muse (tài khoản Meta). Đăng nhập xong cửa sổ tự cất đi; thẻ báo
   “Đã đăng nhập Muse”. App không bao giờ thấy hay lưu mật khẩu; phiên đăng nhập nằm trong profile Chrome của Muse.
4. Ở thẻ **Công cụ video & storyboard** chọn **Meta Muse** để Claude viết prompt đúng kiểu Muse (clip 10 giây, một đoạn văn liền, không mô tả âm thanh vì MV
   dùng nhạc của bài). Giới hạn ký tự trong hồ sơ này là ước tính — chỉnh ở trang **Thư viện** nếu cần.
5. Tuỳ chọn: **Thư mục nhạc** (để tự ghép bài hát — mục 2d), **Đủ clip + có bài hát → tự thêm vào hàng chờ dựng và chạy** (bật sẵn), **Ghép negative prompt
   vào cuối prompt (“Avoid: …”)** (bật sẵn — Muse không có ô negative prompt riêng).

### Tạo clip

1. Một MV: trang **🎬 Ghép video với nhạc** → thẻ **Tạo clip bằng Muse** → **🎬 Gửi N cảnh chưa có clip sang Muse**.
   Nhiều MV: menu **Clip Muse** → chọn MV → **🎬 Gửi sang Muse**. (Chạy hết cả quy trình thì giao việc ở trang **Kênh**, theo dõi ở trang **Dây chuyền** — mục 2d.)
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

## 2d. Tự động: ý tưởng → MP4 (trang Kênh + trang Dây chuyền)

Hai trang, tách phần quản lý khỏi phần sản xuất:

- **Kênh** — quản lý: thẻ **Các kênh & kho nhạc chung** (thêm kênh, bật / tắt, *MV mỗi vòng*, *Bài cũ %*, *Chọn bài mới*, cột *Tiếp theo*; bấm
  **Xem kênh** để chọn kênh), **Kế hoạch sản xuất** của kênh đang xem (thứ tự vòng, video tiếp theo + bài của nó, các video sắp tới, đang làm, đã làm
  gần đây), **Nhạc đã dùng** (mục dưới), **Giao việc** (từ ý tưởng hoặc từ MV có sẵn — cho kênh đang xem, một kênh khác hoặc chia lần lượt các kênh), **Kho ý tưởng** của kênh
  và **Kho nhạc trên Google Drive**.
- **Dây chuyền** — sản xuất: *Chuẩn bị* (Claude / nhạc / Muse đã sẵn sàng chưa), **Tự lấy việc** (dây chuyền tự lấy ý tưởng trong kho các kênh, mỗi
  lúc N video; *Làm video trước, ghép nhạc sau*) và danh sách **Đang sản xuất** (lọc theo kênh; mỗi việc ghi 📺 kênh và 🎬 MV hay 📀 Playlist).

Mỗi việc là một video **cho một kênh** (mục *Kênh* bên dưới) chạy qua 4 bước, không cần bấm gì thêm:

1. **Kịch bản** — Claude viết từ một dòng ý tưởng (cần **Claude API key**: Cài đặt → *API key của Claude*; chế độ **Demo** cũng chạy được để thử).
   Playlist: **một vòng 20–30 cảnh** (Cài đặt → *Số cảnh mỗi video* và *Độ dài một vòng cảnh*, mặc định 250 giây ≈ 25 clip × 10 giây), không phụ
   thuộc độ dài nhạc. **MV một bài**: một vòng cảnh **3 phút** (ngắn hơn một bài ~3–4 phút để clip nào cũng được dùng, cuối bài lặp lại vài cảnh),
   không theo bài nào — nên làm ngay, không chờ nhạc. Nhân vật theo dàn ý; ý tưởng app tự nghĩ luôn là “**Chỉ cảnh, không nhân vật chính**”
   (Character Bible trống, mọi cảnh là phố phường, làng tuyết, người thường — các cảnh Giáng sinh nối tiếp nhau). Viết lần lượt từng video, việc
   giao trước viết trước.
2. **Nhạc** — MV: lấy bài lúc này — **bài Giáng sinh mức hay cao nhất kênh chưa dùng**; tên bài đứng đầu các tiêu đề YouTube (vd. `Silent Night |
   Christmas in Woodstock Vermont, 1952 🎄 …`), lên ảnh bìa và tên thư mục kết quả; ô Nhạc ghi vd. `Kênh “Kênh Giáng sinh”: MV bài “Silver Bells
   Waltz” (mức 3) · 3:24`. Kho chưa có bài kênh chưa dùng thì MV chờ ở bước Nhạc (clip vẫn làm). Playlist: app
   **tự xếp danh sách nhạc như Bokin Playlist Studio** cho kênh của video (mục *Kho nhạc & cách xếp bài* bên dưới) cho đủ **Độ dài video** (Cài đặt,
   mặc định 60 phút), rồi nối thành một file (FLAC, không mất chất lượng). Ô Nhạc ghi rõ, vd. `Kênh “Kênh Giáng sinh”: tự xếp 19 bài (9 cũ + 10 mới) ·
   60 phút · mở đầu bằng 3 bài vừa có MV`, kèm cảnh báo của Bokin khi kho sắp hết bài mới cho kênh. Kho không đủ khoảng 90% độ dài video → việc chờ,
   báo kho có bao nhiêu phút; thêm bài vào kho (hoặc đồng bộ Drive) là app tự chạy tiếp. Cũng có thể tải nhạc lên tay ở trang Ghép video (một file,
   tối đa 1,5 GB).
3. **Clip Muse** — gửi các cảnh chưa có clip sang Muse trong app (mục 2c), clip xong tự vào đúng cảnh.
4. **Dựng MP4** — đủ clip + có nhạc → thêm vào **Hàng chờ dựng**. Clip phát nguyên từng clip, vòng đầu theo thứ tự 1 → N, **các vòng sau xáo thứ tự**,
   lặp cho tới hết nhạc (~14 vòng cho 1 tiếng). Mỗi clip chỉ mã hoá một lần rồi nối bằng stream copy, nên video 1 tiếng dựng gần nhanh như video 4 phút;
   phần lâu nhất là kiểm tra lại toàn bộ file (giải mã hết hình và tiếng). File 1 tiếng 1080p khoảng **3–5 GB** — máy chạy cần đủ chỗ trống (hoặc chọn
   720p trong thiết lập dựng).

Cách dùng: trang **Kênh** → chọn kênh (**Xem kênh**) → thẻ **Giao việc** → tab **Từ ý tưởng** (dán bảng như trang Nhập ý tưởng → **Đọc bảng** →
**＋ Đưa N ý tưởng vào kho**, hoặc **▶ Chạy ngay cả N ý tưởng** để đưa cả bảng vào dây chuyền một lúc) hoặc tab **Từ MV có sẵn** (chọn video →
**▶ Chạy tự động N MV**). App hỏi
lại kèm thứ tự sản xuất của kênh và chi phí ước tính (lượt Muse, tiền Claude API). Theo dõi ở trang **Dây chuyền**: mỗi việc hiện 4 ô Kịch bản /
Nhạc / Clip Muse / Dựng MP4; bước lỗi có **↻ Thử lại bước lỗi**; cảnh Muse lỗi thì vào **Clip Muse** để Kiểm tra lại / Gửi lại / Bỏ qua cảnh lỗi & dựng
(ít cảnh lỗi thì app tự bỏ qua). Tiến độ lưu ở `data/pipeline.json`, tắt app mở lại chạy tiếp.

### Thứ tự sản xuất: mỗi kênh N MV một bài rồi 1 playlist

Cột **MV mỗi vòng** (thẻ *Các kênh & kho nhạc chung*, riêng từng kênh, 0–10, mặc định **3**): mỗi vòng kênh làm **N MV một bài** trước rồi mới tới
**1 playlist ~1 tiếng**, xong lại vòng mới. **0 = chỉ làm playlist** (như trước). Đổi số giữa chừng vẫn đúng: app đếm các MV liền nhau từ sau playlist
gần nhất.

- **MV một bài** = các cảnh Giáng sinh nối tiếp nhau của một vùng đất (ý tưởng trong kho của kênh), cho **một bài Giáng sinh truyền thống**. Bài chọn
  **lúc ghép nhạc**: bài **kênh chưa dùng lần nào**, **mức hay cao nhất** trước, rồi theo thứ tự trong `Kho bài hát.xlsx` — MV ghép nhạc trước lấy bài
  đầu danh sách. Tên bài làm tên video; thư mục kết quả `021 - MV <tên bài> - <địa điểm>`. Thẻ Kế hoạch sản xuất ghi **bài dự kiến** cho MV tiếp theo.
- **Playlist cuối vòng mở đầu bằng các bài vừa có MV** (theo thứ tự MV; tính là bài cũ, bài có nhiều bản thì dùng bản kênh chưa dùng như luật dùng lại
  của Bokin), phần còn lại xếp như cũ.
- **Kho nhạc chưa xong**: MV và playlist vẫn làm ngay (kịch bản + clip Muse), chờ ở bước Nhạc; kho có bài là app tự ghép nhạc theo đúng thứ tự rồi dựng.
- **Nhạc ghép đúng thứ tự** để lịch sử kênh đúng vòng: playlist chờ các MV của vòng có nhạc trước, MV vòng sau chờ playlist vòng trước (ô Nhạc ghi
  rõ đang chờ video nào); trong lúc chờ, kịch bản và clip Muse vẫn làm tiếp.
- Kho ý tưởng cấp ý tưởng cho cả MV lẫn playlist (bài thì app chọn). Thẻ **Kế hoạch sản xuất** (trang Kênh) cho thấy video tiếp theo của kênh là MV
  mấy / playlist và bài dự kiến.

### Tự sản xuất: mỗi kênh luôn có sẵn N video chưa đăng

Cột **Làm sẵn** (thẻ *Các kênh & kho nhạc chung*, riêng từng kênh, 0–40, mặc định **4** = một vòng 3 MV + 1 playlist): kênh luôn có chừng ấy video
**chưa đăng** (đã làm xong + đang làm). Thiếu thì dây chuyền tự làm thêm; kho ý tưởng của kênh sắp hết (kể cả kho trống) thì **Claude tự nghĩ ý tưởng**
(Giáng sinh ở một vùng đất, chỉ cảnh, không nhân vật chính) và **dùng luôn**, không chờ duyệt. Đủ thì kênh dừng, không tốn thêm lượt Muse hay tiền Claude.

- Đăng một video lên YouTube xong thì bấm **✓ Đã đăng** — ở thẻ **Kế hoạch sản xuất** (mục *Làm sẵn*, danh sách video chưa đăng) hoặc ở video đã xong
  trên trang **Dây chuyền**. Kênh bớt một video làm sẵn, app tự làm bù. Bấm nhầm thì **↺ Chưa đăng** (mục *Đã đăng gần đây*).
- **0 = không tự làm** video cho kênh đó (vẫn giao việc tay được). Kênh tắt (bỏ tick Bật) cũng không tự làm.
- Video làm trước khi có phần này mà không còn trong dây chuyền được coi là đã đăng; video còn trong dây chuyền thì là chưa đăng cho tới khi bấm
  **✓ Đã đăng**. Bản cập nhật chuyển cài đặt kho ý tưởng một lần sang: tự lấy việc, Claude tự nghĩ, dùng luôn,
  làm video trước rồi ghép nhạc sau — đổi lại được ở thẻ Kho ý tưởng và Tự lấy việc.
- Số video làm cùng lúc vẫn theo ô *mỗi lúc N video* (thẻ Tự lấy việc), nên dây chuyền đi theo tốc độ của Muse; Muse hết lượt tuần thì app tự dừng gửi.

### Nhạc đã dùng: theo kênh, theo video

Thẻ **Nhạc đã dùng** (trang Kênh, kênh đang xem), lấy từ lịch sử nhạc của kênh, có ô tìm bài / video:

- **Theo video** — mỗi MV / playlist đã xếp nhạc (mới nhất trước): các bài **theo thứ tự**, **giờ bắt đầu** từng bài, mức hay, bản đã dùng (vd.
  `1 (1).mp3`), thời lượng; nút **📋 Chép danh sách bài** chép các dòng `0:00 Tên bài` để dán vào mô tả YouTube (YouTube tự tạo chương — mô tả
  trong thư mục kết quả của playlist đã có sẵn danh sách này). Bấm tên video để mở trang Ghép video của nó.
- **Theo bài** — mỗi bài kênh đã dùng: số lần, dùng ở MV / playlist nào, ngày, bài thứ mấy trong playlist, bản nào; bài không còn trong kho thì ghi rõ.
- **Chưa dùng** — các bài trong kho kênh chưa dùng lần nào, theo mức hay; dòng **Đang giữ cho MV đang làm** cho biết bài nào MV đang làm đã giữ.

Danh sách bài của từng video cũng có ở trang **Dây chuyền** (nút **🎵 Danh sách bài** của video đã có nhạc) và trang **Ghép video** (mục *Danh
sách bài*, playlist).

### Video hoàn thiện: ảnh bìa, tiêu đề, mô tả có danh sách bài, thư mục kết quả

- **Cảnh đời sống Giáng sinh 50s** (Cài đặt → *Cảnh đời sống Giáng sinh 50s (% số cảnh)*, mặc định 40%): cảnh mở đầu và các cảnh rải đều trong vòng cảnh
  là đời sống mùa lễ của nơi và năm đó — nhóm hát mừng, chợ cây thông, ông già Noel ở cửa hàng, trẻ con trượt tuyết, người đưa thư mang quà, tàu hơi nước
  trong tuyết… — **không có nhân vật chính**. Bảng cảnh đánh dấu 🎄; cảnh này mà có nhân vật chính thì app cảnh báo. 0 = tắt.
- **Ảnh bìa** (tạo ngay sau khi dựng, không tốn lượt Muse): khung hình đẹp từ chính clip của video, cắt 1280×720, màu ấm hơn, nền tối dần ở dưới, **tên
  video** to (phần đầu tiêu đề YouTube, bỏ emoji) + dòng “địa điểm · năm · 1 Hour”, logo kênh ở góc nếu có. Mã: `src/lib/cover.ts`.
- **Mô tả YouTube kèm danh sách bài**: video dùng nhiều bài thì cuối mô tả (trước dòng hashtag) có `Tracklist:` và từng dòng `0:00 Tên bài`,
  `3:07 Tên bài`… — YouTube tự tạo chương. Tên bài lấy từ câu điệp khúc trong thư viện lời (thư mục bài đánh số trên Drive), không có thì
  “Christmas Song No. 12” hoặc tên file. Mô tả này cũng được ghi vào file MP4 và file `Tiêu đề - mô tả.txt`. Mã: `src/lib/playlist.ts`.
- **Thư mục kết quả** (Cài đặt → *Thư mục kết quả*, mặc định `KET QUA GIANG SINH` cạnh thư mục app): **mỗi kênh một thư mục con**, mỗi video xong
  một thư mục, vd. `KET QUA GIANG SINH\Kênh Giáng sinh\001 - Rockefeller Center Christmas Eve 1955`, gồm video (tên file = tiêu đề YouTube),
  `Ảnh bìa.jpg`, `Tiêu đề - mô tả.txt` (dòng đầu ghi **KÊNH** + tên kênh, để biết đăng lên kênh nào). Cùng ổ đĩa thì video là liên kết cứng (không tốn
  thêm chỗ), khác ổ thì chép. Đặt thư mục kết quả trong ổ **Google Drive cho máy tính** thì kết quả tự lên Drive.

### Kho nhạc & cách xếp bài (như Bokin Playlist Studio)

Kho trên Drive giống KHO NHẠC của kênh cũ, thêm **một tệp `Kho bài hát.xlsx`** — cùng mẫu với Bokin Playlist Studio (chép tệp của Bokin sang cũng
được). Thư mục gốc gồm:

- **`Kho bài hát.xlsx`** (hoặc một Google Sheet tên **“Kho bài hát”**, hoặc `.csv`): mỗi dòng một bài, dòng tiêu đề nằm trong 10 dòng đầu. Cột:
  **Mã bài**, **Tên bài** (tên hiện trong danh sách bài của mô tả YouTube), *Tệp nhạc* (tên file; bỏ trống thì lấy các file đánh số theo Mã bài, vd. mã
  `12` → `12.wav`, `12 (1).wav`), **Mức hay** (1–3; ghi số, chữ hay ★ đều được; trống = 1), *Dùng lại* (Bình thường · Thưa hơn · Rất thưa · Không dùng
  lại · Loại khỏi kho), *Nghệ sĩ*, *Thể loại*, *Ghi chú*. Bài có file trong Thư mục nhạc mà chưa có dòng trong tệp = **mức 1**. Dòng sai (thiếu mã, mức
  lạ, không thấy file) hiện ở thẻ **Các kênh & kho nhạc chung** (trang Kênh). Để tệp ở chỗ khác: Cài đặt → *Tệp Kho bài hát*.
- Các thư mục bài đánh số (mỗi thư mục một Google Doc: địa điểm, chủ đề, dàn ý, lời) và thư mục file nhạc đặt tên theo số (`12.wav`, `12 (1).wav` = bản
  thứ hai, `76_1.mp3`). **Không cần ghi “đã dùng” nữa**: app tự nhớ kênh nào đã dùng bài nào (bài cũ hay còn được dùng lại).

Mỗi video, app xếp danh sách nhạc **theo đúng luật của Bokin Playlist Studio** (mã: `src/lib/channels.ts`, chuyển từ `loop_music/channels.py`):

- **Bài cũ** = bài **mức 2–3** mà kênh **đã dùng**, bài **nghỉ lâu nhất** trước (cột *Dùng lại*: Thưa hơn = nghỉ gấp đôi mới tới lượt, Rất thưa = gấp bốn,
  Không dùng lại = không bao giờ). **Bài mới** = bài kênh **chưa dùng lần nào**: *Cân bằng các mức* (mặc định — mức 3, 2, 1 theo tỉ lệ trong kho, các
  video đều nhau) hoặc *Mức cao trước*. Bài **mức 1 chỉ dùng làm bài mới**.
- Số bài: đủ **Độ dài video** (mặc định 60 phút), trong đó khoảng **46% là bài cũ** (tỉ lệ 6 / 13 của Bokin; đổi riêng từng kênh ở cột *Bài cũ %*).
  Video đầu của kênh toàn bài mới.
- Thứ tự: **mức 3 → 2 → 1** (cùng mức thì ngẫu nhiên theo video); **bài mở đầu khác bài mở đầu video trước**.
- Bài có nhiều bản (`12.wav`, `12 (1).wav`): bài mới dùng bản chính; bài dùng lại dùng **bản kênh đó ít dùng nhất**.
- Thiếu bài mới: dùng lại thêm bài mức 2–3 → rồi bài mức 1 → rồi báo “Kho chỉ đủ …”; kho chỉ còn ít bài mới cho kênh (≤ 3 video) thì nhắc thêm bài.
- Lịch sử từng kênh (bài nào ở video nào) lưu ở `data/channels.json` (không commit).

Thẻ **Kho nhạc trên Google Drive** (trang Kênh): dán link thư mục gốc (chia sẻ “Bất kỳ ai có đường liên kết”) → app tải `Kho bài hát.xlsx` (Google
Sheet thì tải bản xlsx), đọc lời, tải **mọi file nhạc còn thiếu** về **Thư mục nhạc**; file nào trên Drive đổi tên thì đổi tên bản ở máy cho khớp. Tệp
`Kho bài hát.xlsx` bạn đã sửa ở máy thì không bị ghi đè. Tự đồng bộ mỗi 6 giờ. Không xoá file nào.

### Kênh: tự phân luồng video cho từng kênh

Thẻ **Các kênh & kho nhạc chung** (trang Kênh): ban đầu có một kênh “Kênh Giáng sinh”; **＋ Thêm kênh** để làm cho nhiều kênh. Mỗi kênh: bật / tắt
(tắt = tạm không làm video mới), đổi tên, *MV mỗi vòng*, *Bài cũ %*, *Chọn bài mới*; cột *Video* (đã làm + đang làm), *Tiếp theo* (MV mấy / playlist)
và *Bài mới còn* (đủ cho khoảng mấy video).

- **Tự phân luồng**: mỗi video mới vào **kênh đang bật có ít video nhất** (bằng nhau thì kênh đứng trước) — các kênh đều nhau. Thẻ **Giao việc** có ô
  **Kênh**: kênh đang xem (mặc định), một kênh khác hoặc *Chia lần lượt các kênh*; bảng ý tưởng có dòng tiêu đề với cột **Kênh** (tên kênh) thì
  dòng đó thuộc kênh đó.
- Mỗi việc trong dây chuyền ghi 📺 tên kênh và 🎬 MV / 📀 Playlist; ô Nhạc ghi kênh và số bài cũ / mới.
- Các kênh **dùng chung một kho nhạc**; bài cũ / mới tính theo **lịch sử riêng** của từng kênh (bài mới của kênh này có thể là bài kênh khác đã dùng).
- Mỗi kênh **một kho ý tưởng riêng** (mục dưới); kết quả để trong thư mục con theo tên kênh.

### Kho ý tưởng: mỗi kênh một kho, chạy liên tục, hết ý tưởng thì Claude đề xuất thêm

Thẻ **Kho ý tưởng** (trang Kênh, kho của kênh đang xem) giữ ý tưởng của kênh và đánh dấu **chưa dùng / đã dùng** (lưu ở `data/ideas.json`;
app mới bắt đầu với kho trống). Ý tưởng trùng (cùng địa điểm + dàn ý) chỉ bị bỏ qua trong cùng một kênh:

- **Dây chuyền tự lấy ý tưởng trong kho các kênh, lần lượt đều các kênh, mỗi lúc N video** (thẻ **Tự lấy việc**, trang Dây chuyền; mặc định 2): chỉ lấy ý tưởng mới khi số video đang viết
  kịch bản hoặc chờ clip Muse ít hơn N — dây chuyền tự đi theo tốc độ của Muse.
- **Chỉ làm video mới khi kho nhạc còn bài mới cho kênh đó** (tắt sẵn — làm video trước, ghép nhạc sau): bật thì kênh hết bài mới thì ý tưởng của
  kênh nằm chờ (các kênh khác vẫn chạy); thêm bài vào kho là tự chạy tiếp. **Kho nhạc chưa xong → để tắt** (hoặc bấm *Làm video trước, ghép nhạc sau*): dây chuyền cứ viết kịch bản và
  làm clip Muse, video chờ ở bước Nhạc (bước Clip Muse không chờ nhạc; video chờ nhạc không tính là “đang làm” nên dây chuyền lấy tiếp ý tưởng
  mới); kho có nhạc (đồng bộ Drive / thả bài vào Thư mục nhạc) thì trong vòng nửa phút app tự xếp bài kiểu Bokin cho từng video rồi dựng. Nhớ: mỗi
  video vẫn tốn 20–30 lượt Muse, và kho có ít bài mới thì các video làm trước sẽ dùng lại nhiều bài cũ.
- **Kênh cần thêm video mà kho sắp hết (kể cả kho trống) thì nhờ Claude nghĩ M ý tưởng mới** cho kênh đó (mặc định 10; nối số và series theo ý tưởng
  của kênh, tránh trùng mọi kênh): “địa điểm / vùng đất có thật ở Mỹ + dịp lễ + năm 1950–1959” (vd. `Woodstock Vermont Christmas Eve 1952`,
  `Rockefeller Center First Snow 1955`), mã chủ đề có trong thư viện (ưu tiên chủ đề ít dùng), dàn ý tiếng Việt **luôn là “Chỉ cảnh, không nhân vật
  chính: …”** — các cảnh Giáng sinh của nơi đó (phố phường, nhà cửa, cảnh vật, phong tục, người thường). Vùng nắng ấm (California, Florida, New
  Orleans) thì thể hiện Giáng sinh qua đèn, cây cọ, quà — không có tuyết.
- **Dùng luôn, không cần duyệt** (mặc định) hoặc **Chờ tôi duyệt**; **✨ Nhờ Claude đề xuất ngay** (cho kênh đang xem) bất cứ lúc nào. Cần **Claude API
  key**; chế độ **Demo** cho ý tưởng mẫu để thử.
- **Thư viện chủ đề** (`data/themes.json`): T01–T22 Giáng sinh, nhóm Lãng mạn · Gia đình · Trẻ thơ · Phố phường · Ấm cúng · Hoài niệm (mỗi mã có tên,
  không khí, nhịp, cảnh đặc trưng). Thư viện địa điểm (`data/locations.json`): 18 nơi mùa Giáng sinh thập niên 50 (Rockefeller Center, Fifth Avenue,
  Central Park, Woodstock Vermont, Bethlehem Pennsylvania, nhà ngoại ô, trang trại Trung Tây, ga tàu tuyết, Hollywood, Miami…); nơi chưa có thì Claude
  tự suy luận và lưu lại để bạn duyệt.

## 2e. Chạy trên máy khác (máy chạy riêng, điều khiển từ xa)

App có thể chạy suốt trên một máy Windows khác; bạn **điều khiển cả app qua trang web từ điện thoại / máy khác** (cổng từ xa qua
Tailscale, kể cả đăng nhập Muse — mục dưới), app **tự cập nhật từ GitHub** nên không phải cài tay mỗi lần. App vẫn chỉ mở trong chính máy đó
(127.0.0.1). Hướng dẫn từng bước cho người không rành máy: **`HUONG-DAN-MAY-MOI.txt`**.

- **Đóng gói**: bấm đúp `Dong-goi-cai-moi.bat` → `Christmas-MV-Studio-cai-moi.zip` (thư mục `<tên thư mục app>-goi` cạnh thư mục app, vd. `D:\bokin-christmas-goi`):
  mã nguồn + dữ liệu của bạn (cài đặt, chủ đề, địa điểm, cặp đôi, thư viện lời, kênh + lịch sử nhạc từng kênh, kho ý tưởng). **Không** có API key (`.env*`),
  phiên đăng nhập Muse, nhạc, video hay lịch sử MV. `Dong-goi-cap-nhat.bat` → bản chỉ có mã nguồn, giải nén đè để cập nhật app
  ở máy kia mà giữ nguyên dữ liệu ở đó. Thêm `--ra <thư mục>` để đổi nơi để file zip.
- **Kho nhạc trên Google Drive** (trang Kênh): dán link thư mục kho nhạc (chia sẻ “Bất kỳ ai có đường liên kết”) → **Đồng bộ
  ngay**. App tải `Kho bài hát.xlsx`, đọc lời từ các thư mục bài đánh số vào `data/song_library.json`, tải mọi file nhạc còn
  thiếu về Thư mục nhạc, file nào trên Drive đổi tên thì đổi tên bản ở máy cho khớp; không xoá file nào.
  **Tự đồng bộ mỗi 6 giờ** (bật sẵn) — chỉ tải bản mới. Mã: `src/lib/driveSync.ts`.
- **Tự chạy tiếp khi mở lại**: lúc server khởi động (`src/instrumentation.ts` → `src/lib/autostart.ts`), app tự chạy tiếp
  dây chuyền, Muse và tự đồng bộ khi đến hạn — không cần ai mở trình duyệt. `Bat-tu-chay-khi-mo-may.bat` tạo lối tắt trong
  thư mục Startup để app tự mở mỗi lần đăng nhập Windows (`Tat-tu-chay-khi-mo-may.bat` để thôi). `NO_AUTOSTART=1` để tắt.
- **Một tài khoản Muse chỉ chạy ở một máy**: chuyển sang máy chạy rồi thì tắt app ở máy cũ. App Giáng sinh có Chrome / phiên đăng nhập Muse **riêng**
  (không dùng chung với MV Prompt Studio): nên đăng nhập một tài khoản Muse khác; dùng chung một tài khoản thì hai app chia nhau hạn mức tuần.
- **Máy chỉ có ổ C**: Thư mục nhạc ghi không kèm ổ đĩa (vd. `KHO NHAC GIANG SINH`) = thư mục cạnh thư mục app, vd. app ở
  `C:\Christmas-MV-Studio\Christmas-MV-Studio` → nhạc ở `C:\Christmas-MV-Studio\KHO NHAC GIANG SINH`. Video 1 tiếng nặng 3–5 GB: để ý chỗ trống ổ C.
- **Điều khiển từ xa** (Cài đặt → *Điều khiển từ xa (Tailscale)*): một cổng riêng (mặc định **3301**; app cũ dùng 3300) **chỉ mở trên địa chỉ
  Tailscale** của máy chạy (100.64.0.0/10) — máy cùng wifi / người ngoài không vào được; ở đâu cũng dùng được (4G, wifi khác) từ điện thoại / máy
  tính đã cài Tailscale cùng tài khoản. Vào cổng phải **đăng nhập bằng mật khẩu** (trang đăng nhập riêng; thiết bị nhớ 30 ngày bằng cookie
  HttpOnly; chỉ lưu bản băm của mã phiên trong `data/remote_sessions.json`; sai 5 lần thì khoá 15 phút; đổi mật khẩu = đăng xuất mọi thiết bị;
  mật khẩu lưu dạng băm scrypt trong `.env.local` = `MONITOR_PASSWORD_HASH`, không commit).
  - Tick **Cho phép điều khiển app** → mở được **mọi trang, mọi chức năng** như ngồi tại máy (cổng chuyển tiếp tới app ở 127.0.0.1; tải MP4 về,
    tải nhạc / clip lên); thanh menu hiện “🌐 Từ xa · Đăng xuất”, trên điện thoại menu gập thành nút ☰. Không tick = chỉ xem tiến độ
    (`/_remote/`: dây chuyền, MV đã xong + tải MP4, Muse, kênh, dung lượng ổ, lỗi cần chú ý; 5 giây/lần).
  - **Đăng nhập Muse từ xa**: bấm *Đăng nhập Muse* (trang Clip Muse / Dây chuyền / Cài đặt) → khung **Cửa sổ Chrome của Muse** hiện ngay trong
    trang: ảnh cửa sổ tự làm mới, bấm vào ảnh = bấm vào trang, ô gõ chữ (che được, cho mật khẩu / mã 2 bước), phím Enter / Xoá / Tab, cuộn, quay
    lại, tải lại, theo cả tab đăng nhập bật lên; *Hiện trang kiểu điện thoại* cho trang đăng nhập vừa màn hình nhỏ (tự tắt khi đăng nhập xong).
    Chữ gõ chuyển thẳng vào trang Muse, app không lưu. Mã: `src/lib/museEngine/screen.ts`, `src/components/muse/MuseScreen.tsx`.
  - Chống giả mạo: lệnh (POST…) chỉ nhận từ chính trang của app / của cổng (kiểm tra Origin; trang web lạ mở trên máy chạy cũng không gửi lệnh
    vào 127.0.0.1 được), tên máy lạ bị chặn (chống đổi DNS), trang không cho nhúng vào trang khác. Chưa đặt mật khẩu thì cổng không mở.
    Mã: `src/lib/monitor.ts` (máy chủ cổng), `src/lib/remote.ts` (đăng nhập, chuyển tiếp), `src/lib/monitorPage.ts` (trang theo dõi).
- **Tự cập nhật** (Cài đặt → *Cập nhật app*): mã nguồn để ở một **repo GitHub riêng tư** (mặc định `vhung-spec/christmas-mv-studio`, nhánh
  `christmas`); máy chạy giữ một **token chỉ-đọc** của repo đó trong `.env.local` (`GITHUB_UPDATE_TOKEN`, bạn tự dán; không bao giờ gửi lại cho
  trang). Mỗi giờ app hỏi GitHub; có bản mới thì tải về, giải nén vào thư mục `<thư mục app>-cap-nhat` cạnh thư mục app, kiểm tra; **khi app rảnh**
  (không dựng video / còn hàng chờ dựng, không viết kịch bản, không chạy batch, không gửi cảnh Muse, không đồng bộ Drive, không chờ đăng nhập Muse)
  thì app tự tắt (mã 75) → `scripts/start.mjs` cài (`scripts/cap-nhat.mjs`: chép mã mới; giữ `data/`, `.env*`, thư viện, bản build và file .bat;
  file bản mới bỏ thì chuyển sang thư mục dự phòng, không xoá), cài lại thư viện nếu `package-lock.json` đổi, build, chạy lại, kiểm tra app lên được.
  Build lỗi / app không chạy → **tự quay về bản cũ** và nhớ bản lỗi (không tự cài lại). Giữ 3 bản dự phòng gần nhất, cũ hơn vào Thùng rác. Dự
  phòng: tải gói `.zip` lên ở thẻ *Cập nhật app* (gói `Dong-goi-cap-nhat.bat` hoặc file zip tải từ GitHub). Gói cài có `ban-cai.json` (mã commit) để
  biết bản đang chạy. Máy phát triển (thư mục app là kho git) không tự cập nhật. Chỉ chạy được khi mở app bằng `Chay-Christmas-MV-Studio.bat`.
  Giải nén gói cập nhật đè lên bằng tay cũng được: lúc khởi động app tự chuyển file của bản cũ không còn trong gói sang dự phòng (kẻo build lỗi).

## 3. Logic sinh MV

1. **Character Bible** — Claude chọn nhân vật theo dàn ý: cặp đôi `HE`/`SHE`, gia đình `FATHER`/`MOTHER`/`GIRL`/`BOY`, trẻ em, ông bà… hoặc để trống
   khi ý tưởng “chỉ cảnh” (hoặc dùng **cặp đôi cố định cho cả series** nếu bật trong Cài đặt). Claude viết prompt với placeholder `{{HE}}`, `{{GIRL}}`…;
   công cụ thay bằng mô tả nguyên văn, nên nhân vật luôn đồng nhất.
2. **Một vòng cảnh → danh sách cảnh** (thuần code, `src/lib/structure.ts`): số cảnh = `ceil(độ dài một vòng cảnh / độ dài clip)`, rồi giới hạn trong
   khoảng **tối thiểu – tối đa** của Cài đặt (mặc định **20–30 cảnh = 20–30 prompt mỗi video**; khung kiểu một bài hát, khi dựng lặp cho hết ~1 tiếng nhạc). Khi bật **“Cảnh sẽ được lặp lại khi dựng”**, Claude viết mỗi cảnh
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
| `themes.json` | 22 chủ đề Giáng sinh T01–T22 (mood, nhịp dựng, signature shots). |
| `locations.json` | 18 nơi mùa Giáng sinh thập niên 50 — New York, New England, Chicago, Pennsylvania, thị trấn nhỏ, ngoại ô, trang trại, ga tàu, Hollywood, Miami, New Orleans, San Francisco (landmark trang trí mùa lễ, xe, trang phục mùa đông, đạo cụ, ánh sáng, thứ **không được xuất hiện**). Địa điểm chưa có sẽ được Claude tự suy luận và lưu với `auto_generated: true` để bạn duyệt. |
| `era_rules.json` | Quy tắc theo từng năm 1950–1959 (kèm đồ trang trí Giáng sinh thời đó), vật dụng theo năm ra đời (cây thông nhôm 1958, Thunderbird 1955…), đồ hiện đại bị cấm (đèn LED, đồ bơm hơi, đèn chiếu laser…), thương hiệu / người thật / nhân vật bản quyền (Rudolph, Frosty, Grinch…). |
| `style_presets.json` | Kodachrome 35mm Giáng sinh (mặc định), Technicolor phim ca nhạc mùa lễ, Phim gia đình 8mm, Phim đen trắng mùa lễ cổ điển. |
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
- **Cặp đôi cố định cho cả series**: tắt sẵn (mỗi video tự chọn nhân vật theo ý tưởng); bật lên thì cả series dùng chung một cặp đôi.
- **Cách tạo nội dung**: Tự động / claude.ai (copy – dán) / Claude API / Demo.
- **Số cảnh mỗi video**: mặc định 20–30 (= 20–30 prompt / lượt Muse); “Cảnh sẽ được lặp lại khi dựng” bật sẵn để mỗi cảnh độc lập, dùng lại được.
- **Độ dài video**: mặc định 60 phút — app tự xếp bài cũ + bài mới của kênh cho đủ chừng này (mục 2d).
- **Tệp Kho bài hát**: để trống = app tự tìm `Kho bài hát.xlsx` (hoặc `.csv`) trong Thư mục nhạc và thư mục con; ghi đường dẫn nếu để ở chỗ khác.

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
  songs.ts              file nhạc trong thư mục nhạc: liệt kê, đọc số bài / số bản trong tên file
  songSheet.ts          đọc Kho bài hát.xlsx / .csv (mẫu Bokin: Mã bài, Tên bài, Tệp nhạc, Mức hay, Dùng lại…)
  musicLibrary.ts       kho nhạc = tệp Kho bài hát + file trong thư mục nhạc (gom các bản của một bài, đo thời lượng)
  channels.ts           kênh (data/channels.json): tự xếp bài kiểu Bokin (chuyển từ loop_music/channels.py), đủ độ dài video,
                        chọn bản, phân luồng kênh, thứ tự sản xuất (N MV rồi playlist, bài cho MV); channelTypes.ts = kiểu,
                        channelsView.ts = thẻ Các kênh & kho nhạc chung + Nhạc đã dùng
  playlist.ts           nối danh sách nhạc thành một file, danh sách bài + mốc thời gian cho mô tả YouTube; chapters.ts = mốc thời gian / dòng
                        danh sách bài (dùng cả trên trình duyệt)
  pipeline.ts           dây chuyền tự động: kịch bản → bài hát → clip Muse → MP4 (data/pipeline.json), lập kế hoạch MV / playlist từng
                        kênh (planner), nhạc ghép đúng thứ tự; pipelineSteps.ts = kiểu + nhãn
  haohao.ts             đọc (chỉ đọc) hàng đợi tasks.json và thư mục lưu của tool HaoHao (cách dán tay)
  museJobs.ts           theo dõi các cảnh (data/muse.json), dò chạy nền, đưa clip vào đúng cảnh, tự thêm vào hàng chờ dựng
  monitor.ts, remote.ts  cổng từ xa qua Tailscale: đăng nhập (cookie phiên), chống giả mạo, chuyển tiếp mọi trang tới app; monitorPage.ts = trang theo dõi
  museEngine/screen.ts  khung xem cửa sổ Chrome của Muse (chụp tab, bấm / gõ qua CDP) để đăng nhập Muse ngay trên trang
  updater.ts            tự cập nhật phía app: hỏi GitHub, tải, giải nén, kiểm tra, chờ rảnh rồi tự tắt mã 75 để trình khởi động cài
  loudness.ts           cân bằng âm lượng (chuyển từ loop_music/loudness.py của Bokin Studio Music)
  quality.ts            preset YouTube (chuyển từ loop_music/quality.py)
  branding.ts, fonts.ts logo kênh, intro tiêu đề, thông tin MP4 (chuyển từ loop_music/branding.py, mp4meta.py)
src/app/                các trang: Nhập ý tưởng, Chạy batch, claude.ai (/manual), Kết quả (/mv/[id]), Ghép video (/mv/[id]/video), Clip Muse (/muse),
                        Kênh (/channels: quản lý, kế hoạch, giao việc, kho ý tưởng), Dây chuyền (/pipeline: sản xuất), Hàng chờ dựng
                        (/render-queue), Lịch sử, Thư viện, Cài đặt; API trong src/app/api/; thẻ của hai trang ở src/components/channels, pipeline
scripts/start.mjs       khởi động một lệnh (dùng bởi Chay-Christmas-MV-Studio.bat / .command); vòng chạy: app tự tắt mã 75 → cài bản mới → chạy lại
scripts/cap-nhat.mjs    tự cập nhật phía trình khởi động: chép bản mới, giữ dữ liệu, file thừa sang dự phòng, quay về bản cũ khi lỗi
tests/                  vitest (fakeMuse.ts = "Muse giả" điều khiển được, cho test)
```
