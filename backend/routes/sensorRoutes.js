const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { parseDateInput, parseTimeOfDay } = require('../utils/dateFilter');

// ============================================
// GET /api/sensors/latest - Lấy dữ liệu mới nhất (ghép 3 cảm biến thành 1 dòng)
// ============================================
router.get('/latest', async (req, res) => {
    try {
        // Lấy recorded_at mới nhất
        const [latestRow] = await db.query(
            `SELECT recorded_at FROM sensor_data ORDER BY recorded_at DESC LIMIT 1`
        );
        if (latestRow.length === 0) return res.json(null);

        const latestTime = latestRow[0].recorded_at;

        // Ghép 3 giá trị cùng thời điểm thành 1 dòng
        const [rows] = await db.query(
            `SELECT 
                ROUND(MAX(CASE WHEN s.type = 'temperature' THEN sd.value END), 1) AS temperature,
                ROUND(MAX(CASE WHEN s.type = 'humidity' THEN sd.value END), 1) AS humidity,
                ROUND(MAX(CASE WHEN s.type = 'light' THEN sd.value END), 0) AS light,
                sd.recorded_at AS created_at
            FROM sensor_data sd
            JOIN sensors s ON sd.sensor_id = s.id
            WHERE sd.recorded_at = ?
            GROUP BY sd.recorded_at`,
            [latestTime]
        );
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET /api/sensors/trends - 30 lần đo gần nhất cho biểu đồ
// ============================================
router.get('/trends', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                ROUND(MAX(CASE WHEN s.type = 'temperature' THEN sd.value END), 1) AS temperature,
                ROUND(MAX(CASE WHEN s.type = 'humidity' THEN sd.value END), 1) AS humidity,
                ROUND(MAX(CASE WHEN s.type = 'light' THEN sd.value END), 0) AS light,
                sd.recorded_at AS created_at
            FROM sensor_data sd
            JOIN sensors s ON sd.sensor_id = s.id
            GROUP BY sd.recorded_at
            ORDER BY sd.recorded_at DESC
            LIMIT 30`
        );
        res.json(rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET /api/sensors/list - Danh sách cảm biến đã khai báo
// Dùng để đổ dữ liệu cho ô lọc "Device ID" ở trang Data Sensor, thay vì
// viết cứng 1/2/3 trong HTML rồi lệch với CSDL khi thêm cảm biến mới.
// ============================================
router.get('/list', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, room_id, type, unit, description FROM sensors ORDER BY id'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET /api/sensors - Lịch sử dữ liệu cảm biến
//
// Mỗi dòng = 1 lần đo của MỘT cảm biến, đúng như bảng sensor_data lưu:
// device id | tên cảm biến | giá trị | thời gian.
// (Trước đây gộp 3 kênh cùng recorded_at thành 1 dòng 5 cột; phần gộp đó
// vẫn còn ở /latest và /trends vì Dashboard cần 3 giá trị cùng lúc.)
//
// Bộ lọc: theo từng thuộc tính của bảng - deviceId, sensorType, value,
// khoảng thời gian from/to (chuỗi dạng 1/1/2025). Kèm phân trang + sắp xếp.
// ============================================
router.get('/', async (req, res) => {
    try {
        let {
            page = 1,
            limit = 10,
            deviceId = '',
            sensorType = '',
            value = '',
            from = '',
            to = '',
            timeFrom = '',
            timeTo = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 10));
        const offset = (page - 1) * limit;

        // Tên cột mà frontend dùng khác tên cột trong CSDL -> phải ánh xạ,
        // đồng thời chỉ cho phép đúng các cột này để tránh SQL injection
        // (ORDER BY không dùng được tham số ?).
        const sortMap = {
            id: 'sd.id',
            device_id: 'sd.sensor_id',
            sensor_type: 's.type',
            value: 'sd.value',
            created_at: 'sd.recorded_at'
        };
        const orderBy = sortMap[sortBy] || 'sd.recorded_at';
        sortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const where = [];
        const params = [];

        // --- Lọc theo Device ID ---
        const deviceIdNum = parseInt(String(deviceId).trim(), 10);
        if (Number.isInteger(deviceIdNum)) {
            where.push('sd.sensor_id = ?');
            params.push(deviceIdNum);
        }

        // --- Lọc theo tên cảm biến ---
        sensorType = String(sensorType).trim();
        if (['temperature', 'humidity', 'light'].includes(sensorType)) {
            where.push('s.type = ?');
            params.push(sensorType);
        }

        // --- Lọc theo giá trị ---
        // So khớp dạng chuỗi để gõ "27" vẫn ra 27.3, thay vì phải gõ đúng tuyệt đối.
        // Bắt buộc ROUND: cột value là FLOAT nên ép sang chuỗi sẽ lòi sai số nhị phân
        // (25.4 -> 25.399999618530273) và không bao giờ khớp được chuỗi người dùng gõ.
        value = String(value).trim();
        if (value) {
            where.push('CAST(ROUND(sd.value, 1) AS CHAR) LIKE ?');
            params.push(`%${value}%`);
        }

        // --- Lọc theo khoảng thời gian ---
        const fromAt = parseDateInput(from);
        const toAt = parseDateInput(to, true);
        if (fromAt) {
            where.push('sd.recorded_at >= ?');
            params.push(fromAt);
        }
        if (toAt) {
            where.push('sd.recorded_at <= ?');
            params.push(toAt);
        }

        // --- Lọc theo khung giờ trong ngày, bỏ qua ngày ---
        // "15" -> mọi ngày, các bản ghi từ 15:00:00 đến 15:59:59.
        // TIME() làm mất tác dụng chỉ mục trên recorded_at, nhưng bảng vài chục
        // nghìn dòng nên vẫn trả về tức thì; đổi lại câu lệnh đọc rất rõ ràng.
        const todFrom = parseTimeOfDay(timeFrom);
        const todTo = parseTimeOfDay(timeTo, true);
        if (todFrom) {
            where.push('TIME(sd.recorded_at) >= ?');
            params.push(todFrom);
        }
        if (todTo) {
            where.push('TIME(sd.recorded_at) <= ?');
            params.push(todTo);
        }

        const baseQuery = `
            FROM sensor_data sd
            JOIN sensors s ON sd.sensor_id = s.id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        `;

        const [countResult] = await db.query(`SELECT COUNT(*) AS total ${baseQuery}`, params);
        const total = countResult[0].total;

        const [rows] = await db.query(
            `SELECT sd.id,
                    sd.sensor_id AS device_id,
                    s.type AS sensor_type,
                    s.unit,
                    ROUND(sd.value, 2) AS value,
                    sd.recorded_at AS created_at
             ${baseQuery}
             ORDER BY ${orderBy} ${sortOrder}, sd.id ${sortOrder}
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
