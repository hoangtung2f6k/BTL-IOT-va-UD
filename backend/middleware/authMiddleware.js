const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aura_home_secret_key_123';

// ============================================
// Middleware: bắt buộc phải đăng nhập (Bearer token hợp lệ)
// Dùng cho các API thao tác thật (điều khiển thiết bị...)
// Áp dụng cho cả web (Authorization header) và CLI terminal (Phần 1, Phần 2)
// ============================================
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập (thiếu token)' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // { id, username, role }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
}

module.exports = { verifyToken };
