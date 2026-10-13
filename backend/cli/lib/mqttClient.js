// ============================================
// Tao ket noi MQTT cho cac terminal CLI, dung chung cau hinh .env voi backend
// (cung broker + cung topic => dung yeu cau "cac terminal giao tiep qua topic")
// ============================================
const mqtt = require('mqtt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const { maskBroker } = require('./ui');

const TOPICS = {
    SENSOR: process.env.MQTT_TOPIC_SENSOR,
    CONTROL: process.env.MQTT_TOPIC_DEVICE_CONTROL,
    RESPONSE: process.env.MQTT_TOPIC_DEVICE_RESPONSE
};

function connect(clientIdSuffix) {
    const clientId = 'cli_' + clientIdSuffix + '_' + Math.random().toString(16).slice(2, 8);
    const client = mqtt.connect(process.env.MQTT_BROKER, { clientId });

    client.on('connect', () => {
        console.log('MQTT CONNECTED broker=' + maskBroker(process.env.MQTT_BROKER) + ' clientId=' + clientId);
    });
    client.on('error', (err) => {
        console.log('MQTT ERROR ' + err.message);
    });
    client.on('reconnect', () => {
        console.log('MQTT RECONNECTING...');
    });

    return client;
}

module.exports = { connect, TOPICS };
