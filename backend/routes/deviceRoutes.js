const express = require('express');
const router = express.Router();
const db = require('../config/db');
const mqttClient = require('../config/mqtt');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/authMiddleware');
const { parseDateInput } = require('../utils/dateFilter');
require('dotenv').config();

// ============================================
// GET /api/devices/status - Lấy trạng thái hiện tại của tất cả thiết bị
// ============================================
router.get('/status', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM devices');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET /api/devices/action/:requestId - Tra kết quả của một lệnh vừa gửi
//
// Lệnh điều khiển là bất đồng bộ: API trả về ngay sau khi publish MQTT, lúc đó
// chưa biết mạch có nhận được hay không. Frontend gọi endpoint này để chờ kết
// quả thật (PENDING -> SUCCESS / FAILED / TIMEOUT), nhờ vậy mới biết lúc nào
// phải trả công tắc về trạng thái cũ thay vì đoán mò theo đồng hồ.
// ============================================
router.get('/action/:requestId', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT a.request_id, d.name AS device, a.action, a.status, a.error_message,
                    d.current_state
             FROM actions a
             JOIN devices d ON d.id = a.device_id
             WHERE a.request_id = ?`,
            [req.params.requestId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// POST /api/devices/control - Điều khiển thiết bị
// Theo SRS: Kiểm tra is_online, kiểm tra trùng trạng thái, tạo request_id
// ============================================
router.post('/control', verifyToken, async (req, res) => {
    try {
        const { device, action } = req.body;
        if (!device || !action) {
            return res.status(400).json({ error: 'device and action are required' });
        }

        // Cột actions.action và devices.current_state đều là ENUM('ON','OFF').
        // MySQL ở chế độ không nghiêm ngặt sẽ âm thầm cắt giá trị lạ thành chuỗi
        // rỗng thay vì báo lỗi, nên phải tự chặn ở đây; nếu không một lệnh bậy
        // vừa làm hỏng dữ liệu vừa được publish xuống mạch.
        if (action !== 'ON' && action !== 'OFF') {
            return res.status(400).json({
                success: false,
                message: `action phải là 'ON' hoặc 'OFF', nhận được '${action}'`
            });
        }

        // Tìm thiết bị trong bảng devices
        const [deviceRows] = await db.query(
            'SELECT * FROM devices WHERE name = ?', [device]
        );
        if (deviceRows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const deviceInfo = deviceRows[0];

        // Theo SRS: Kiểm tra is_online trước
        if (!deviceInfo.is_online) {
            // Thiết bị offline → không gửi MQTT, tạo actions FAILED
            await db.query(
                `INSERT INTO actions (user_id, device_id, request_id, action, status, error_message, sent_at) 
                 VALUES (?, ?, ?, ?, 'FAILED', 'Device is offline', NOW())`,
                [req.user.id, deviceInfo.id, uuidv4().substring(0, 8), action]
            );
            return res.status(503).json({
                success: false,
                message: `${device} is offline`,
                currentState: deviceInfo.current_state
            });
        }

        // Theo SRS: Kiểm tra trùng trạng thái → không gửi lệnh mới, không tạo bản ghi
        if (deviceInfo.current_state === action) {
            return res.json({
                success: true,
                message: `${device} is already ${action}`,
                currentState: deviceInfo.current_state
            });
        }

        // Tạo request_id duy nhất (theo SRS)
        const requestId = uuidv4().substring(0, 8);

        // Lưu action vào bảng actions với status = PENDING
        await db.query(
            `INSERT INTO actions (user_id, device_id, request_id, action, status, sent_at) 
             VALUES (?, ?, ?, ?, 'PENDING', NOW())`,
            [req.user.id, deviceInfo.id, requestId, action]
        );

        // Publish lệnh điều khiển qua MQTT
        const payload = JSON.stringify({
            requestId,
            device,
            action
        });
        mqttClient.publish(process.env.MQTT_TOPIC_DEVICE_CONTROL, payload);

        // Theo SRS: Timeout 5 giây nếu ESP không phản hồi
        setTimeout(async () => {
            try {
                const [check] = await db.query(
                    `SELECT status FROM actions WHERE request_id = ?`, [requestId]
                );
                if (check.length > 0 && check[0].status === 'PENDING') {
                    await db.query(
                        `UPDATE actions SET status = 'TIMEOUT', responded_at = NOW() WHERE request_id = ?`,
                        [requestId]
                    );
                    console.log(`⏰ Timeout: request ${requestId} for ${device}`);
                    // Không cập nhật devices.current_state khi timeout (theo SRS)
                }
            } catch (err) {
                console.error('Timeout check error:', err.message);
            }
        }, 5000);

        // KHÔNG cập nhật devices.current_state ở đây.
        // Trước đây có một "optimistic update" ghi current_state ngay khi vừa
        // publish lệnh, nên dù mạch không hề phản hồi (TIMEOUT) thì CSDL vẫn ghi
        // là đã bật, và công tắc ngoài Dashboard cứ sáng như thật.
        // Chỉ server.js mới được ghi current_state, và chỉ khi mạch báo SUCCESS.
        res.json({
            success: true,
            message: `${device} command sent`,
            requestId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET /api/devices - Lấy lịch sử hoạt động thiết bị (từ bảng actions)
//
// Bộ lọc theo từng thuộc tính hiển thị trên bảng: id, thiết bị, hành động,
// trạng thái và khoảng thời gian (chuỗi dạng 1/1/2025). Kèm phân trang + sắp xếp.
// ============================================
router.get('/', async (req, res) => {
    try {
        let {
            page = 1,
            limit = 10,
            id = '',
            device = '',
            action = '',
            status = '',
            from = '',
            to = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        page = Math.max(1, parseInt(page) || 1);
        limit = Math.min(100, Math.max(1, parseInt(limit) || 10));
        const offset = (page - 1) * limit;

        // Frontend gọi cột thời gian là created_at (tên trong JSON trả về),
        // còn trong CSDL nó là actions.sent_at -> phải nhận cả hai tên,
        // nếu không thì lọc/sắp xếp theo thời gian sẽ bị bỏ qua âm thầm.
        const sortMap = {
            id: 'a.id',
            device_name: 'd.name',
            action: 'a.action',
            status: 'a.status',
            sent_at: 'a.sent_at',
            created_at: 'a.sent_at',
            user_name: 'u.full_name'
        };
        const orderBy = sortMap[sortBy] || 'a.sent_at';
        sortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const where = [];
        const queryParams = [];

        // --- Lọc theo ID ---
        const idNum = parseInt(String(id).trim(), 10);
        if (Number.isInteger(idNum)) {
            where.push('a.id = ?');
            queryParams.push(idNum);
        }

        // --- Lọc theo thiết bị ---
        // Dùng LIKE thay vì so bằng: ô lọc là danh sách chọn nên luôn khớp tuyệt đối,
        // nhưng gọi API tay với device=den vẫn tìm được mà không cần đúng từng ký tự.
        device = String(device).trim();
        if (device) {
            where.push('d.name LIKE ?');
            queryParams.push(`%${device}%`);
        }

        // --- Lọc theo hành động ---
        action = String(action).trim().toUpperCase();
        if (action === 'ON' || action === 'OFF') {
            where.push('a.action = ?');
            queryParams.push(action);
        }

        // --- Lọc theo trạng thái ---
        status = String(status).trim().toUpperCase();
        if (['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'].includes(status)) {
            where.push('a.status = ?');
            queryParams.push(status);
        }

        // --- Lọc theo khoảng thời gian ---
        const fromAt = parseDateInput(from);
        const toAt = parseDateInput(to, true);
        if (fromAt) {
            where.push('a.sent_at >= ?');
            queryParams.push(fromAt);
        }
        if (toAt) {
            where.push('a.sent_at <= ?');
            queryParams.push(toAt);
        }

        // LEFT JOIN (không phải JOIN) cho bảng users: lệnh do mạch tự sinh hoặc
        // lệnh cũ không gắn user_id vẫn phải hiện trong lịch sử, chỉ là cột User trống.
        const baseQuery = `
            FROM actions a
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN users u ON a.user_id = u.id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        `;

        const [countResult] = await db.query(
            `SELECT COUNT(*) as total ${baseQuery}`, queryParams
        );
        const total = countResult[0].total;

        const [rows] = await db.query(
            `SELECT a.id, d.name AS device_name, a.action, a.status, a.sent_at AS created_at,
                    a.responded_at, a.error_message,
                    u.full_name AS user_name, u.username AS user_login
             ${baseQuery}
             ORDER BY ${orderBy} ${sortOrder}, a.id ${sortOrder} LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
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
