# 📬 Read iCloud Mail Worker

Cloudflare Worker để nhận, lưu trữ và tra cứu email từ **iCloud Hide My Email aliases** — kèm frontend web và REST API để tích hợp tool tự động.

## ✨ Tính năng

- **Email Routing**: Nhận mail từ iCloud Hide My Email qua Cloudflare Email Routing
- **D1 Database**: Lưu trữ email trong Cloudflare D1 (SQLite serverless)
- **Parse thông minh**: Tự động decode `quoted-printable`, strip HTML, trích xuất OTP
- **REST API**: Tra cứu mail, lấy OTP mới nhất, xóa mail — bảo vệ bằng `VIEW_TOKEN`
- **Frontend Web**: Giao diện dark mode hiện đại, hỗ trợ multi-alias, auto-refresh
- **OTP Detection**: Phát hiện mã OTP tự động, tránh nhầm năm/ngày tháng

## 🏗️ Kiến trúc

```
iCloud Hide My Email alias
        │
        ▼ forward
  benobaty.online (custom domain)
        │
        ▼ Cloudflare Email Routing
  read-icloud-mail-worker (Worker)
        │
        ├──▶ D1 Database (lưu email)
        │
        └──▶ REST API (/logs, /otp, /messages)
                      │
                      ▼
              Frontend Web UI
```

## 🚀 Triển khai từ đầu

### Yêu cầu

- [Node.js](https://nodejs.org/) >= 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) >= 3
- Tài khoản Cloudflare với domain được quản lý
- Tài khoản iCloud với Hide My Email

### 1. Clone & cài đặt

```bash
git clone https://github.com/tmq9999/Read-icloud-Mail.git
cd Read-icloud-Mail
npm install
```

### 2. Cấu hình `wrangler.toml`

```toml
name = "read-icloud-mail-worker"
main = "src/index.ts"
compatibility_date = "2024-06-20"
account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"   # thay bằng account ID của bạn

[assets]
directory = "./public"

[[d1_databases]]
binding = "DB_OTP_MAIL"
database_name = "icloud-otp-mail-db"
database_id = "YOUR_D1_DATABASE_ID"          # điền sau bước tạo D1

[vars]
LOG_RETENTION_DAYS = "7"
MAX_MESSAGES_PER_MAILBOX = "100"
```

### 3. Tạo D1 database

```bash
wrangler d1 create icloud-otp-mail-db
```

Copy `database_id` từ output vào `wrangler.toml`.

### 4. Chạy migration

```bash
wrangler d1 execute icloud-otp-mail-db --remote --file=migrations/0001_initial.sql --yes
```

### 5. Deploy Worker

```bash
wrangler deploy
```

### 6. Đặt secret VIEW_TOKEN

```bash
wrangler secret put VIEW_TOKEN
# Nhập token bí mật của bạn, ví dụ: MySecureToken2024!
```

### 7. Cấu hình Cloudflare Email Routing

1. Vào **Cloudflare Dashboard → Email → Email Routing**
2. Bật Email Routing cho domain của bạn
3. Tạo **Catch-all route**: Action = **Send to Worker** → chọn `read-icloud-mail-worker`

### 8. Cấu hình iCloud Mail forwarding

1. Mở **iCloud Mail** trên web hoặc macOS Mail
2. Vào **Settings → Rules → Add a Rule**
3. Tạo rule: **From** contains `@` → **Forward to** `inbox@yourdomain.com`
4. Xác nhận forwarding qua email verification của iCloud

> Worker sẽ đọc header `X-ICLOUD-HME` để trích xuất alias gốc (ví dụ: `fletch.rooftop2a@icloud.com`).

---

## 🔌 REST API

Tất cả endpoint đều yêu cầu xác thực qua:
- Header: `Authorization: Bearer <VIEW_TOKEN>`
- Hoặc query param: `?token=<VIEW_TOKEN>`

### `GET /logs` — Lấy danh sách email

| Param | Mô tả | Mặc định |
|-------|-------|---------|
| `mail` | *(bắt buộc)* Địa chỉ email alias | — |
| `mode` | `latest` (1 mail mới nhất) hoặc `full` (tất cả) | `full` |
| `limit` | Số lượng tối đa khi `mode=full` | `100` |

```bash
# Lấy tất cả mail
curl "https://your-worker.workers.dev/logs?mail=alias@icloud.com" \
  -H "Authorization: Bearer MyToken"

# Chỉ lấy mail mới nhất
curl "https://your-worker.workers.dev/logs?mail=alias@icloud.com&mode=latest" \
  -H "Authorization: Bearer MyToken"
```

**Response:**
```json
{
  "messages": [
    {
      "id": 42,
      "to": "alias@icloud.com",
      "from": "noreply@tm.openai.com",
      "subject": "Your temporary ChatGPT verification code",
      "bodyText": "Enter this code: 085747",
      "date": "2026-06-27T06:34:16.000Z",
      "receivedAt": "2026-06-27T06:34:16.000Z"
    }
  ],
  "mode": "full",
  "total": 1
}
```

---

### `GET /otp` — Lấy OTP mới nhất

| Param | Mô tả | Mặc định |
|-------|-------|---------|
| `mail` | *(bắt buộc)* Địa chỉ email alias | — |
| `after` | Chỉ xét email nhận sau timestamp này (ISO 8601) | — |
| `scan` | Số email gần nhất để quét tìm OTP | `5` |

```bash
# Lấy OTP mới nhất
curl "https://your-worker.workers.dev/otp?mail=alias@icloud.com" \
  -H "Authorization: Bearer MyToken"

# Chỉ lấy OTP nhận sau 1 thời điểm (dùng cho automation)
curl "https://your-worker.workers.dev/otp?mail=alias@icloud.com&after=2026-06-27T10:00:00Z" \
  -H "Authorization: Bearer MyToken"
```

**Response khi có OTP:**
```json
{
  "otp": "085747",
  "mail": "alias@icloud.com",
  "message_id": 42,
  "subject": "Your temporary ChatGPT verification code",
  "received_at": "2026-06-27T06:34:16.000Z"
}
```

**Response khi không tìm thấy (HTTP 404):**
```json
{
  "otp": null,
  "mail": "alias@icloud.com",
  "message": "No OTP found in recent emails"
}
```

---

### `DELETE /messages` — Xóa email

```bash
# Xóa toàn bộ mail của 1 alias
curl -X DELETE "https://your-worker.workers.dev/messages?mail=alias@icloud.com" \
  -H "Authorization: Bearer MyToken"

# Xóa TẤT CẢ mail trong database
curl -X DELETE "https://your-worker.workers.dev/messages" \
  -H "Authorization: Bearer MyToken"
```

**Response:**
```json
{
  "deleted": true,
  "mail": "alias@icloud.com",
  "rows_deleted": 11
}
```

---

### `GET /health` — Kiểm tra trạng thái

```bash
curl "https://your-worker.workers.dev/health"
```

```json
{
  "ok": true,
  "worker": "read-icloud-mail-worker",
  "endpoints": {
    "GET /logs": "?mail=&mode=latest|full&limit=&token=",
    "GET /otp": "?mail=&after=ISO&scan=5&token=",
    "DELETE /messages": "?mail= (omit for all)&token=",
    "GET /health": "status check"
  }
}
```

---

## 🐍 Tích hợp Python (ví dụ)

```python
import requests
import time

WORKER_URL = "https://your-worker.workers.dev"
VIEW_TOKEN  = "MySecureToken2024!"
HEADERS     = {"Authorization": f"Bearer {VIEW_TOKEN}"}

def get_latest_otp(alias: str, after: str = None, retries: int = 10, delay: float = 3.0):
    """Poll OTP sau khi trigger signup. after = ISO timestamp trước khi gửi request."""
    params = {"mail": alias, "scan": 10}
    if after:
        params["after"] = after
    for _ in range(retries):
        resp = requests.get(f"{WORKER_URL}/otp", params=params, headers=HEADERS)
        data = resp.json()
        if data.get("otp"):
            return data["otp"]
        time.sleep(delay)
    return None

# Ví dụ sử dụng
start_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
# ... trigger signup / login ...
otp = get_latest_otp("alias@icloud.com", after=start_time)
print(f"OTP: {otp}")
```

---

## 🖥️ Frontend Web

Truy cập tại: `https://your-worker.workers.dev/`

### Tính năng UI
- **Multi-alias**: Nhập nhiều email (mỗi dòng hoặc ngăn cách bằng dấu phẩy)
- **Chế độ xem**:
  - ⚡ **Mới nhất** — chỉ hiển thị email gần nhất mỗi alias
  - 📋 **Tất cả** — hiển thị toàn bộ lịch sử
- **OTP chip**: Tự động phát hiện và hiển thị OTP nổi bật, click để copy
- **Xóa mail**: Xóa theo mailbox hoặc xóa toàn bộ DB
- **Auto-refresh**: Tự động làm mới mỗi 10 giây (toggle bật/tắt)
- **Lưu config**: Token và danh sách email được lưu `localStorage`

---

## 📁 Cấu trúc dự án

```
read-icloud-mail-worker/
├── src/
│   └── index.ts          # Worker chính: email handler + HTTP API
├── public/
│   └── index.html        # Frontend web SPA
├── migrations/
│   └── 0001_initial.sql  # D1 schema
├── wrangler.toml         # Cấu hình Cloudflare Worker
├── package.json
├── tsconfig.json
└── README.md
```

### Schema D1

```sql
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient   TEXT NOT NULL,      -- alias gốc (X-ICLOUD-HME header)
  sender      TEXT,
  subject     TEXT,
  body_text   TEXT,               -- plain text, đã decode QP
  body_html   TEXT,
  received_at TEXT NOT NULL,      -- ISO 8601
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## ⚙️ Biến môi trường

| Tên | Loại | Mô tả |
|-----|------|-------|
| `VIEW_TOKEN` | Secret | Token xác thực API (đặt qua `wrangler secret put`) |
| `LOG_RETENTION_DAYS` | Var | Số ngày giữ mail (mặc định: `7`) |
| `MAX_MESSAGES_PER_MAILBOX` | Var | Giới hạn mail mỗi mailbox (mặc định: `100`) |

---

## 🔒 Bảo mật

- `VIEW_TOKEN` được lưu dưới dạng **Cloudflare Secret** (không xuất hiện trong code hay logs)
- Tất cả API endpoint đều yêu cầu token
- Nên **revoke Cloudflare API token** sau khi deploy xong
- Không commit `VIEW_TOKEN` hay API token vào repository

---

## 📜 License

MIT
