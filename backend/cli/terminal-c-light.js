// ============================================
// TERMINAL C - NHAN LENH BAT/TAT DEN  (output dang RAW)
//
// Subscribe 2 topic:
//   iot/room/1/device/control  -> LENH ma Terminal A (hoac web) gui di
//   iot/room/1/device/response -> PHAN HOI that tu ESP8266 (chi co o Phan 2)
// Khop lenh va phan hoi theo requestId de do do tre thuc te.
//
// Chay:  npm run terminal-c
// ============================================
const { requireLogin, checkAuthPayload } = require('./lib/session');
const { createLineReader } = require('./lib/lineReader');
const { connect, TOPICS } = require('./lib/mqttClient');
const { stamp, hr } = require('./lib/ui');

const pending = new Map(); // requestId -> { device, action, sentAt }

(async () => {
    const reader = createLineReader();
    await requireLogin(reader, { title: 'TERMINAL C - NHAN LENH BAT/TAT DEN' });
    reader.close(); // terminal nay chi lang nghe

    const client = connect('terminal-c');
    client.on('connect', () => {
        let done = 0;
        [TOPICS.CONTROL, TOPICS.RESPONSE].forEach((topic) => {
            client.subscribe(topic, (err) => {
                console.log(err ? 'SUBSCRIBE FAILED ' + topic : 'SUBSCRIBED ' + topic);
                if (++done === 2) hr();
            });
        });
    });

    client.on('message', (topic, buf) => {
        const raw = buf.toString();
        console.log(stamp() + ' RECV topic=' + topic + ' bytes=' + buf.length);
        console.log(raw);

        let data;
        try {
            data = JSON.parse(raw);
        } catch (_) {
            console.log('PARSE ERROR: payload khong phai JSON');
            return;
        }

        if (topic === TOPICS.CONTROL) {
            const check = data.auth ? checkAuthPayload(data.auth) : null;
            const authInfo = check
                ? (check.valid ? 'AUTH=OK user=' + check.username : 'AUTH=INVALID user=' + check.username + ' (' + check.reason + ')')
                : 'AUTH=NONE source=web/backend';

            if (data.requestId) {
                pending.set(data.requestId, { device: data.device, action: data.action, sentAt: Date.now() });
            }
            console.log(authInfo + ' | CMD device=' + data.device + ' action=' + data.action + ' requestId=' + (data.requestId || '-'));

        } else if (topic === TOPICS.RESPONSE) {
            let extra = '';
            if (data.requestId && pending.has(data.requestId)) {
                const req = pending.get(data.requestId);
                pending.delete(data.requestId);
                extra = ' match=' + req.device + '/' + req.action + ' latency=' + (Date.now() - req.sentAt) + 'ms';
            } else if (data.source === 'AUTO') {
                extra = ' source=AUTO (ESP tu doi trang thai theo cam bien)';
            }
            console.log('RESP status=' + data.status + ' device=' + data.device +
                ' state=' + (data.state || data.action) + ' requestId=' + (data.requestId || '-') + extra);
        }
    });
})();
