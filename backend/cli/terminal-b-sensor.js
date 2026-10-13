// ============================================
// TERMINAL B - NHAN DU LIEU CAM BIEN  (output dang RAW)
//
// Subscribe topic iot/room/1/sensor/data, in nguyen van payload nhan duoc.
//   PHAN 1: du lieu gia do Terminal A gui -> co truong auth, kiem tra token.
//   PHAN 2: du lieu that do ESP8266 gui   -> khong co truong auth.
//
// Chay:  npm run terminal-b
// ============================================
const { requireLogin, checkAuthPayload } = require('./lib/session');
const { createLineReader } = require('./lib/lineReader');
const { connect, TOPICS } = require('./lib/mqttClient');
const { stamp, datetime, hr } = require('./lib/ui');

(async () => {
    const reader = createLineReader();
    await requireLogin(reader, { title: 'TERMINAL B - NHAN DU LIEU CAM BIEN' });
    reader.close(); // terminal nay chi lang nghe

    const client = connect('terminal-b');
    client.on('connect', () => {
        client.subscribe(TOPICS.SENSOR, (err) => {
            console.log(err ? 'SUBSCRIBE FAILED ' + TOPICS.SENSOR : 'SUBSCRIBED ' + TOPICS.SENSOR);
            hr();
        });
    });

    client.on('message', (topic, buf) => {
        if (topic !== TOPICS.SENSOR) return;
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

        const check = data.auth ? checkAuthPayload(data.auth) : null;
        const authInfo = check
            ? (check.valid ? 'AUTH=OK user=' + check.username : 'AUTH=INVALID user=' + check.username + ' (' + check.reason + ')')
            : 'AUTH=NONE source=ESP8266(phan cung)';

        console.log('time=' + datetime() +
            ' temperature=' + data.temperature +
            ' humidity=' + data.humidity +
            ' lightRaw=' + data.lightRaw +
            ' | ' + authInfo);
    });
})();
