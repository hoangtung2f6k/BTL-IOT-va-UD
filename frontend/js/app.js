const API_URL = 'http://localhost:3000/api';

// ============================================
// XÁC THỰC
// ============================================
if (!localStorage.getItem('token')) {
    window.location.href = 'login.html';
}

function getToken() {
    return localStorage.getItem('token');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Mọi lời gọi API đều đi qua đây: tự gắn JWT và tự xử lý khi hết hạn
async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        alert('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
        logout();
        throw new Error('Unauthorized');
    }
    return res;
}

// ============================================
// THÔNG TIN NGƯỜI DÙNG
// ============================================
function renderUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.username) return;

    const displayName = user.full_name || user.username;
    const roleText = user.role === 'admin' ? 'Quản trị viên' : 'Người dùng';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

    document.getElementById('profile-name').textContent = displayName;
    document.getElementById('profile-code').textContent = user.student_code || 'Chưa cập nhật';
    document.getElementById('profile-class').textContent = user.student_class || 'Chưa cập nhật';
    document.getElementById('profile-email').textContent = user.email || 'Chưa cập nhật';
    document.getElementById('profile-role').textContent = roleText;
    document.getElementById('profile-avatar').src = avatar + '&size=128';

    document.querySelector('.user-info h4').textContent = displayName;
    document.querySelector('.user-info p').textContent = roleText;
    document.querySelector('.user-profile img').src = avatar;
}

// ============================================
// ĐIỀU HƯỚNG
// ============================================
function showPage(pageId, el) {
    document.querySelectorAll('.page').forEach(page => page.style.display = 'none');
    document.getElementById(pageId).style.display = 'block';

    if (el) {
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        el.classList.add('active');
    }

    if (pageId === 'data-sensor') loadSensorData();
    if (pageId === 'action-history') loadActionData();
}

// ============================================
// TIỆN ÍCH ĐỊNH DẠNG
// ============================================
// Cột value trong CSDL là FLOAT nên hay ra 26.600000381469727 -> phải làm tròn
function num(v, digits = 1) {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    return Number.isNaN(n) ? '-' : n.toFixed(digits);
}

function formatTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
}

// ============================================
// BIỂU ĐỒ
// ============================================
let sensorChart;
const chartLabels = [];
const tempData = [];
const humidData = [];
const lightData = [];
const MAX_CHART_POINTS = 30;

function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    const line = (label, data, color) => ({
        label,
        data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ',0.08)'),
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 0,        // bỏ chấm tròn -> đường liền mượt, đỡ rối
        pointHoverRadius: 4
    });

    sensorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                line('Nhiệt độ (°C)', tempData, 'rgb(244,63,94)'),
                line('Độ ẩm (%)', humidData, 'rgb(14,165,233)'),
                line('Ánh sáng (lux)', lightData, 'rgb(234,179,8)')
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Điểm mới trượt dần sang trái trong 900ms thay vì nhảy cóc mỗi lần cập nhật
            animation: { duration: 900, easing: 'linear' },
            animations: {
                x: { duration: 900, easing: 'linear' },
                y: { duration: 900, easing: 'easeOutQuart' }
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: {
                    ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                    grid: { display: false }
                }
            },
            // Dùng chú thích riêng bằng icon ở chart-header, tắt legend mặc định
            plugins: { legend: { display: false } }
        }
    });
}

// Bấm vào chú thích để ẩn/hiện từng đường
function toggleSeries(index, el) {
    const visible = sensorChart.isDatasetVisible(index);
    sensorChart.setDatasetVisibility(index, !visible);
    el.classList.toggle('hidden', visible);
    sensorChart.update();
}

function pushPoint(row) {
    const time = new Date(row.created_at).toLocaleTimeString('vi-VN');
    // Bỏ qua nếu trùng mốc thời gian với điểm cuối
    if (chartLabels.length > 0 && chartLabels[chartLabels.length - 1] === time) return;

    chartLabels.push(time);
    tempData.push(Number(row.temperature));
    humidData.push(Number(row.humidity));
    lightData.push(Number(row.light));

    while (chartLabels.length > MAX_CHART_POINTS) {
        chartLabels.shift();
        tempData.shift();
        humidData.shift();
        lightData.shift();
    }
}

// Nạp sẵn lịch sử để biểu đồ có dữ liệu ngay khi mở trang,
// thay vì phải chờ hơn 2 phút cho đủ điểm.
async function loadChartHistory() {
    try {
        const res = await apiFetch('/sensors/trends');
        const rows = await res.json();
        if (!Array.isArray(rows)) return;

        chartLabels.length = 0;
        tempData.length = 0;
        humidData.length = 0;
        lightData.length = 0;
        rows.forEach(pushPoint);
        sensorChart.update();
    } catch (err) {
        console.error('Không tải được lịch sử biểu đồ:', err);
    }
}

// ============================================
// CẢM BIẾN - SỐ LIỆU MỚI NHẤT
// ============================================
async function fetchLatestSensor() {
    try {
        const res = await apiFetch('/sensors/latest');
        const data = await res.json();
        if (!data) return;

        document.getElementById('temp-value').innerHTML = num(data.temperature) + '<span class="unit">°C</span>';
        document.getElementById('humid-value').innerHTML = num(data.humidity) + '<span class="unit">%</span>';
        document.getElementById('light-value').innerHTML = num(data.light, 0) + '<span class="unit"> lux</span>';

        pushPoint(data);
        sensorChart.update();
    } catch (err) {
        console.error('Không lấy được dữ liệu cảm biến:', err);
    }
}

// ============================================
// ĐIỀU KHIỂN THIẾT BỊ
// ============================================
let togglePending = 0; // đang có lệnh chờ -> tạm dừng đồng bộ trạng thái

function paintDeviceIcon(switchEl, isOn) {
    const item = switchEl.closest('.device-item');
    if (!item) return;

    const icon = item.querySelector('.device-icon');
    if (icon) {
        icon.style.opacity = isOn ? '1' : '0.5';
        icon.style.boxShadow = isOn ? '0 0 15px rgba(255,255,255,0.2)' : 'none';
    }

    // Dòng chữ trạng thái dưới tên thiết bị: nhìn công tắc đôi khi khó đoán,
    // nhất là lúc chụp ảnh màn hình đưa vào báo cáo.
    const label = item.querySelector('.device-info p');
    if (label) {
        label.textContent = isOn ? 'Đang bật' : 'Đang tắt';
        label.style.color = isOn ? '#10b981' : '#94a3b8';
    }
}

// Chờ lâu hơn mốc timeout 5 giây của server một chút, để kết quả TIMEOUT
// kịp ghi vào CSDL rồi mới kết luận.
const CONTROL_WAIT_MS = 9000;
const CONTROL_POLL_MS = 500;

// ============================================
// THÔNG BÁO NGẮN (thay cho alert)
//
// alert() chặn luồng vẽ của trình duyệt: lệnh gán công tắc về trạng thái cũ
// chạy xong rồi nhưng màn hình chưa kịp vẽ lại, nên hộp thoại hiện lên trong
// khi công tắc trông vẫn đang ở trạng thái mới -> tưởng là chưa trả về.
// Toast chỉ thêm một thẻ div nên không chặn gì cả.
// ============================================
function showToast(message, type = 'error') {
    let box = document.getElementById('toast-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.className = 'toast-box';
        document.body.appendChild(box);
    }

    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.innerHTML = `<i class="fas ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span></span>`;
    // textContent chứ không phải innerHTML: nội dung có thể là error_message từ CSDL
    item.querySelector('span').textContent = message;
    box.appendChild(item);

    setTimeout(() => item.classList.add('toast-out'), 4000);
    setTimeout(() => item.remove(), 4500);
}

// Hỏi server xem lệnh đã ngã ngũ chưa. Trả về bản ghi action khi có kết quả,
// hoặc null nếu hết giờ chờ mà vẫn PENDING (coi như không thành công).
async function waitForAction(requestId) {
    const deadline = Date.now() + CONTROL_WAIT_MS;

    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, CONTROL_POLL_MS));
        try {
            const res = await apiFetch(`/devices/action/${requestId}`);
            if (!res.ok) continue;
            const row = await res.json();
            if (row.status && row.status !== 'PENDING') return row;
        } catch (err) {
            if (err.message === 'Unauthorized') throw err;
            // Lỗi mạng tạm thời -> thử lại ở vòng sau, đừng kết luận vội
        }
    }
    return null;
}

async function toggleDevice(device, isOn) {
    const switchEl = document.getElementById(`switch-${device}`);
    const loadingIcon = document.getElementById(`loading-${device}`);
    const previous = !isOn; // trạng thái ngay trước khi bấm, để quay về khi lệnh hỏng
    const label = DEVICE_LABELS[device] || device;
    togglePending++;

    const revert = (message) => {
        switchEl.checked = previous;
        paintDeviceIcon(switchEl, previous);
        if (message) showToast(message);
    };

    try {
        switchEl.disabled = true;
        loadingIcon.style.display = 'inline-block';

        const res = await apiFetch('/devices/control', {
            method: 'POST',
            body: JSON.stringify({ device, action: isOn ? 'ON' : 'OFF' })
        });
        const result = await res.json();

        if (!res.ok || !result.success) {
            // 503 = server biết chắc mạch đang offline, khỏi phải chờ 9 giây
            const reason = res.status === 503
                ? 'mạch chưa kết nối'
                : (result.message || 'không gửi được lệnh');
            revert(`Không ${isOn ? 'bật' : 'tắt'} được ${label}: ${reason}`);
            return;
        }

        // Thiết bị đã đúng trạng thái sẵn -> server không gửi lệnh nào, khỏi chờ
        if (!result.requestId) {
            paintDeviceIcon(switchEl, isOn);
            return;
        }

        // Lệnh mới chỉ được publish lên MQTT, chưa chắc tới được mạch.
        // Giữ spinner và chờ mạch xác nhận rồi mới chốt trạng thái công tắc.
        const outcome = await waitForAction(result.requestId);

        if (outcome && outcome.status === 'SUCCESS') {
            paintDeviceIcon(switchEl, isOn);
            return;
        }

        const why = outcome && outcome.status === 'FAILED'
            ? (outcome.error_message || 'mạch báo lỗi')
            : 'mạch không phản hồi';
        revert(`Không ${isOn ? 'bật' : 'tắt'} được ${label}: ${why}`);
    } catch (err) {
        if (err.message !== 'Unauthorized') {
            console.error('Lỗi điều khiển thiết bị:', err);
            revert('Mất kết nối đến server');
        }
    } finally {
        switchEl.disabled = false;
        loadingIcon.style.display = 'none';
        togglePending--;
    }
}

// Đồng bộ trạng thái công tắc với CSDL: cần thiết vì mạch có thể tự đổi
// trạng thái ở chế độ AUTO, hoặc người khác điều khiển từ terminal.
async function loadDeviceStatus() {
    if (togglePending > 0) return;
    try {
        const res = await apiFetch('/devices/status');
        const devices = await res.json();
        if (!Array.isArray(devices)) return;

        devices.forEach(device => {
            const switchEl = document.getElementById(`switch-${device.name}`);
            if (!switchEl) return;
            const isOn = device.current_state === 'ON';
            switchEl.checked = isOn;
            paintDeviceIcon(switchEl, isOn);
        });
    } catch (err) {
        console.error('Không lấy được trạng thái thiết bị:', err);
    }
}

// ============================================
// BỘ LỌC DÙNG CHUNG CHO HAI BẢNG
// ============================================
// Ô thời gian nhập tay dạng chuỗi "1/1/2025", có thể kèm giờ "1/1/2025 14:30".
// Gõ tới đâu lọc tới đó: giờ, phút, giây đều không bắt buộc.
// Hợp lệ: 1/1/2025 · 1/1/2025 15 · 1/1/2025 15:30 · 1/1/2025 15:30:45
const DATE_FILTER_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/;

// Kiểm tra y hệt backend/utils/dateFilter.js: đúng hình dạng, các số trong
// phạm vi, và ngày phải có thật. Nếu chỉ khớp hình dạng thì "1/1/2025 25" hay
// "31/2/2025" sẽ lọt qua rồi bị server bỏ qua lặng lẽ — người dùng tưởng
// bộ lọc hỏng mà không biết mình gõ sai.
function isValidTimeInput(text) {
    const m = text.match(DATE_FILTER_RE);
    if (!m) return false;

    const [, d, mo, y, h, mi, s] = m;
    const day = Number(d), month = Number(mo), year = Number(y);

    if (month < 1 || month > 12 || day < 1) return false;
    if (h !== undefined && Number(h) > 23) return false;
    if (mi !== undefined && Number(mi) > 59) return false;
    if (s !== undefined && Number(s) > 59) return false;

    // Date tự "tràn" 31/02 thành 03/03 nên phải so lại sau khi dựng
    const probe = new Date(year, month - 1, day);
    return probe.getMonth() === month - 1 && probe.getDate() === day;
}

// Chuỗi chỉ có giờ, không kèm ngày: "15", "15:30", "15:30:45"
const TIME_OF_DAY_RE = /^(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?$/;

function isValidTimeOfDay(text) {
    const m = text.match(TIME_OF_DAY_RE);
    if (!m) return false;
    if (Number(m[1]) > 23) return false;
    if (m[2] !== undefined && Number(m[2]) > 59) return false;
    if (m[3] !== undefined && Number(m[3]) > 59) return false;
    return true;
}

// Một ô nhập duy nhất, phục vụ hai kiểu lọc khác hẳn nhau:
//
//   CÓ NGÀY -> khoảng thời gian tuyệt đối (from/to)
//     "1/1/2025"              trọn ngày đó
//     "1/1/2025 15"           trọn giờ 15h hôm đó
//     "1/1/2025 - 31/12/2025" khoảng giữa hai mốc
//
//   CHỈ GIỜ -> khung giờ lặp lại mọi ngày (timeFrom/timeTo)
//     "15"       15:00:00..15:59:59 của MỌI ngày
//     "15:30"    đúng phút 15:30 của mọi ngày
//     "8 - 11"   khung 8h tới 11h59 của mọi ngày
//
// Tách khoảng bằng dấu "-" không sợ nhầm vì ngày luôn dùng dấu "/".
// Hai vế phải cùng kiểu; gõ sai thì tô viền đỏ và không gửi gì lên server.
function readTimeFilter(inputId) {
    const el = document.getElementById(inputId);
    const text = el.value.trim();
    const rong = { from: '', to: '', timeFrom: '', timeTo: '' };

    if (!text) {
        el.classList.remove('invalid');
        return rong;
    }

    const parts = text.split('-').map(p => p.trim()).filter(Boolean);
    if (parts.length < 1 || parts.length > 2) {
        el.classList.add('invalid');
        return rong;
    }

    // Một mốc duy nhất -> dùng làm cả cận dưới lẫn cận trên; phía server tự nới
    // cận trên tới cuối khoảng (23:59:59 cho ngày, 15:59:59 cho giờ).
    const dau = parts[0];
    const cuoi = parts[1] || parts[0];

    if (parts.every(isValidTimeInput)) {
        el.classList.remove('invalid');
        return { ...rong, from: dau, to: cuoi };
    }
    if (parts.every(isValidTimeOfDay)) {
        el.classList.remove('invalid');
        return { ...rong, timeFrom: dau, timeTo: cuoi };
    }

    el.classList.add('invalid');
    return rong;
}

function val(id) {
    return document.getElementById(id).value.trim();
}

// Chỉ ghép vào URL những tham số có giá trị -> URL gọn, dễ đọc khi debug
function buildQuery(params) {
    return Object.entries(params)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

// Mũi tên chỉ hướng trên tiêu đề cột đang được sắp xếp
function paintSortHeaders(tableId, field, order) {
    document.querySelectorAll(`#${tableId} th[data-field]`).forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.field === field) {
            th.classList.add(order === 'ASC' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Dòng "Showing 1 to 10 of 45855 records" ở chân bảng
function renderCount(elementId, pagination) {
    const el = document.getElementById(elementId);
    if (!pagination || !pagination.total) {
        el.textContent = 'Showing 0 records';
        return;
    }
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    el.textContent = `Showing ${start} to ${end} of ${pagination.total} records`;
}

// ============================================
// BẢNG DỮ LIỆU CẢM BIẾN
// Mỗi dòng là một lần đo của MỘT cảm biến:
// ID | Sensor Type | Value | Time
// ============================================
// digits: ánh sáng là số nguyên (lux), nhiệt độ và độ ẩm lấy 1 chữ số thập phân
const SENSOR_META = {
    temperature: { label: 'Nhiệt độ', unit: '°C', digits: 1 },
    humidity:    { label: 'Độ ẩm',    unit: '%',   digits: 1 },
    light:       { label: 'Ánh sáng', unit: 'lux', digits: 0 }
};

let sensorPage = 1;
let sensorLimit = 10;
let sensorSortBy = 'created_at';
let sensorSortOrder = 'DESC';
function changeSensorLimit() {
    sensorLimit = parseInt(val('sensor-limit'), 10) || 10;
    sensorPage = 1; // đổi số dòng/trang thì số trang đổi theo, quay về trang đầu
    loadSensorData();
}

async function loadSensorData() {
    try {
        // Dropdown "Lọc theo" quyết định ô Value được hiểu là gì:
        // chọn Thời gian -> Value là chuỗi ngày giờ; còn lại -> Value là số đo.
        const field = val('sensor-f-field');
        const valueBox = document.getElementById('sensor-f-value');
        const params = {
            page: sensorPage,
            limit: sensorLimit,
            sortBy: sensorSortBy,
            sortOrder: sensorSortOrder
        };

        if (field === 'time') {
            // Gộp cả from/to lẫn timeFrom/timeTo; buildQuery tự bỏ cái nào rỗng
            Object.assign(params, readTimeFilter('sensor-f-value'));
        } else {
            valueBox.classList.remove('invalid'); // ô đang gõ số thì không bắt lỗi ngày
            if (field) params.sensorType = field;
            params.value = valueBox.value.trim();
        }

        const query = buildQuery(params);

        const res = await apiFetch(`/sensors?${query}`);
        const result = await res.json();

        const tbody = document.getElementById('sensor-tbody');
        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Không có dữ liệu</td></tr>';
        } else {
            tbody.innerHTML = result.data.map(row => {
                // Cảm biến lạ (thêm vào CSDL sau này) vẫn hiện được: lấy luôn
                // tên kiểu trong CSDL và đơn vị kèm theo bản ghi làm nhãn
                const meta = SENSOR_META[row.sensor_type] ||
                    { label: row.sensor_type, unit: '', digits: 1 };
                return `
                <tr>
                    <td class="cell-id">${row.id}</td>
                    <td>${meta.label}</td>
                    <td class="cell-value">${num(row.value, meta.digits)} <span class="cell-unit">${row.unit || meta.unit}</span></td>
                    <td>${formatTime(row.created_at)}</td>
                </tr>`;
            }).join('');
        }

        renderCount('sensor-count', result.pagination);
        paintSortHeaders('sensor-table', sensorSortBy, sensorSortOrder);
        renderPagination('sensor-pagination', result.pagination, (p) => {
            sensorPage = p;
            loadSensorData();
        });
    } catch (err) {
        console.error('Không tải được bảng cảm biến:', err);
    }
}

function sortSensorData(field) {
    if (sensorSortBy === field) {
        sensorSortOrder = sensorSortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
        sensorSortBy = field;
        sensorSortOrder = 'ASC';
    }
    sensorPage = 1;
    loadSensorData();
}

function searchSensorData() {
    sensorPage = 1;
    loadSensorData();
}

// Xóa trắng mọi ô lọc rồi nạp lại bảng
function clearFilters(ids) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        el.value = '';
        el.classList.remove('invalid');
    });
}

function resetSensorFilters() {
    clearFilters(['sensor-f-field', 'sensor-f-value']);
    searchSensorData();
}

// ============================================
// BẢNG LỊCH SỬ ĐIỀU KHIỂN
// ============================================
const DEVICE_LABELS = { den: 'Đèn', quat: 'Quạt', dieuhoa: 'Điều hòa' };

let actionPage = 1;
let actionLimit = 10;
let actionSortBy = 'created_at';
let actionSortOrder = 'DESC';
function changeActionLimit() {
    actionLimit = parseInt(val('action-limit'), 10) || 10;
    actionPage = 1;
    loadActionData();
}

// Danh sách thiết bị lấy từ CSDL để ô lọc luôn khớp với dữ liệu thật
async function loadActionFilterOptions() {
    try {
        const res = await apiFetch('/devices/status');
        const devices = await res.json();
        if (!Array.isArray(devices)) return;

        document.getElementById('action-f-device').innerHTML =
            '<option value="">All Devices</option>' +
            devices.map(d => `<option value="${d.name}">${DEVICE_LABELS[d.name] || d.name}</option>`).join('');
    } catch (err) {
        console.error('Không tải được danh sách thiết bị:', err);
    }
}

// error_message lấy từ CSDL nên phải rào trước khi nhét vào title=""
function escapeAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cột Status theo bản vẽ tay: lệnh xong thì hiện TRẠNG THÁI THIẾT BỊ sau lệnh
// (ON/OFF), đang chờ mạch trả lời thì hiện "loading", hỏng thì hiện lý do.
// Khác với cột Action ở chỗ: Action là lệnh đã gửi, Status là kết quả thật sự.
function renderStatusCell(row) {
    if (row.status === 'SUCCESS') {
        // Mạch xác nhận xong -> trạng thái mới chính là hành động vừa gửi
        const cls = row.action === 'ON' ? 'badge-on' : 'badge-off';
        return `<span class="${cls}" title="Thành công">${row.action}</span>`;
    }
    if (row.status === 'PENDING') {
        return '<span class="badge-loading" title="Đang chờ mạch phản hồi"><i class="fas fa-spinner fa-spin"></i> loading</span>';
    }

    const timeout = row.status === 'TIMEOUT';
    const note = timeout ? 'Mạch không phản hồi' : (row.error_message || 'Thất bại');
    const color = timeout ? '#f59e0b' : '#f43f5e';
    const bg = timeout ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)';
    return `<span class="badge-status" title="${escapeAttr(note)}" style="background:${bg}; color:${color};">${row.status}</span>`;
}

async function loadActionData() {
    try {
        const query = buildQuery({
            page: actionPage,
            limit: actionLimit,
            device: val('action-f-device'),
            action: val('action-f-action'),
            status: val('action-f-status'),
            sortBy: actionSortBy,
            sortOrder: actionSortOrder,
            // Gộp cả from/to lẫn timeFrom/timeTo; buildQuery tự bỏ cái nào rỗng
            ...readTimeFilter('action-f-time')
        });

        const res = await apiFetch(`/devices?${query}`);
        const result = await res.json();

        const tbody = document.getElementById('action-tbody');
        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Không có dữ liệu</td></tr>';
        } else {
            tbody.innerHTML = result.data.map(row => {
                // Người bấm lệnh. Lệnh cũ hoặc lệnh không gắn user_id thì để gạch ngang.
                // Thời điểm mạch phản hồi và độ trễ không còn cột riêng nữa nên
                // đưa vào tooltip của ô Time, bấm vào vẫn tra được khi cần.
                const user = row.user_name || row.user_login || '—';

                let timeTip = '';
                if (row.responded_at) {
                    const diff = (new Date(row.responded_at) - new Date(row.created_at)) / 1000;
                    timeTip = ` title="Mạch phản hồi lúc ${formatTime(row.responded_at)}` +
                              (diff >= 0 ? ` (sau ${diff.toFixed(1)}s)` : '') + '"';
                }

                return `
                <tr>
                    <td class="cell-id">${row.id}</td>
                    <td>${DEVICE_LABELS[row.device_name] || row.device_name}</td>
                    <td><span class="${row.action === 'ON' ? 'badge-on' : 'badge-off'}">${row.action}</span></td>
                    <td>${renderStatusCell(row)}</td>
                    <td${timeTip}>${formatTime(row.created_at)}</td>
                    <td>${user}</td>
                </tr>`;
            }).join('');
        }

        renderCount('action-count', result.pagination);
        paintSortHeaders('action-table', actionSortBy, actionSortOrder);
        renderPagination('action-pagination', result.pagination, (p) => {
            actionPage = p;
            loadActionData();
        });
    } catch (err) {
        console.error('Không tải được lịch sử điều khiển:', err);
    }
}

function sortActionData(field) {
    if (actionSortBy === field) {
        actionSortOrder = actionSortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else {
        actionSortBy = field;
        actionSortOrder = 'ASC';
    }
    actionPage = 1;
    loadActionData();
}

function searchActionData() {
    actionPage = 1;
    loadActionData();
}

function resetActionFilters() {
    clearFilters(['action-f-device', 'action-f-action', 'action-f-status', 'action-f-time']);
    searchActionData();
}

// ============================================
// PHÂN TRANG
// ============================================
function renderPagination(containerId, pagination, onClick) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!pagination) return;

    const { page, totalPages } = pagination;
    if (!totalPages || totalPages <= 1) return;

    const addButton = (label, targetPage, disabled, active) => {
        const btn = document.createElement('button');
        btn.innerHTML = label;
        btn.disabled = disabled;
        if (active) btn.classList.add('active');
        if (!disabled) btn.onclick = () => onClick(targetPage);
        container.appendChild(btn);
    };

    addButton('<i class="fas fa-chevron-left"></i>', page - 1, page <= 1, false);

    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) {
        addButton(String(i), i, false, i === page);
    }

    addButton('<i class="fas fa-chevron-right"></i>', page + 1, page >= totalPages, false);
}

// ============================================
// KHỞI ĐỘNG
// ============================================
(async function init() {
    renderUserInfo();
    initChart();
    await loadChartHistory();
    await fetchLatestSensor();
    loadDeviceStatus();

    // Nạp sẵn danh sách thiết bị cho ô lọc Device, để khi bấm sang
    // Device History là danh sách đã có, không bị trống một nhịp.
    loadActionFilterOptions();

    setInterval(fetchLatestSensor, 5000);
    setInterval(loadDeviceStatus, 5000);

})();
