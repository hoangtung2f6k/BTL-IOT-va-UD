// ============================================
// Dang nhap truc tiep tren terminal (bat buoc truoc khi duoc publish/subscribe MQTT).
// Goi dung API /api/auth/login ma web dang dung (backend/routes/authRoutes.js)
// => Terminal CLI dung chung mot he thong tai khoan / JWT voi web AURA HOME.
// ============================================
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const API_URL = process.env.API_URL || 'http://localhost:' + (process.env.PORT || 3000) + '/api';
const JWT_SECRET = process.env.JWT_SECRET || 'aura_home_secret_key_123';

async function login(username, password) {
    const res = await fetch(API_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(data.message || 'Dang nhap that bai (HTTP ' + res.status + ')');
    }
    return data; // { success, token, user }
}

// Terminal NHAN dung ham nay de kiem tra "thong tin dang nhap" kem trong payload MQTT.
function checkAuthPayload(auth) {
    if (!auth || !auth.token) {
        return { valid: false, username: null, reason: 'khong kem thong tin dang nhap' };
    }
    try {
        const payload = jwt.verify(auth.token, JWT_SECRET);
        return { valid: true, username: payload.username, role: payload.role };
    } catch (err) {
        return { valid: false, username: auth.username || null, reason: 'token khong hop le / het han' };
    }
}

// Hoi tai khoan/mat khau ngay tren terminal, thu lai toi da 3 lan.
async function requireLogin(reader, opts) {
    opts = opts || {};
    if (opts.title) {
        console.log(opts.title);
        console.log('API: ' + API_URL);
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
        const username = await reader.ask('username: ');
        if (username === null) process.exit(1);
        const password = await reader.ask('password: ');
        if (password === null) process.exit(1);

        try {
            const { token, user } = await login(username, password);
            console.log('LOGIN OK user=' + user.username + ' role=' + user.role + ' id=' + user.id);
            console.log('TOKEN ' + token);
            return { token, user };
        } catch (err) {
            console.log('LOGIN FAILED (' + attempt + '/3): ' + err.message);
        }
    }
    console.log('Dang nhap that bai qua so lan cho phep. Thoat.');
    process.exit(1);
}

module.exports = { login, requireLogin, checkAuthPayload, API_URL };
