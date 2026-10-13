// ============================================
// Phân tích chuỗi ngày do người dùng gõ ở ô lọc thời gian.
//
// Giao diện yêu cầu nhập dạng chuỗi kiểu "1/1/2025" (ngày/tháng/năm), nên
// không dùng <input type="date"> được. Hàm này nhận:
//   "1/1/2025"            -> 2025-01-01 00:00:00  (hoặc 23:59:59 nếu endOfDay)
//   "1/1/2025 14:30"      -> 2025-01-01 14:30:00
//   "2025-01-01"          -> chấp nhận luôn dạng ISO cho tiện khi gọi API tay
//
// Trả về chuỗi 'YYYY-MM-DD HH:MM:SS' để truyền thẳng vào MySQL, hoặc null khi
// chuỗi không hợp lệ. Trả null thay vì ném lỗi để một ô lọc gõ dở dang
// ("1/1/20") chỉ đơn giản là bị bỏ qua, không làm hỏng cả yêu cầu.
//
// endOfDay = true: khi chỉ có ngày mà không có giờ thì lấy tới cuối ngày,
// để bộ lọc "Đến ngày" bao trọn cả ngày đó thay vì cắt ở 00:00:00.
// ============================================

function pad(n) {
    return String(n).padStart(2, '0');
}

function parseDateInput(raw, endOfDay = false) {
    const text = String(raw || '').trim();
    if (!text) return null;

    const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);

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

    const hasTime = hour !== undefined;
    hour = hasTime ? Number(hour) : (endOfDay ? 23 : 0);
    minute = hasTime ? Number(minute) : (endOfDay ? 59 : 0);
    second = second !== undefined ? Number(second) : (hasTime ? 0 : (endOfDay ? 59 : 0));

    if (month < 1 || month > 12 || day < 1) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;

    // Chặn ngày không tồn tại: Date tự "tràn" 31/02 thành 03/03 nên phải
    // so lại ngày/tháng sau khi dựng để phát hiện.
    const probe = new Date(year, month - 1, day);
    if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;

    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

module.exports = { parseDateInput };
