// ============================================
// TERMINAL A - GUI DU LIEU
//
// Dung dung bo co cua cong cu chuan mosquitto_pub / mosquitto_sub:
//   -h <host>   dia chi broker   (mac dinh lay tu .env)
//   -p <port>   cong broker      (mac dinh lay tu .env)
//   -u <user>   ten dang nhap
//   -P <pass>   mat khau
//   -t <topic>  topic
//   -m <payload> noi dung (JSON)
//   -q <0|1|2>  QoS, mac dinh 1
//
// -u / -P duoc dung cho CA HAI viec:
//   1) lam username/password ket noi toi broker (dung nhu mosquitto_pub that)
//   2) xac thuc that voi POST /api/auth/login (bcrypt + JWT) - sai thi khong gui
//      duoc, dung thi JWT duoc dinh kem payload de ben nhan verify chu ky.
//
// Chay:  npm run terminal-a
// ============================================
const crypto = require('crypto');
const mqtt = require('mqtt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { login } = require('./lib/session');
const { createLineReader } = require('./lib/lineReader');
const { TOPICS } = require('./lib/mqttClient');
const { stamp } = require('./lib/ui');

// Broker mac dinh doc tu .env, co the ghi de bang -h / -p
const DEFAULT = (() => {
    try {
        const u = new URL(process.env.MQTT_BROKER);
        return { host: u.hostname, port: u.port || '1883', user: u.username || null, pass: u.password || null };
    } catch (_) {
        return { host: 'localhost', port: '1883', user: null, pass: null };
    }
})();

const TOPIC_ALIAS = {
    control: TOPICS.CONTROL,
    sensor: TOPICS.SENSOR,
    response: TOPICS.RESPONSE
};

function usage() {
    console.log('mosquitto_pub [-h host] [-p port] -u <user> -P <pass> -t <topic> -m <json> [-q 0|1|2]');
    console.log('mosquitto_sub [-h host] [-p port] -u <user> -P <pass> -t <topic>');
    console.log('unsub -t <topic> | help | exit');
    console.log('Topic viet tat: control | sensor | response');
}

function tokenize(line) {
    const out = [];
    let cur = '', quote = null, has = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '\\' && i + 1 < line.length && (line[i + 1] === '"' || line[i + 1] === "'")) {
            cur += line[++i]; has = true;
        } else if (quote) {
            if (ch === quote) quote = null; else { cur += ch; has = true; }
        } else if (ch === '"' || ch === "'") {
            quote = ch; has = true;
        } else if (ch === ' ' || ch === '\t') {
            if (has) { out.push(cur); cur = ''; has = false; }
        } else {
            cur += ch; has = true;
        }
    }
    if (has) out.push(cur);
    return out;
}

// -m phai lay NGUYEN VAN phan con lai, khong tach token, neu khong dau nhay
// ben trong JSON se bi mat.
function parseCommand(line) {
    const f = {};
    let head = line;

    const mAt = line.search(/(^|\s)-m(\s|$)/);
    if (mAt !== -1) {
        head = line.slice(0, mAt);
        let msg = line.slice(mAt).replace(/(^|\s)-m\s*/, '').trim();
        const qAt = msg.search(/\s-q\s+\d+\s*$/);
        if (qAt !== -1) {
            f.qos = parseInt(msg.slice(qAt).trim().split(/\s+/)[1], 10);
            msg = msg.slice(0, qAt).trim();
        }
        if (msg.length > 1 && ((msg[0] === '"' && msg.endsWith('"')) || (msg[0] === "'" && msg.endsWith("'")))) {
            msg = msg.slice(1, -1);
        }
        f.message = msg;
    }

    const arg = tokenize(head);
    for (let i = 0; i < arg.length; i++) {
        const a = arg[i];
        if (a === '-h') f.host = arg[++i];
        else if (a === '-p') f.port = arg[++i];       // PORT, dung chuan mosquitto
        else if (a === '-u') f.user = arg[++i];
        else if (a === '-P') f.pass = arg[++i];       // PASSWORD
        else if (a === '-t') f.topic = arg[++i];
        else if (a === '-q') f.qos = parseInt(arg[++i], 10);
    }
    return f;
}

function resolveTopic(t) {
    if (!t) return null;
    return TOPIC_ALIAS[t.toLowerCase()] || t;
}

(async () => {
    const reader = createLineReader();
    const clients = new Map();   // "url|user" -> mqtt client
    const authCache = new Map(); // "user:pass" -> { token, user }

    console.log('broker mac dinh: ' + DEFAULT.host + ':' + DEFAULT.port);

    // Ket noi toi broker theo -h / -p, dung -u / -P lam credentials cua broker
    function getClient(host, port, user, pass) {
        const url = 'mqtt://' + host + ':' + port;
        const key = url + '|' + (user || '');
        if (clients.has(key)) return Promise.resolve(clients.get(key));

        return new Promise((resolve) => {
            const c = mqtt.connect(url, {
                clientId: 'cli_terminal-a_' + Math.random().toString(16).slice(2, 8),
                username: user || undefined,
                password: pass || undefined,
                connectTimeout: 8000,
                reconnectPeriod: 0        // khong tu dong thu lai, de bao loi ngay
            });
            let done = false;
            c.on('connect', () => {
                if (done) return;
                done = true;
                console.log('CONNECTED ' + url + (user ? ' (user=' + user + ')' : ' (an danh)'));
                clients.set(key, c);
                c.on('message', (topic, buf) => {
                    console.log(stamp() + ' RECV topic=' + topic + ' bytes=' + buf.length);
                    console.log(buf.toString());
                });
                resolve(c);
            });
            c.on('error', (err) => {
                if (done) return;
                done = true;
                console.log('Connection Refused: ' + err.message + '  (' + url + ')');
                c.end(true);
                resolve(null);
            });
        });
    }

    // Xac thuc -u / -P voi API dang nhap cua he thong
    async function appLogin(user, pass) {
        const key = user + ':' + pass;
        if (authCache.has(key)) return authCache.get(key);
        try {
            const { token, user: info } = await login(user, pass);
            console.log('AUTH OK user=' + info.username + ' role=' + info.role + ' id=' + info.id);
            const sess = { token, user: info };
            authCache.set(key, sess);
            return sess;
        } catch (err) {
            console.log('Connection Refused: not authorised (' + err.message + ')');
            return null;
        }
    }

    while (true) {
        const line = await reader.ask('> ');
        if (line === null) break;
        if (line.length === 0) continue;

        const arg = tokenize(line);
        const cmd = arg[0].toLowerCase();

        if (cmd === 'exit' || cmd === 'quit') break;
        if (cmd === 'help') { usage(); continue; }

        const f = parseCommand(line.slice(cmd.length));
        const topic = resolveTopic(f.topic);

        if (cmd === 'unsub' || cmd === 'mosquitto_unsub') {
            if (!topic) { console.log('Error: thieu -t <topic>'); continue; }
            for (const c of clients.values()) c.unsubscribe(topic);
            console.log('UNSUBSCRIBED ' + topic);
            continue;
        }

        if (cmd !== 'mosquitto_pub' && cmd !== 'mosquitto_sub') {
            console.log('Error: lenh khong hop le. Go "help" de xem cu phap.');
            continue;
        }
        if (!topic) { console.log('Error: thieu -t <topic>'); continue; }
        if (!f.user || !f.pass) {
            console.log('Connection Refused: not authorised (thieu -u hoac -P)');
            continue;
        }

        // Lop 1: xac thuc tai khoan ung dung (bcrypt + JWT)
        const sess = await appLogin(f.user, f.pass);
        if (!sess) continue;

        // Lop 2: ket noi broker, chinh -u/-P nay lam credentials MQTT
        const host = f.host || DEFAULT.host;
        const port = f.port || DEFAULT.port;
        const client = await getClient(host, port, f.user, f.pass);
        if (!client) continue;

        if (cmd === 'mosquitto_sub') {
            client.subscribe(topic, (err) => {
                console.log(err ? 'SUBSCRIBE FAILED ' + topic : 'SUBSCRIBED ' + topic);
            });
            continue;
        }

        if (!f.message) { console.log('Error: thieu -m <payload>'); continue; }

        let payload;
        try {
            payload = JSON.parse(f.message);
        } catch (_) {
            console.log('Error: -m phai la JSON hop le. Vi du: -m {"device":"den","action":"ON"}');
            continue;
        }

        if (payload.device && payload.action && !payload.requestId) {
            payload.requestId = crypto.randomUUID().slice(0, 8);
        }
        if (!payload.source) payload.source = 'cli';
        payload.auth = { username: sess.user.username, token: sess.token };

        const raw = JSON.stringify(payload);
        const qos = Number.isInteger(f.qos) ? f.qos : 1;
        await new Promise((resolve) => {
            client.publish(topic, raw, { qos }, (err) => {
                if (err) console.log(stamp() + ' PUBLISH FAILED topic=' + topic + ' error=' + err.message);
                else {
                    console.log(stamp() + ' PUBLISH topic=' + topic + ' qos=' + qos + ' bytes=' + Buffer.byteLength(raw));
                    console.log(raw);
                }
                resolve();
            });
        });
    }

    reader.close();
    for (const c of clients.values()) c.end(true);
    process.exit(0);
})();
