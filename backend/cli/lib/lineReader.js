// ============================================
// Đọc dòng từ terminal một cách an toàn.
// Gom dòng vào hàng đợi nên không bao giờ "mất" dòng khi người dùng gõ nhanh
// (readline + async/await có thể làm rơi dòng nếu input đến trước khi kịp hỏi).
// ============================================
const readline = require('readline');

function createLineReader() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const pending = [];   // dòng đã nhận nhưng chưa ai lấy
    const waiters = [];   // hàm resolve đang chờ dòng mới
    let closed = false;

    rl.on('line', (line) => {
        const text = line.trim();
        const waiter = waiters.shift();
        if (waiter) waiter(text);
        else pending.push(text);
    });

    rl.on('close', () => {
        closed = true;
        while (waiters.length) waiters.shift()(null);
    });

    return {
        // Trả về Promise<string|null>, null nghĩa là stdin đã đóng
        ask(prompt) {
            if (prompt) process.stdout.write(prompt);
            if (pending.length) return Promise.resolve(pending.shift());
            if (closed) return Promise.resolve(null);
            return new Promise((resolve) => waiters.push(resolve));
        },
        close() {
            if (!closed) rl.close();
        }
    };
}

module.exports = { createLineReader };
