# KỊCH BẢN DEMO BUỔI 2 — 3 TERMINAL

## Tổng quan

Dùng **cùng một bộ 3 terminal** cho cả 2 phần, chỉ khác nguồn dữ liệu:

| Terminal | Vai trò | Phần 1 (không phần cứng) | Phần 2 (có ESP8266) |
|---|---|---|---|
| **A** — `terminal-a-sender.js` | GỬI | Gửi lệnh bật/tắt đèn + cảm biến **giả** | Gửi lệnh bật/tắt đèn **thật** |
| **B** — `terminal-b-sensor.js` | NHẬN cảm biến | Nhận số liệu giả từ A | Nhận số liệu **thật** từ ESP8266 |
| **C** — `terminal-c-light.js` | NHẬN lệnh đèn | Nhận lệnh từ A | Nhận lệnh + **phản hồi thật** từ ESP8266 |

Cả 3 terminal **bắt buộc đăng nhập** (chung tài khoản với web AURA HOME). Mọi gói tin A gửi đi
đều kèm **JWT token** của phiên đăng nhập; B, C và backend đều verify token đó.

### Các topic MQTT

| Topic | Ai gửi | Ai nhận |
|---|---|---|
| `iot/room/1/sensor/data` | Terminal A (giả) / ESP8266 (thật) | Terminal B, Backend |
| `iot/room/1/device/control` | Terminal A / Web | Terminal C, ESP8266, Backend |
| `iot/room/1/device/response` | ESP8266 | Terminal C, Backend |

---

## GIẢI THÍCH CƠ CHẾ

### 1. Toàn cảnh: dữ liệu đi đường nào

Không terminal nào gọi trực tiếp terminal nào. Tất cả đi qua **MQTT broker** đứng giữa:

```
PHẦN 1 (chưa cắm mạch):

  Terminal A --PUBLISH--> [ BROKER ] --deliver--> Terminal B   (topic sensor/data)
                                     --deliver--> Terminal C   (topic device/control)
                                     --deliver--> Backend --> MySQL

PHẦN 2 (đã cắm mạch):

  ESP8266    --PUBLISH--> [ BROKER ] --deliver--> Terminal B   (topic sensor/data)
                                     --deliver--> Backend --> MySQL

  Terminal A --PUBLISH--> [ BROKER ] --deliver--> ESP8266      (topic device/control)
                                     --deliver--> Terminal C
  ESP8266    --PUBLISH--> [ BROKER ] --deliver--> Terminal C   (topic device/response)
                                     --deliver--> Backend --> MySQL
```

Điểm mấu chốt: **Phần 1 và Phần 2 dùng y hệt một đường đi**. Chỉ khác ai phát dữ liệu cảm biến —
Phần 1 là Terminal A giả lập, Phần 2 là mạch thật. Terminal B và C không sửa một dòng code nào,
cũng không cần khởi động lại.

### 2. MQTT publish/subscribe là gì

Khác HTTP (client hỏi — server trả lời), MQTT hoạt động kiểu **đăng báo**:

- **Publish** = gửi gói tin lên một *topic* (như đăng bài vào một chuyên mục).
- **Subscribe** = đăng ký nhận mọi gói tin của topic đó.
- **Broker** = bưu điện trung tâm. Người gửi không biết ai nhận, người nhận không biết ai gửi.

Nhờ vậy một lệnh bật đèn từ Terminal A cùng lúc tới được Terminal C, ESP8266 và Backend,
mà A chỉ gửi đúng **một** gói tin.

### 3. Vì sao mỗi terminal chỉ nhận đúng phần của mình

| Terminal | Subscribe topic | Nhận được | KHÔNG nhận |
|---|---|---|---|
| B | `sensor/data` | nhiệt độ, độ ẩm, ánh sáng | lệnh bật/tắt đèn |
| C | `device/control` + `device/response` | lệnh đèn + phản hồi mạch | dữ liệu cảm biến |

Thầy hỏi "sao C không thấy nhiệt độ?" → *broker chỉ chuyển gói tin tới client đã đăng ký đúng
topic đó; C không subscribe topic cảm biến nên broker không gửi cho nó.*
Chứng minh tại chỗ: gõ `sensor` ở Terminal A — chỉ B nhảy số, C đứng yên.

### 4. Đăng nhập được kiểm tra ở 3 chỗ

**Lớp 1 — đăng nhập vào broker.** `config/mosquitto.conf` đặt `allow_anonymous false` +
`password_file`, client không có user/pass thì không connect được.
(Chỉ áp dụng khi chạy broker nội bộ; hiện demo đang dùng broker công cộng.)

**Lớp 2 — đăng nhập tài khoản trên từng terminal.** Terminal hỏi `username`/`password`, gọi thật
`POST /api/auth/login` — cùng API web đang dùng. Backend so bcrypt rồi cấp **JWT**. Sai 3 lần thoát
chương trình. Không đăng nhập được thì không subscribe, không publish được gì.

**Lớp 3 — token đi kèm từng gói tin:**
```
{"requestId":"4cb4a15c","device":"den","action":"ON","source":"cli",
 "auth":{"username":"admin","token":"eyJhbGciOi..."}}
```
Terminal nhận verify chữ ký JWT rồi mới in `AUTH=OK user=admin`. Backend verify lần nữa trước khi
ghi CSDL. Token giả thì `AUTH=INVALID`, backend bỏ qua.

Vì sao cần lớp 3 khi đã có lớp 1? Lớp 1 chỉ chứng minh *"máy này được phép nối vào broker"*,
lớp 3 mới trả lời được *"ai là người bấm lệnh"* — đó là thứ ghi vào cột `user_id` bảng `actions`.

### 5. requestId và trạng thái lệnh

Mỗi lệnh sinh `requestId` ngẫu nhiên 8 ký tự, dùng để:

1. **Ghép lệnh với phản hồi** — Terminal C nhớ lệnh vừa thấy, khi phản hồi có cùng `requestId`
   thì in `latency=...ms`.
2. **Chống nhầm** khi bấm bật/tắt liên tục nhiều lần.
3. **Phát hiện timeout** — backend đợi 5 giây không thấy phản hồi thì chuyển `PENDING` sang `TIMEOUT`.

Trạng thái bảng `actions`: `PENDING` → `SUCCESS` / `FAILED` / `TIMEOUT`.
**Phần 1 chưa có mạch nên lệnh dừng ở `PENDING` — đúng, không phải lỗi.**

### 6. QoS 1 nghĩa là gì

`qos=1` = "gửi ít nhất một lần": broker phải trả xác nhận PUBACK, chưa xác nhận thì gửi lại.
Số `bytes=290` giống nhau ở hai đầu là bằng chứng gói tin tới nơi nguyên vẹn.

### 7. File nào làm việc gì

| File | Nhiệm vụ |
|---|---|
| `backend/cli/terminal-a-sender.js` | Terminal A: đăng nhập, publish lệnh + cảm biến giả |
| `backend/cli/terminal-b-sensor.js` | Terminal B: đăng nhập, subscribe topic cảm biến |
| `backend/cli/terminal-c-light.js` | Terminal C: đăng nhập, subscribe topic lệnh + phản hồi |
| `backend/cli/lib/session.js` | Gọi API đăng nhập, verify JWT của gói tin nhận được |
| `backend/cli/lib/mqttClient.js` | Kết nối broker, đọc tên topic từ `.env` |
| `backend/server.js` | Nghe cả 3 topic, ghi `sensor_data` và `actions` vào MySQL |
| `backend/.env` | Địa chỉ broker + tên 3 topic (dùng chung backend và 3 terminal) |
| `backend/config/mosquitto.conf` | Cấu hình broker nội bộ: cổng 1884, bắt buộc user/pass |
| `esp8266/esp8266_iot/esp8266_iot.ino` | Mạch: đọc DHT11 + quang trở, nhận lệnh, trả phản hồi |

---

## CHUẨN BỊ

Đang dùng broker công cộng **broker.emqx.io:1883** (khai báo ở `backend/.env`) nên
**không cần chạy mosquitto**. Chỉ cần 2 thứ:

**1. Bật MySQL** — XAMPP Control Panel, bấm Start ở dòng MySQL.

**2. Bật Backend** — cửa sổ riêng, để nguyên:
```
cd /d "C:\Users\ADMIN\Desktop\btl iot\backend" && npm start
```
Phải thấy đủ 5 dòng:
```
Server running at http://localhost:3000
Connected to MQTT Broker
Subscribed to: iot/room/1/sensor/data
Subscribed to: iot/room/1/device/response
Subscribed to: iot/room/1/device/control
```

**3. Bật hotspot điện thoại (phải có internet), rồi cắm nguồn ESP8266.**
Vài giây sau cửa sổ backend phải chạy liên tục:
```
Sensor data saved: T=32.2°C, H=71.3%, L=647lux
```
**Thấy dòng này nghĩa là toàn hệ thống đã thông.** Không thấy thì mạch chưa nối được WiFi.

Tài khoản đăng nhập cho cả 3 terminal: **`admin` / `123456`**

> **Sau khi restart máy cần bật lại:** MySQL (XAMPP) và Backend (`npm start`). Không cần bật
> mosquitto. Mạch chỉ cần cắm nguồn. IP laptop đổi cũng không sao vì dùng broker công cộng.

> **Dự phòng khi phòng không có internet:** đổi `backend/.env` thành
> `MQTT_BROKER=mqtt://admin:123456@localhost:1884` (dòng này có sẵn dạng comment), chạy
> `"C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Users\ADMIN\Desktop\btl iot\backend\config\mosquitto.conf" -v`,
> rồi sửa `MQTT_BROKER` trong `.ino` thành IP LAN của laptop (`ipconfig`) và **nạp lại mạch**.
> Mất khoảng 3 phút, nhưng IP đổi mỗi lần bật lại hotspot nên phải kiểm tra sát giờ.

---

## PHẦN 1 — Terminal giao tiếp với nhau (chưa cần mạch)

### Bước 1 — Mở Terminal B

```
cd /d "C:\Users\ADMIN\Desktop\btl iot\backend" && chcp 65001 >nul && npm run terminal-b
```
Nhập `admin` / `123456`.

> **Nói:** "Terminal này bắt buộc đăng nhập mới chạy. Sau khi đăng nhập nó subscribe topic
> `iot/room/1/sensor/data`."

### Bước 2 — Mở Terminal C

```
cd /d "C:\Users\ADMIN\Desktop\btl iot\backend" && chcp 65001 >nul && npm run terminal-c
```
Nhập `admin` / `123456`.

> **Nói:** "Terminal này subscribe 2 topic khác: topic lệnh điều khiển và topic phản hồi."

### Bước 3 — Mở Terminal A

```
cd /d "C:\Users\ADMIN\Desktop\btl iot\backend" && chcp 65001 >nul && npm run terminal-a
```
Terminal A dùng **đúng cú pháp của công cụ chuẩn `mosquitto_pub` / `mosquitto_sub`**:

```
mosquitto_pub -u <user> -P <pass> -t <topic> -m <payload> [-q 0|1|2]
mosquitto_sub -u <user> -P <pass> -t <topic>
unsub -t <topic>
help | exit
```

Viết tắt topic cho đỡ dài: `control` | `sensor` | `response` (hoặc gõ đầy đủ đường dẫn topic).

**Điểm khác biệt quan trọng so với `mosquitto_pub` thật:** `-u` / `-P` ở đây không chỉ là
user/pass của broker mà được **xác thực thật** với `POST /api/auth/login` (bcrypt + JWT).
Sai tài khoản thì lệnh bị từ chối; đúng thì JWT được đính kèm vào payload để terminal nhận
verify chữ ký. Đây chính là chỗ đáp ứng yêu cầu "đăng nhập trực tiếp trên terminal".

Các lệnh dùng trong demo:
```
mosquitto_pub -u admin -P 123456 -t control -m {"device":"den","action":"ON"}
mosquitto_pub -u admin -P 123456 -t control -m {"device":"den","action":"OFF"}
mosquitto_pub -u admin -P 123456 -t control -m {"device":"quat","action":"ON"}
mosquitto_pub -u admin -P 123456 -t sensor  -m {"temperature":28.5,"humidity":65,"lightRaw":400}
mosquitto_sub -u admin -P 123456 -t response
```

> **Thứ tự B → C → A là bắt buộc.** MQTT không lưu tin cho client chưa đăng ký; mở A trước thì
> B và C sẽ không thấy gì.

### Bước 4 — Chứng minh bắt buộc đăng nhập, rồi gửi lệnh bật đèn

**4a. Thử gửi khi KHÔNG đăng nhập** — bỏ `-u -P`:
```
mosquitto_pub -t control -m {"device":"den","action":"ON"}
Connection Refused: not authorised (thieu -u hoac -P)
```

**4b. Thử SAI mật khẩu:**
```
mosquitto_pub -u admin -P saibet -t control -m {"device":"den","action":"ON"}
Connection Refused: not authorised (Sai mật khẩu)
```

> **Nói:** "Hai lệnh này không gửi được gì cả — Terminal C hoàn toàn im lặng. Terminal chỉ
> publish sau khi `-u -P` được backend xác thực bằng bcrypt."

**4c. Đăng nhập đúng — lệnh đi được:**
```
mosquitto_pub -u admin -P 123456 -t control -m {"device":"den","action":"ON"}
```
**Terminal A:**
```
AUTH OK user=admin role=admin id=1
[10:49:17.392] PUBLISH topic=iot/room/1/device/control qos=1 bytes=290
{"device":"den","action":"ON","requestId":"2bc29703","source":"cli","auth":{"username":"admin","token":"eyJhbGciOi..."}}
```
**Terminal C** gần như cùng lúc:
```
[10:49:17.467] RECV topic=iot/room/1/device/control bytes=290
{"device":"den","action":"ON","requestId":"2bc29703","source":"cli","auth":{"username":"admin","token":"eyJhbGciOi..."}}
AUTH=OK user=admin | CMD device=den action=ON requestId=2bc29703
```

> **Nói:** "A publish lên topic, C đang subscribe topic đó nên nhận ngay. Ba thứ chứng minh đúng
> một gói tin: `requestId` giống nhau, số `bytes` giống nhau, thời gian lệch vài mili giây.
> `AUTH=OK` là do C tự verify chữ ký JWT trong payload."

**Chỉ vào Terminal B — nó đứng yên.** "B không subscribe topic điều khiển nên không nhận."

### Bước 5 — Đổi topic sang `sensor`, lần này B nhận còn C im

```
mosquitto_pub -u admin -P 123456 -t sensor -m {"temperature":28.5,"humidity":65,"lightRaw":400}
```
**Terminal B:**
```
[10:49:20.463] RECV topic=iot/room/1/sensor/data bytes=286
{"temperature":28.5,"humidity":65,"lightRaw":400,"source":"cli","auth":{"username":"admin","token":"eyJhbGciOi..."}}
AUTH=OK user=admin | temperature=28.5 humidity=65 lightRaw=400
```
**Terminal C đứng yên** — cùng một lệnh, chỉ đổi `-t control` thành `-t sensor` mà người nhận
đổi hẳn. Đây là minh hoạ trực quan nhất cho cơ chế lọc theo topic của broker.

### Bước 6 — Chỉ sang cửa sổ Backend

```
Lệnh từ Terminal CLI: den → ON (user admin, request 4cb4a15c)
Sensor data saved: T=28.5°C, H=65%, L=400lux
```
Mở `http://localhost:3000` → trang **History** và **Data Sensor** có đúng bản ghi vừa gửi.

### Bước 7 (nếu thầy hỏi bảo mật) — token giả bị từ chối

Mở thêm 1 cửa sổ, chạy đoạn `node -e` giả mạo token (xem mục cuối tài liệu).

**Terminal C:**
```
AUTH=INVALID user=hacker (token khong hop le / het han) | CMD device=den action=ON requestId=fake0001
```
**Backend:** `Lệnh CLI không kèm token hợp lệ, bỏ qua: den=ON` → **không** ghi vào CSDL.

---

## PHẦN 2 — Mạch thật (vẫn 3 terminal đó, không tắt cái nào)

### Chuẩn bị mạch

Mạch đã cấu hình xong, chỉ việc cắm nguồn:

| Mục | Giá trị |
|---|---|
| WiFi | `FK` (hotspot điện thoại) |
| Broker của mạch | `broker.emqx.io:1883` |
| Broker của backend + 3 terminal | `broker.emqx.io:1883` |

Hai bên cùng broker nên dữ liệu thông suốt. Serial Monitor (115200) phải báo
`WiFi OK! IP: ...` và `Dang ket noi MQTT... OK!`

> **Hai lỗi đã sửa trong `.ino` — nhớ để trả lời nếu thầy hỏi:** mặc định PubSubClient chỉ đệm
> **256 byte**, mà gói lệnh kèm JWT dài **290 byte** nên bị mạch bỏ qua *im lặng*, không báo lỗi.
> Đã thêm `mqttClient.setBufferSize(512)` và tăng `StaticJsonDocument` từ 200 lên 512 byte.
> Cách tìm ra: gửi gói ngắn 53 byte thì mạch phản hồi ngay, gói 290 byte thì im → suy ra vấn đề
> ở kích thước gói chứ không phải kết nối.

### Bước 8 — Terminal B nhận cảm biến THẬT

Terminal B đang chạy sẵn, tự nhảy số mỗi 5 giây:
```
[09:41:10.674] RECV topic=iot/room/1/sensor/data bytes=51
{"temperature":32.2,"humidity":71.1,"lightRaw":656}
AUTH=NONE source=ESP8266(phan cung) | temperature=32.2 humidity=71.1 lightRaw=656
```

> **Nói:** "Số đo thật từ DHT11 và quang trở. Gói này không có trường `auth` nên terminal ghi
> `AUTH=NONE source=ESP8266` — khác `AUTH=OK user=admin` ở Phần 1, vì mạch gửi chứ không phải người dùng."

**Làm tại chỗ:** hà hơi vào cảm biến → độ ẩm tăng; che quang trở → `lightRaw` tụt.

### Bước 9 — Gửi lệnh ở Terminal A → đèn sáng thật

```
mosquitto_pub -u admin -P 123456 -t control -m {"device":"den","action":"ON"}
```


**Đèn LED trên mạch sáng.** Terminal C hiện 2 khối:
```
[09:41:25.245] RECV topic=iot/room/1/device/control bytes=290
AUTH=OK user=admin | CMD device=den action=ON requestId=54ceeec7

[09:41:25.906] RECV topic=iot/room/1/device/response bytes=85
{"device":"den","action":"ON","state":"ON","status":"SUCCESS","requestId":"54ceeec7"}
RESP status=SUCCESS device=den state=ON requestId=54ceeec7 match=den/ON latency=661ms
```

> **Nói:** "Terminal C ghép lệnh gửi đi với phản hồi mạch trả về theo `requestId`, đo được độ trễ
> thật 661 mili giây. `SUCCESS` là mạch xác nhận đã bật đúng."

Tắt đèn:
```
mosquitto_pub -u admin -P 123456 -t control -m {"device":"den","action":"OFF"}
```

### Bước 10 (điểm cộng) — chế độ tự động của mạch

Serial Monitor gõ `AUTO`, rồi che quang trở. Mạch tự bật đèn và báo về:
```
RESP status=SUCCESS device=den state=ON requestId=- source=AUTO (ESP tu doi trang thai theo cam bien)
```

---

## BẰNG CHỨNG ĐỘC LẬP BẰNG mosquitto_sub

Mở thêm 1 cửa sổ chạy công cụ chuẩn của Mosquitto để soi toàn bộ traffic:

```
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h broker.emqx.io -p 1883 -t "iot/room/1/#" -v
```

Nó hiện đúng những gói tin mà 3 terminal đang trao đổi. Đây là cách chứng minh mạnh nhất rằng
hệ thống dùng **MQTT thật theo chuẩn**, không phải 3 chương trình tự nói chuyện nội bộ.

### Chứng minh xác thực ở tầng broker bằng `-u` / `-P` (30 giây)

Cờ `-u <user>` và `-P <pass>` là đăng nhập vào **broker**, khác với đăng nhập tài khoản trên
terminal. Broker công cộng emqx cho kết nối ẩn danh nên `-u -P` vô tác dụng ở đó; muốn diễn
thì bật broker nội bộ song song, **không ảnh hưởng gì tới demo chính đang chạy trên emqx**:

```
:: cửa sổ 1 - bật broker nội bộ có bắt buộc xác thực
"C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Users\ADMIN\Desktop\btl iot\backend\config\mosquitto.conf"

:: cửa sổ 2 - KHÔNG đăng nhập -> bị từ chối
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -p 1884 -t "iot/room/1/#" -v
Connection error: Connection Refused: not authorised

:: cửa sổ 2 - CÓ đăng nhập -> vào được
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -p 1884 -t "iot/room/1/#" -v -u admin -P 123456
```

**Phân biệt 2 lớp đăng nhập** (dễ bị hỏi xoáy):

| | `-u admin -P 123456` | Đăng nhập trên Terminal A/B/C |
|---|---|---|
| Đăng nhập vào | **Broker** (tầng giao thức MQTT) | **Ứng dụng** (tài khoản trong CSDL) |
| Kiểm tra ở | `config/pwfile` của mosquitto | Bảng `users` trong MySQL, so bằng bcrypt |
| Trả lời câu hỏi | "Máy này có được nối vào broker không?" | "**Ai** là người bấm lệnh bật đèn?" |
| Sai thì | Từ chối kết nối ngay (`not authorised`) | Không vào được chương trình, sai 3 lần thoát |
| Ghi được `actions.user_id` | Không | Có |

Hai bên **trùng nhau là `admin`/`123456` chỉ là ngẫu nhiên** — một cái trong `pwfile` của
mosquitto, một cái trong bảng `users` của MySQL. Nói rõ chỗ này sẽ ghi điểm.

**Nếu thầy hỏi sao không dùng thẳng `mosquitto_pub` làm Terminal A:**

| | `mosquitto_pub/sub` | Terminal A/B/C |
|---|---|---|
| Publish/subscribe MQTT | Có | Có (cùng giao thức, cùng broker) |
| Đăng nhập **tài khoản người dùng** | Không — `-u/-P` chỉ là user/pass của *broker* | Gọi `/api/auth/login`, bcrypt + JWT, sai 3 lần thoát |
| Biết **ai** gửi lệnh | Không | Có — token trong payload, verify chữ ký |
| Ghép lệnh ↔ phản hồi, đo độ trễ | Không | Có, theo `requestId` |
| Ghi CSDL kèm `user_id` | Không | Có |

Yêu cầu của thầy là *"đăng nhập trực tiếp trên terminal"* — `mosquitto_pub` không làm được,
nên nó chỉ dùng làm công cụ kiểm chứng, không thay thế được 3 terminal.

---

## BẢNG TRẢ LỜI NHANH

| Câu hỏi | Trả lời |
|---|---|
| Các terminal giao tiếp thế nào? | Qua MQTT broker, mô hình publish/subscribe trên 3 topic riêng. Không terminal nào gọi trực tiếp terminal nào. |
| Sao C không nhận dữ liệu cảm biến? | C chỉ subscribe `device/control` và `device/response`. Broker chỉ gửi tới client đã đăng ký đúng topic. |
| Đăng nhập ở đâu? | Ngay trên terminal, gọi `POST /api/auth/login` — cùng tài khoản, cùng JWT với web. Sai 3 lần thoát. |
| Token dùng làm gì sau khi đăng nhập? | Gắn vào mọi gói tin. Terminal nhận verify chữ ký; backend verify lần nữa trước khi ghi CSDL. |
| MQTT có bảo mật không? | Đang dùng broker công cộng cho tiện demo, topic công khai. Có sẵn cấu hình broker nội bộ bật `allow_anonymous false` + `password_file`, đổi 1 dòng `.env` là chuyển sang. Ngoài ra mỗi gói tin còn có JWT nên token giả bị loại. |
| `requestId` để làm gì? | Ghép lệnh với phản hồi, đo độ trễ, và phát hiện timeout sau 5 giây. |
| Dữ liệu có lưu không? | Có. Backend subscribe cả 3 topic, ghi bảng `sensor_data` và `actions`, xem lại trên web ở History / Data Sensor. |
| Sao trạng thái là PENDING? | Phần 1 chưa có mạch nên không ai phản hồi. Có mạch thì thành `SUCCESS`. |

---

## CHECKLIST TRƯỚC KHI BẢO VỆ

- [ ] Hotspot điện thoại đã bật và **có internet**
- [ ] MySQL đang chạy (XAMPP)
- [ ] `npm start` in đủ 3 dòng `Subscribed to:`
- [ ] Cắm nguồn ESP8266, Serial Monitor báo `Dang ket noi MQTT... OK!`
- [ ] Backend in `Sensor data saved: ...` → mạch đã thông
- [ ] Mở 3 terminal đúng thứ tự **B → C → A**, cả 3 đăng nhập được
- [ ] Chạy thử trọn vẹn Phần 1 và Phần 2 **một lần** trước khi vào phòng
