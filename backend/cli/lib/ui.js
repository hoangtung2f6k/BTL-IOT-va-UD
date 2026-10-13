// ============================================
// Tien ich hien thi dung chung - CHE DO RAW.
// Khong mau ANSI, khong khung, khong emoji: chi in text tho de dua vao bao cao.
// Van giu nguyen ten ham export de cac file khac khong phai sua.
// ============================================

// Bat code page UTF-8 de tieng Viet khong loi font tren CMD/PowerShell
try {
    if (process.platform === 'win32') {
        require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
    }
} catch (_) { /* khong co console that thi bo qua */ }

// Moi ma mau deu tra ve chuoi rong => cac loi goi color(text, c.red) van chay, nhung in ra text tho
const c = new Proxy({}, { get: () => '' });

function color(text) {
    return String(text);
}

// Gio dang HH:MM:SS.mmm (co mili giay de doi chieu do tre giua cac terminal)
function ts() {
    const d = new Date();
    const p = (n, w) => String(n).padStart(w, '0');
    return p(d.getHours(), 2) + ':' + p(d.getMinutes(), 2) + ':' + p(d.getSeconds(), 2) + '.' + p(d.getMilliseconds(), 3);
}

function stamp() {
    return '[' + ts() + ']';
}

// Ngay gio day du: YYYY-MM-DD HH:MM:SS (dung dinh dang nhu cot recorded_at trong CSDL)
function datetime() {
    const d = new Date();
    const p = (n, w) => String(n).padStart(w, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1, 2) + '-' + p(d.getDate(), 2) + ' ' +
        p(d.getHours(), 2) + ':' + p(d.getMinutes(), 2) + ':' + p(d.getSeconds(), 2);
}

function banner(title, subtitle) {
    console.log(title);
    if (subtitle) console.log(subtitle);
}

function hr() {
    console.log('-'.repeat(70));
}

// Che mat khau trong URL broker khi in ra man hinh
function maskBroker(url) {
    if (!url || url.indexOf('@') === -1) return url;
    return url.split('//')[0] + '//***@' + url.split('@')[1];
}

module.exports = { c, color, ts, stamp, datetime, banner, hr, maskBroker };
