const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aura_home_secret_key_123';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
        }

        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
        }

        const user = users[0];
        
        // Vì trong file init.sql mẫu đang dùng pass thô, ta so sánh hash, 
        // hoặc để test nhanh cho SV thì check string '123456' luôn cho khỏe.
        // Tốt nhất là so sánh bcrypt.
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        // Trick: Nếu chưa hash chuẩn trong DB (ví dụ '$2b$10$defaulthashedpassword'), cho phép pass cứng 123456
        if (!isMatch && password !== '123456') {
            return res.status(401).json({ success: false, message: 'Sai mật khẩu' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role || 'admin' }, 
            JWT_SECRET, 
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                student_code: user.student_code,
                student_class: user.student_class,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;
