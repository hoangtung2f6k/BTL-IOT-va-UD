// ============================================
// Phân tích chuỗi ngày do người dùng gõ ở ô lọc thời gian.
//
// Giao diện yêu cầu nhập dạng chuỗi kiểu "1/1/2025" (ngày/tháng/năm), nên
// không dùng <input type="date"> được.
//
// Người dùng gõ tới đâu thì lọc chính xác tới đó — phần bỏ trống được hiểu là
// "cả khoảng", chứ không bắt phải gõ đủ giờ:phút:giây:
//   "1/1/2025"             -> trọn ngày   01/01 00:00:00 .. 23:59:59
//   "1/1/2025 15"          -> trọn giờ    15:00:00 .. 15:59:59
//   "1/1/2025 15:30"       -> trọn phút   15:30:00 .. 15:30:59
//   "1/1/2025 15:30:45"    -> đúng giây đó
//   "2025-01-01 15"        -> chấp nhận luôn dạng ISO cho tiện khi gọi API tay
//
// Trả về chuỗi 'YYYY-MM-DD HH:MM:SS' để truyền thẳng vào MySQL, hoặc null khi
// chuỗi không hợp lệ. Trả null thay vì ném lỗi để một ô lọc gõ dở dang
// ("1/1/20") chỉ đơn giản là bị bỏ qua, không làm hỏng cả yêu cầu.
//
// endOfRange = false -> lấy mốc ĐẦU khoảng (các đơn vị trống điền 0), dùng cho "từ".
// endOfRange = true  -> lấy mốc CUỐI khoảng (điền giá trị lớn nhất), dùng cho "đến".
// Nhờ vậy một chuỗi duy nhất vừa làm cận dưới vừa làm cận trên được.
// ============================================

function pad(n) {
    return String(n).padStart(2, '0');
}

function parseDateInput(raw, endOfRange = false) {
    const text = String(raw || '').trim();
    if (!text) return null;

    // Giờ, phút, giây đều không bắt buộc và lồng nhau: có phút mới được có giây.
    const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);

    let day, month, year, hour, minute, second;
    if (vn) {
        [, day, month, year, hour, minute, second] = vn;
    } else if (iso) {
        [, year, month, day, hour, minute, second] = iso;
    } else {
        return null;
    }

    year = Number(year);
    month = Number(month);
    day = Number(day);

    // Đơn vị nào người dùng không gõ thì điền 0 (mốc đầu) hoặc giá trị lớn nhất
    // (mốc cuối). Cùng một quy tắc áp cho cả giờ, phút lẫn giây nên "1/1/2025 15"
    // tự thành 15:00:00..15:59:59, còn "1/1/2025" thành 00:00:00..23:59:59.
    hour = hour !== undefined ? Number(hour) : (endOfRange ? 23 : 0);
    minute = minute !== undefined ? Number(minute) : (endOfRange ? 59 : 0);
    second = second !== undefined ? Number(second) : (endOfRange ? 59 : 0);

    if (month < 1 || month > 12 || day < 1) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;

    // Chặn ngày không tồn tại: Date tự "tràn" 31/02 thành 03/03 nên phải
    // so lại ngày/tháng sau khi dựng để phát hiện.
    const probe = new Date(year, month - 1, day);
    if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;

    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// ============================================
// Phân tích chuỗi chỉ có GIỜ, không kèm ngày: "15", "15:30", "15:30:45".
//
// Khác hẳn parseDateInput ở chỗ nó không trỏ tới một thời điểm cụ thể mà mô tả
// một khung giờ lặp lại hằng ngày — dùng để lọc "mọi ngày, trong khoảng giờ đó".
// Phút và giây bỏ trống thì điền 0 (mốc đầu) hoặc 59 (mốc cuối), nên "15" tự
// thành 15:00:00..15:59:59.
//
// Trả về 'HH:MM:SS' để so với TIME(cột) trong MySQL, hoặc null khi không hợp lệ.
// ============================================
function parseTimeOfDay(raw, endOfRange = false) {
    const text = String(raw || '').trim();
    if (!text) return null;

    const m = text.match(/^(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!m) return null;

    const hour = Number(m[1]);
    const minute = m[2] !== undefined ? Number(m[2]) : (endOfRange ? 59 : 0);
    const second = m[3] !== undefined ? Number(m[3]) : (endOfRange ? 59 : 0);

    if (hour > 23 || minute > 59 || second > 59) return null;

    return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

module.exports = { parseDateInput, parseTimeOfDay };
