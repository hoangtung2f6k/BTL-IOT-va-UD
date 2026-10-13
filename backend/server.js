const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const db = require('./config/db');
const mqttClient = require('./config/mqtt');

const JWT_SECRET = process.env.JWT_SECRET || 'aura_home_secret_key_123';

// ============================================
// Theo dõi mạch còn sống hay không.
// Trước đây is_online chỉ được đặt TRUE mà không bao giờ về FALSE, nên đoạn
// kiểm tra "thiết bị offline" trong deviceRoutes.js không bao giờ chạy tới.
// Mạch gửi cảm biến mỗi 5 giây, quá 15 giây im lặng coi như đã mất kết nối.
// ============================================
let lastSensorAt = 0;
let devicesOnline = false;
const ESP_OFFLINE_MS = 15000;

// Lúc vừa khởi động thì chưa nghe thấy gì từ mạch, nên phải coi là offline cho
// tới khi có gói cảm biến đầu tiên. Thiếu bước này thì giá trị is_online = TRUE
// của lần chạy trước còn nguyên trong CSDL, và vòng kiểm tra bên dưới cũng không
// dọn được (nó thoát sớm khi devicesOnline = false) -> API vẫn nhận lệnh điều
// khiển cho một mạch đã rút dây, thay vì từ chối ngay.
db.query('UPDATE devices SET is_online = FALSE')
    .then(() => console.log('⚪ Khởi động: đánh dấu thiết bị offline, chờ dữ liệu từ mạch'))
    .catch(err => console.error('Lỗi đặt trạng thái offline lúc khởi động:', err.message));

setInterval(async () => {
    if (!devicesOnline) return;
    if (Date.now() - lastSensorAt <= ESP_OFFLINE_MS) return;
    try {
        await db.query('UPDATE devices SET is_online = FALSE');
        devicesOnline = false;
        console.log('🔴 Mất kết nối ESP8266 -> devices.is_online = FALSE');
    } catch (err) {
        console.error('Lỗi cập nhật trạng thái offline:', err.message);
    }
}, 5000);

// ============================================
// Dọn các lệnh kẹt ở trạng thái PENDING.
//
// Watchdog 5 giây trong deviceRoutes.js chỉ là một setTimeout sống trong tiến
// trình Node: tắt hoặc khởi động lại server trong lúc đang chờ là nó biến mất,
// bản ghi nằm lại PENDING vĩnh viễn (trang Device History hiện "loading" mãi).
// Lệnh gửi từ Terminal CLI thì vốn chưa từng có watchdog nào cả.
//
// Nên quét định kỳ: lệnh quá 10 giây mà mạch chưa phản hồi thì kết luận TIMEOUT.
// Ngưỡng 10 giây để luôn chạy sau watchdog 5 giây, tránh hai bên tranh nhau.
// Không đặt responded_at vì mạch thực sự chưa bao giờ phản hồi.
// ============================================
const ACTION_TIMEOUT_SECONDS = 10;

async function sweepStalePendingActions() {
    try {
        const [result] = await db.query(
            `UPDATE actions SET status = 'TIMEOUT'
             WHERE status = 'PENDING' AND sent_at < NOW() - INTERVAL ? SECOND`,
            [ACTION_TIMEOUT_SECONDS]
        );
        if (result.affectedRows > 0) {
            console.log(`⏰ Đã chuyển ${result.affectedRows} lệnh treo PENDING -> TIMEOUT`);
        }
    } catch (err) {
        console.error('Lỗi dọn lệnh treo:', err.message);
    }
}

// Chạy ngay lúc khởi động để dọn tồn đọng của những lần chạy trước,
// rồi canh tiếp cho các lệnh phát sinh sau này.
sweepStalePendingActions();
setInterval(sweepStalePendingActions, 15000);

const sensorRoutes = require('./routes/sensorRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const authRoutes = require('./routes/authRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Swagger API Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Đặc tả OpenAPI dạng thô. Có URL này thì Postman nhập được bằng
// "Import -> Link" (dán http://localhost:3000/swagger.json), khỏi phải đi tìm
// file trong thư mục dự án. Trang /api-docs chỉ là giao diện đọc, không phải
// file mà Postman hiểu được.
app.get('/swagger.json', (req, res) => res.json(swaggerDocument));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/devices', deviceRoutes);

// ============================================
// MQTT: Lắng nghe dữ liệu cảm biến từ ESP8266
// Theo SRS: Kiểm tra payload → tách 1 payload thành 3 bản ghi sensor_data
// Dùng payload.ts làm recorded_at
// ============================================
mqttClient.on('message', async (topic, message) => {
    try {
        const data = JSON.parse(message.toString());

        if (topic === process.env.MQTT_TOPIC_SENSOR) {
            const { roomId, temperature, humidity, lightRaw, ts } = data;

            // Validate: kiểm tra đủ trường (theo SRS)
            if (temperature === undefined || humidity === undefined || lightRaw === undefined) {
                console.log('⚠️ Payload thiếu trường, bỏ qua.');
                return;
            }

            // Validate: kiểm tra đúng kiểu dữ liệu (theo SRS)
            if (typeof temperature !== 'number' || typeof humidity !== 'number' || typeof lightRaw !== 'number') {
                console.log('⚠️ Kiểu dữ liệu sai, bỏ qua.');
                return;
            }

            // Validate: kiểm tra phạm vi hợp lệ (theo SRS)
            if (temperature < -40 || temperature > 80) {
                console.log(`⚠️ Nhiệt độ ngoài phạm vi: ${temperature}°C, bỏ qua.`);
                return;
            }
            if (humidity < 0 || humidity > 100) {
                console.log(`⚠️ Độ ẩm ngoài phạm vi: ${humidity}%, bỏ qua.`);
                return;
            }
            if (lightRaw < 0 || lightRaw > 1024) {
                console.log(`⚠️ Ánh sáng ngoài phạm vi: ${lightRaw}, bỏ qua.`);
                return;
            }

            // Lấy sensor_id cho từng loại cảm biến
            const targetRoom = roomId || 1;
            const [sensors] = await db.query(
                'SELECT id, type FROM sensors WHERE room_id = ?', [targetRoom]
            );
            const sensorMap = {};
            sensors.forEach(s => { sensorMap[s.type] = s.id; });

            // Dùng thời gian server (vì ESP dùng millis() không phải real-time clock).
            // Phải dùng NOW() của MySQL, KHÔNG dùng new Date().toISOString() — cái đó cho
            // giờ UTC, lệch 7 tiếng so với cột sent_at của bảng actions (vốn dùng NOW()),
            // khiến trang Data Sensor hiển thị sai giờ.
            // NOW() giữ nguyên một giá trị trong suốt 1 câu lệnh nên cả 3 bản ghi cùng mốc,
            // Frontend vẫn ghép lại được.
            await db.query(
                `INSERT INTO sensor_data (sensor_id, value, recorded_at) VALUES
                 (?, ?, NOW()), (?, ?, NOW()), (?, ?, NOW())`,
                [
                    sensorMap['temperature'], temperature,
                    sensorMap['humidity'], humidity,
                    sensorMap['light'], lightRaw
                ]
            );

            // Có dữ liệu về nghĩa là mạch đang sống -> đánh dấu thiết bị online
            lastSensorAt = Date.now();
            if (!devicesOnline) {
                await db.query('UPDATE devices SET is_online = TRUE WHERE room_id = ?', [targetRoom]);
                devicesOnline = true;
                console.log('🟢 ESP8266 online -> devices.is_online = TRUE');
            }

            console.log(`📊 Sensor data saved: T=${temperature}°C, H=${humidity}%, L=${lightRaw}`);
        }

        // Lệnh phát đi từ Terminal CLI (Terminal A) - lưu vào lịch sử actions.
        // Lệnh do chính backend publish (từ API /api/devices/control) không có source='cli'
        // nên không bị ghi trùng.
        if (topic === process.env.MQTT_TOPIC_DEVICE_CONTROL && data.source === 'cli') {
            const { requestId, device, action, auth } = data;

            // Xác thực thông tin đăng nhập kèm trong gói tin
            let userId = null;
            try {
                const payload = jwt.verify(auth?.token || '', JWT_SECRET);
                userId = payload.id;
            } catch (_) {
                console.log(`⚠️ Lệnh CLI không kèm token hợp lệ, bỏ qua: ${device}=${action}`);
                return;
            }

            const [deviceRows] = await db.query('SELECT id FROM devices WHERE name = ?', [device]);
            if (deviceRows.length === 0) {
                console.log(`⚠️ Lệnh CLI cho thiết bị không tồn tại: ${device}`);
                return;
            }

            await db.query(
                `INSERT INTO actions (user_id, device_id, request_id, action, status, sent_at)
                 VALUES (?, ?, ?, ?, 'PENDING', NOW())`,
                [userId, deviceRows[0].id, requestId, action]
            );
            console.log(`🖥️ Lệnh từ Terminal CLI: ${device} → ${action} (user ${auth.username}, request ${requestId})`);
        }

        if (topic === process.env.MQTT_TOPIC_DEVICE_RESPONSE) {
            // Cập nhật trạng thái thiết bị khi ESP phản hồi (theo SRS)
            const { requestId, device, state, status } = data;

            if (requestId) {
                if (status === 'SUCCESS') {
                    // Cập nhật actions → SUCCESS
                    await db.query(
                        `UPDATE actions SET status = 'SUCCESS', responded_at = NOW(), error_message = NULL WHERE request_id = ?`,
                        [requestId]
                    );
                    // Cập nhật devices → trạng thái mới + online
                    await db.query(
                        `UPDATE devices SET current_state = ?, is_online = TRUE WHERE name = ?`,
                        [state, device]
                    );
                } else {
                    // Cập nhật actions → FAILED
                    await db.query(
                        `UPDATE actions SET status = 'FAILED', responded_at = NOW(), error_message = ? WHERE request_id = ?`,
                        [data.error_message || 'Unknown error', requestId]
                    );
                    // Không cập nhật devices.current_state khi FAILED (theo SRS)
                }
            } else if (status === 'SUCCESS' && device && (state === 'ON' || state === 'OFF')) {
                // Mạch tự đổi trạng thái (chế độ AUTO theo ngưỡng, hoặc lệnh gõ từ
                // Serial Monitor): không có requestId vì không xuất phát từ lệnh nào
                // của web, nên trước đây nhánh trên bỏ qua hoàn toàn và bảng devices
                // giữ nguyên giá trị cũ -> công tắc trên web hiển thị sai.
                // Không ghi vào actions: đây không phải hành động của người dùng web.
                await db.query(
                    `UPDATE devices SET current_state = ?, is_online = TRUE WHERE name = ?`,
                    [state, device]
                );
            }
            console.log(`🔌 Device response: ${device} → ${state} (${status})`);
        }
    } catch (err) {
        console.error('Error processing MQTT message:', err.message);
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
