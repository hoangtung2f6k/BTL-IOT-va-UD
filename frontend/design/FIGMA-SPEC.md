# Thông số giao diện AURA HOME (để dựng lại trên Figma)

Mọi giá trị dưới đây lấy trực tiếp từ `frontend/css/style.css` và `frontend/index.html`.
Bốn file `.html` cạnh file này là bản xuất tĩnh của đúng 4 màn hình. Mỗi file **tự chứa**
(CSS đã nhúng sẵn), mở trực tiếp bằng trình duyệt là đúng giao diện, không cần chạy server.

| File | Màn hình |
|---|---|
| `dashboard.html` | Tổng quan |
| `sensor-data.html` | Sensor Data |
| `device-history.html` | Device History |
| `profile.html` | Profile |

---

## 1. Màu

| Vai trò | Mã |
|---|---|
| Nền sidebar / nền trang | `#0b1021` |
| Nền vùng nội dung chính | `#0f172a` |
| Thẻ, panel, thanh lọc, bảng | `#1c2438` |
| Header bảng, item thiết bị, nút phân trang | `#262f45` |
| Viền input, viền nút phụ | `#334155` |
| Nền mục nav đang chọn | `#1e293b` |
| Màu nhấn (logo, viền trái nav, nút trang đang xem, viền focus) | `#f97316` |
| Chữ chính | `#ffffff` |
| Chữ phụ (nhãn, header bảng) | `#94a3b8` |
| Chữ phụ sáng hơn (đơn vị) | `#cbd5e1` |
| Chữ mờ nhất (dòng gợi ý) | `#64748b` |
| Nhiệt độ | `#f43f5e` |
| Độ ẩm | `#0ea5e9` |
| Ánh sáng | `#eab308` |
| Thành công / công tắc bật | `#10b981` |
| Đang chờ, timeout | `#f59e0b` |

## 2. Chữ

Font **Inter** (400 / 500 / 600 / 700).

| Thành phần | Cỡ / đậm |
|---|---|
| Tên app trên sidebar | 16 / 700, giãn chữ 1 |
| Mục nav | 16 / 500 |
| Tiêu đề trang (H1) | 24 / 700 |
| Phụ đề trang | 14 / 400, `#94a3b8` |
| Nhãn ô lọc | 11 / 600, IN HOA, giãn chữ 0.5 |
| Nội dung ô lọc | 13 / 400 |
| Header bảng | 13 / 600, `#94a3b8` |
| Ô trong bảng | 14 / 400 |
| Số đo lớn ở Dashboard | 32 / 700 |
| Đơn vị cạnh số đo | 16 / 500, `#cbd5e1` |
| Badge ON/OFF | 12 / 600 |
| Badge trạng thái (FAILED/TIMEOUT) | 11 / 700, giãn chữ 0.4 |

## 3. Kích thước & bo góc

- Sidebar rộng **260**, viền phải 1px `#1c2438`.
- Vùng nội dung padding **40**.
- Mục nav padding 16×24; mục đang chọn có **viền trái 4px** `#f97316` (padding trái còn 20).
- Thẻ cảm biến / khung biểu đồ / panel điều khiển: bo **16**, padding 20–24. Khung biểu đồ cao **350**.
- Thanh lọc, bảng: bo **12**. Thanh lọc padding 18, khoảng cách các ô 14.
- Ô input / select: bo **8**, padding 10×12, viền 1px `#334155`, nền `#0f172a`.
- Ô bảng padding **15**, đường kẻ dưới 1px `#262f45`.
- Badge ON/OFF: bo **20**, padding 4×10. Badge trạng thái: bo **6**.
- Công tắc **46×26**, nút tròn 20, bật `#10b981` / tắt `#334155`.
- Icon thiết bị 44×44 bo 12; icon cảm biến 40×40 bo 10.

## 4. Sidebar (giống nhau ở cả 4 frame)

Logo vuông 32 bo 8 nền `#f97316` + chữ **AURA HOME**.
Menu: **Dashboard · Sensor Data · Device History · Profile · Đăng xuất** (mục Đăng xuất màu `#f43f5e`).
Chân sidebar: ảnh đại diện tròn 40 + tên **Nghiêm Xuân Hoàng Tùng** (13/600) + **Quản trị viên** (11, `#94a3b8`).

## 5. Từng màn hình

### Dashboard — tiêu đề "Tổng quan"
- Banner đỏ (chỉ hiện khi mất kết nối): nền `rgba(244,63,94,.12)`, viền `#f43f5e`, bo 10, nội dung
  *"Mất kết nối ESP8266 — không nhận được dữ liệu cảm biến."*
- Lưới 2 cột tỉ lệ **2fr / 1fr**, cách nhau 24.
- Cột trái: 3 thẻ **NHIỆT ĐỘ** (°C) · **ĐỘ ẨM** (%) · **ÁNH SÁNG** (lux); dưới là khung
  **Biểu đồ cảm biến** với 3 chú thích bấm được (Nhiệt độ / Độ ẩm / Ánh sáng).
- Cột phải: panel **Điều khiển thiết bị**, 3 dòng **Đèn · Quạt · Điều hòa**, mỗi dòng một công tắc.

### Sensor Data — phụ đề "Tra cứu và xem lại các giá trị cảm biến đã ghi"
- Thanh lọc **3 ô**, không có nút bấm (lọc chạy ngay khi chọn/gõ):
  **Sensor Type** (All Sensors / Temperature / Humidity / Light) · **Value** · **Time**.
- Dòng gợi ý định dạng ngày ngay dưới thanh lọc.
- Bảng **4 cột**: `ID` · `Sensor Type` · `Value` · `Time`.
- Chân bảng 1 hàng: `Showing 1 to 10 of N records` — `Number of lines [10]` — nút phân trang.

### Device History — phụ đề "Tra cứu lịch sử bật/tắt thiết bị"
- Thanh lọc **4 ô**, không có nút: **Device** · **Action** · **Status** · **Time**.
- Bảng **6 cột**: `ID` · `Device` · `Action` · `Status` · `Time` · `Time phản hồi`.
- Cột Status có 3 dạng:
  - thành công → badge `ON` (xanh) hoặc `OFF` (đỏ);
  - đang chờ → `loading` kèm icon xoay, màu `#f59e0b`;
  - hỏng → badge `TIMEOUT` (cam) hoặc `FAILED` (đỏ).
- Lệnh chưa phản hồi thì cột cuối là dấu `—`.

### Profile
- Ảnh đại diện 128 + tên, kèm các dòng: **Mã SV · Lớp · Email · Vai trò · Môn**.
- 5 liên kết dạng thẻ nền `#262f45` bo 8: Source code Github · Bản thiết kế giao diện (Figma)
  · Tài liệu API (Swagger UI) · Postman Collection · Báo cáo đồ án (PDF).

---

## Đưa vào Figma

Plugin **html.to.design** không đọc được `localhost` (server của họ nằm ngoài máy bạn). Hai cách:

1. **Cài extension html.to.design cho Chrome/Edge** — bắt trang trực tiếp từ trình duyệt.
   Bật `node server.js` rồi mở `http://localhost:3000/design/<tên file>.html`, bấm icon
   extension → Capture. Frame hiện ra trong plugin bên Figma.
2. **Đưa file lên hosting tĩnh miễn phí** (tiiny.host, Netlify Drop, GitHub Pages) rồi dán
   URL công khai vào ô Import của plugin. Mỗi file tự chứa nên kéo thả một file là chạy.

## Cách tạo lại bản xuất sau khi sửa giao diện

Bốn file HTML ở đây được sinh ra từ `index.html`, không phải chép tay. Khi giao diện thật
thay đổi thì tạo lại để không bị lệch. Các bước: chép `index.html`, bỏ thẻ
`<script src="js/app.js">`, thay thẻ `<link>` CSS bằng toàn bộ nội dung `style.css` đặt trong
`<style>`, đặt `display:block` cho đúng trang cần xuất và `display:none` cho ba trang còn lại,
rồi điền dữ liệu mẫu vào `<tbody>`.
