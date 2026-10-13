CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

-- Bảng 1: users - Quản lý người dùng
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    student_code VARCHAR(20),
    student_class VARCHAR(50),
    email VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng 2: sensors - Định nghĩa các cảm biến logic
CREATE TABLE IF NOT EXISTS sensors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT DEFAULT 1,
    type ENUM('temperature', 'humidity', 'light') NOT NULL,
    unit VARCHAR(10),
    description VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng 3: sensor_data - Dữ liệu đo từ cảm biến
CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_id INT NOT NULL,
    value FLOAT NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);

-- Bảng 4: devices - Định nghĩa thiết bị điều khiển
CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT DEFAULT 1,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    current_state ENUM('ON', 'OFF') DEFAULT 'OFF',
    is_online BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng 5: actions - Lịch sử thao tác điều khiển
CREATE TABLE IF NOT EXISTS actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    device_id INT NOT NULL,
    request_id VARCHAR(50),
    action ENUM('ON', 'OFF') NOT NULL,
    status ENUM('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT') DEFAULT 'PENDING',
    error_message VARCHAR(255),
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- ============ DỮ LIỆU MẪU BAN ĐẦU ============

-- Tạo tài khoản mặc định (password: 123456)
INSERT INTO users (username, password_hash, full_name, student_code, student_class, email, role) VALUES
('admin', '$2b$10$defaulthashedpassword', 'Nghiêm Xuân Hoàng Tùng', 'B23DCAT326', 'D23CQAT01-B', 'admin@ptit.edu.vn', 'admin');

-- Tạo 3 cảm biến logic cho Room 1
INSERT INTO sensors (room_id, type, unit, description) VALUES
(1, 'temperature', '°C', 'Cảm biến nhiệt độ DHT11'),
(1, 'humidity', '%', 'Cảm biến độ ẩm DHT11'),
(1, 'light', 'lux', 'Cảm biến ánh sáng LDR');

-- Tạo 3 thiết bị cho Room 1
INSERT INTO devices (room_id, name, type, current_state, is_online) VALUES
(1, 'den', 'LED', 'OFF', FALSE),
(1, 'quat', 'LED', 'OFF', FALSE),
(1, 'dieuhoa', 'LED', 'OFF', FALSE);
