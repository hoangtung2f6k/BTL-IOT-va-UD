const mqtt = require('mqtt');
require('dotenv').config();

const client = mqtt.connect(process.env.MQTT_BROKER);

client.on('connect', () => {
    console.log('✅ Connected to MQTT Broker');
    // Subscribe to sensor data and device response topics
    client.subscribe(process.env.MQTT_TOPIC_SENSOR, (err) => {
        if (!err) console.log(`📡 Subscribed to: ${process.env.MQTT_TOPIC_SENSOR}`);
    });
    client.subscribe(process.env.MQTT_TOPIC_DEVICE_RESPONSE, (err) => {
        if (!err) console.log(`📡 Subscribed to: ${process.env.MQTT_TOPIC_DEVICE_RESPONSE}`);
    });
    // Nghe cả topic lệnh để ghi lại lệnh phát đi từ Terminal CLI (source = 'cli') vào DB
    client.subscribe(process.env.MQTT_TOPIC_DEVICE_CONTROL, (err) => {
        if (!err) console.log(`📡 Subscribed to: ${process.env.MQTT_TOPIC_DEVICE_CONTROL}`);
    });
});

client.on('error', (err) => {
    console.error('❌ MQTT Connection Error:', err.message);
});

module.exports = client;
