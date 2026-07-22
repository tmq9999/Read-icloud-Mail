# 📬 TempMail — Hộp thư tạm thời (Cloudflare Worker)

Dịch vụ **tempmail công khai** chạy trên Cloudflare Workers + D1: tạo địa chỉ email dùng một lần và đọc thư/OTP nhận về ngay trên web, **không cần đăng nhập hay nhập token**. Kèm **trang quản trị** bảo mật để theo dõi và quản lý hệ thống.

> Live: `https://read-icloud-mail-worker.tranminhquang-tmq9999.workers.dev`
> Truy cập được qua mọi custom domain đã gắn: `https://tempmail.<domain>` (Workers Custom Domains).

---

## ✨ Tính năng

- **Trang công khai, không cần token** — ai mở web cũng dùng được ngay (API gọi cùng origin).
- **Giao diện Apple Mail 3 khung** (light) — sidebar hộp thư · danh sách thư · khung đọc; responsive mobile.
- **2 cách tạo địa chỉ:**
  - **Domain** — username sinh từ faker.js (CDN + fallback offline) `@` domain ngẫu nhiên lấy từ danh sách zone Cloudflare (`GET /zones`).
  - **Email (đa nhà cung cấp)** — bấm **Generate email** để xem thử một biến thể sinh từ một tài khoản email gốc trong hệ thống (Gmail, Outlook/Hotmail, GMX, mail.com, libero.it, …); ưng thì bấm **Tạo email**. Biến thể theo nhà cung cấp: **Gmail** dùng **dấu chấm** (`a.d.min@gmail.com`) hoặc **+alias** (`admin+x7k2@gmail.com`); các nhà cung cấp khác dùng **+alias** (`user+x7k2@outlook.com`). Không cho gõ email ngoài hệ thống.
- **Đọc thư realtime** — tự làm mới 10s (tạm dừng khi ẩn tab), badge chưa đọc theo từng hộp.
- **Tự nhận diện OTP** — trích mã 4–8 số theo ngữ cảnh (ưu tiên có nhãn → số đứng riêng → loại năm/ngày), nổi bật + chép một chạm.
- **Xem HTML an toàn** — render trong `iframe sandbox`, lọc `<script>`/`on*=`; chuyển HTML ↔ văn bản; giải mã base64 fallback.
- **Trang Admin** (`/admin`) — dashboard số liệu, danh sách địa chỉ đã tạo (kèm **IP người tạo**), thư nhận, quản lý email hệ thống (đa nhà cung cấp), khóa IP, xóa toàn bộ thư.

---

## 🏗️ Kiến trúc

```
                    ┌────────────────────────────────────────────┐
   Người dùng ──▶   │  Cloudflare Worker (src/index.ts)            │
   (trình duyệt)    │   • GET /            → public/index.html     │
                    │   • GET /logs /otp /zones /gmails  (public)  │
                    │   • POST /register                 (public)  │
                    │   • DELETE /messages?mail=         (public)  │
                    │   • /admin/*         → auth phiên (admin)    │
                    └───────────────┬──────────────────────────────┘
                                    │  D1 (SQLite)
                                    ▼
        messages · addresses · gmail_accounts · admin_config · login_attempts

   Email đến ──▶  Cloudflare Email Routing / Gmail forward / iCloud HME
              ──▶  Worker email() handler  ──▶  D1
```

- **Runtime:** Cloudflare Workers (`compatibility_date` trong `wrangler.toml`).
- **Lưu trữ:** D1 database `icloud-otp-mail-db` (binding `DB_OTP_MAIL`).
- **UI:** phục vụ qua Workers Assets (`public/`), trừ `/admin` do Worker render trực tiếp (no-store).
- **Nhận mail:** handler `email()` phân tích MIME (multipart, quoted-printable, base64, RFC 2047), trích người nhận gốc từ header (`X-ICLOUD-HME`, `Delivered-To`, `To`, …; nhận diện iCloud & Gmail) rồi lưu vào bảng `messages` kèm `recipient_canonical`.

---

## 📁 Cấu trúc

```
├── src/
│   ├── index.ts        # Backend: routes, xử lý mail, admin auth
│   └── admin_html.ts   # Trang admin (SPA, phục vụ tại /admin)
├── public/
│   └── index.html      # Giao diện tempmail công khai (self-contained)
├── migrations/
│   ├── 0001_initial.sql   # bảng messages
│   ├── 0002_admin.sql     # addresses, login_attempts, admin_config
│   └── 0003_gmail.sql     # gmail_accounts + messages.recipient_canonical
├── wrangler.toml
├── package.json
└── tsconfig.json
```

### Schema D1 (tóm tắt)

| Bảng | Vai trò |
|---|---|
| `messages` | Thư nhận được (recipient, sender, subject, body_text/html, received_at, **recipient_canonical**) |
| `addresses` | Địa chỉ người dùng đã tạo (email PK, domain, **ip**, user_agent, created_at, last_seen, hits) |
| `gmail_accounts` | Email gốc đã forward vào hệ thống — mọi nhà cung cấp (email PK, note, active) |
| `admin_config` | Cấu hình admin dạng key/value (vd `allowed_ips`) |
| `login_attempts` | Log đăng nhập cho rate-limit |

---

## 🔌 API

### Công khai (không cần token)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/` | Giao diện tempmail |
| GET | `/logs?mail=&mode=latest\|full&limit=` | Đọc thư của một địa chỉ |
| GET | `/otp?mail=&after=ISO&scan=` | Lấy OTP mới nhất |
| GET | `/zones` | Danh sách domain Cloudflare (cho generator) |
| GET | `/gmails` | Danh sách email gốc active — mọi nhà cung cấp (cho generator) |
| POST | `/register` `{email}` | Ghi log địa chỉ vừa tạo + IP người tạo |
| DELETE | `/messages?mail=` | Xóa thư của **một** địa chỉ (bắt buộc `mail`) |
| GET | `/health` | Kiểm tra trạng thái |

> `/logs`, `/otp`, `/messages` khớp **chính xác** theo `recipient` — mỗi biến thể dấu chấm / +alias là một hộp thư **riêng biệt**, không đọc chung.

### Quản trị (bắt buộc phiên đăng nhập)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/admin` | Trang quản trị |
| POST | `/admin/login` `{username,password}` | Đăng nhập → cookie phiên |
| POST | `/admin/logout` | Đăng xuất |
| GET | `/admin/api/session` | Kiểm tra phiên |
| GET | `/admin/api/stats` | Số liệu dashboard |
| GET | `/admin/api/addresses` | Địa chỉ đã tạo (email, domain, IP, số lần, thời gian) |
| GET / DELETE | `/admin/api/messages` | Danh sách thư / xóa **toàn bộ** thư |
| GET / POST | `/admin/api/gmail` | Quản lý email gốc — mọi nhà cung cấp (add/toggle/delete) |
| GET / POST | `/admin/api/security` | Xem/đặt danh sách IP được phép |

---

## 📧 Cơ chế Email tempmail (đa nhà cung cấp)

Nhiều nhà cung cấp cho phép **sub-addressing** (biến thể cùng về một hộp thư):
- **Gmail** bỏ qua dấu chấm và mọi thứ sau `+` → `admin@gmail.com`, `a.d.min@gmail.com`, `admin+abc@gmail.com` cùng một hộp.
- **Outlook/Hotmail, GMX, mail.com, libero.it, …** hỗ trợ **+alias** → `user+abc@domain` về hộp `user@domain`.

Hệ thống tận dụng điều này:

1. Admin thêm email gốc bất kỳ (đã bật **auto-forward** về worker) trong tab *Email hệ thống*.
2. Web random một email gốc + sinh biến thể để người dùng đăng ký dịch vụ — **Gmail**: dấu chấm hoặc +alias; **nhà cung cấp khác**: chỉ +alias (dot-trick chỉ đúng với Gmail).
3. Mail gửi tới biến thể → về hộp email gốc → forward về worker → lưu D1.
4. `email()` trích địa chỉ nhận gốc từ header `To` của mail đã forward (Gmail giữ nguyên biến thể dấu chấm / +alias mà người gửi dùng), lưu đúng biến thể vào `recipient`.
5. Khi đọc, worker khớp **chính xác** theo `recipient` — **mỗi biến thể là một hộp thư riêng biệt**, chỉ hiện đúng thư gửi tới biến thể đó (không đọc chung với biến thể khác).

> **Cấu hình forward (Gmail):** Settings → *Forwarding and POP/IMAP* → **Add a forwarding address** (nhập địa chỉ đích, vd `inbox@<domain>`) → nhập mã xác nhận (mã này về chính hộp tempmail của địa chỉ đích) → chọn **Forward a copy** → **Save Changes**.
> `email()` handler trích địa chỉ nhận gốc từ header `To` của mail đã forward nên vẫn giữ đúng biến thể; các mail hệ thống của Google (`forwarding-noreply@google.com`) gửi thẳng tới địa chỉ đích và nằm dưới chính địa chỉ đó.

---

## 🔐 Bảo mật

- Trang công khai chỉ cho **đọc/tạo**; **xóa toàn bộ** database chỉ thực hiện trong admin.
- Admin: đăng nhập user/pass (**không đăng ký**), phiên bằng cookie **HttpOnly + Secure + SameSite=Strict** ký **HMAC-SHA256**, TTL 24h; so sánh mật khẩu **constant-time**; **rate-limit** 8 lần thất bại/15 phút theo IP.
- **Khóa IP** (tùy chọn): khi bật, mọi route `/admin` trả **404** cho IP không nằm trong danh sách (ẩn hoàn toàn sự tồn tại của admin).
- Header bảo mật cho admin: `no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

---

## 🚀 Cài đặt & Deploy

Yêu cầu: Node.js ≥ 18, Wrangler ≥ 3, tài khoản Cloudflare (Workers + D1 + Email Routing).

```bash
git clone https://github.com/tmq9999/Read-icloud-Mail.git
cd Read-icloud-Mail
npm install
npx wrangler login            # hoặc export CLOUDFLARE_API_TOKEN

# Tạo D1 rồi điền database_id vào wrangler.toml
npx wrangler d1 create icloud-otp-mail-db

# Áp dụng schema cho D1 (remote)
npx wrangler d1 execute icloud-otp-mail-db --remote --yes --file=migrations/0001_initial.sql
npx wrangler d1 execute icloud-otp-mail-db --remote --yes --file=migrations/0002_admin.sql
npx wrangler d1 execute icloud-otp-mail-db --remote --yes --file=migrations/0003_gmail.sql

# Secrets
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET     # chuỗi ngẫu nhiên đủ dài (vd: openssl rand -hex 32)
npx wrangler secret put CF_API_TOKEN       # token Cloudflare quyền Zone:Read (cho /zones)

# Deploy
npx wrangler deploy
```

### Email Routing & Gmail forward
- **Cloudflare Email Routing**: bật cho domain → tạo *Catch-all route* → **Send to Worker** → `read-icloud-mail-worker`.
- **Email gốc (Gmail/Outlook/GMX/…)**: bật Forwarding của nhà cung cấp → trỏ về một địa chỉ đang route vào worker; mã xác nhận forward sẽ hiện trong admin (*Thư đã nhận*). Sau đó thêm email gốc trong admin (*Email hệ thống*).
- **Custom domain**: dùng Workers Custom Domains để trỏ `tempmail.<domain>` vào worker (tự tạo DNS + SSL).

### Secrets & Vars
| Tên | Loại | Dùng cho |
|---|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Secret | Đăng nhập `/admin` |
| `SESSION_SECRET` | Secret | Ký cookie phiên (HMAC) |
| `CF_API_TOKEN` | Secret | Liệt kê domain cho `/zones` (chỉ cần **Zone:Read**) |
| `VIEW_TOKEN` | Secret (legacy) | Không còn bắt buộc ở chế độ công khai |
| `LOG_RETENTION_DAYS` | Var | Số ngày giữ thư (mặc định `7`) |
| `MAX_MESSAGES_PER_MAILBOX` | Var | Giới hạn thư trả về mỗi hộp (mặc định `100`) |

---

## 🐍 Tích hợp automation (ví dụ, không cần token)

```python
import requests, time

BASE = "https://read-icloud-mail-worker.tranminhquang-tmq9999.workers.dev"

def get_latest_otp(mail, after=None, retries=10, delay=3.0):
    params = {"mail": mail, "scan": 10}
    if after:
        params["after"] = after
    for _ in range(retries):
        data = requests.get(f"{BASE}/otp", params=params).json()
        if data.get("otp"):
            return data["otp"]
        time.sleep(delay)
    return None

start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
# ... trigger signup/login tới địa chỉ tempmail ...
print("OTP:", get_latest_otp("a.d.min@gmail.com", after=start))
```

---

## 🛠️ Phát triển

```bash
npx wrangler dev      # chạy local
```

`public/index.html` và `src/admin_html.ts` đều **self-contained** (CSS/JS inline, vanilla, không build step). Sửa xong chạy `npx wrangler deploy`.

---

## 📜 Lịch sử thay đổi

- **UI redesign** — chuyển sang phong cách Apple Mail 3 khung (light).
- **Admin panel** — tracking địa chỉ + IP, dashboard, quản lý, bảo mật phiên + khóa IP.
- **Gmail tempmail** — dot-trick + plus-alias; mỗi biến thể là hộp thư riêng (khớp chính xác `recipient`).
- **Email đa nhà cung cấp** — thêm tài khoản gốc bất kỳ (Outlook/Hotmail, GMX, mail.com, libero.it, …); generator sinh +alias (Gmail thêm dot-trick).
- **Public mode** — bỏ VIEW_TOKEN/Worker URL ở client; đọc/tạo công khai, xóa toàn bộ chỉ trong admin.

## License

MIT
