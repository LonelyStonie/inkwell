# Inkwell v2 — Story Platform with Auth

Website chia sẻ và đọc truyện chữ, full-stack với **React + Node.js + MySQL**.
**Phiên bản 2.0** bổ sung hệ thống **đăng ký / đăng nhập** và **phân quyền Admin**.

```
inkwell-project/
├── backend/         ← Node.js + Express + MySQL + JWT Auth
└── frontend/        ← React + Vite UI with auth system
```

---

## 🔐 Hệ thống phân quyền (MỚI)

| Vai trò | Đọc truyện | Đăng truyện | Thêm chương | Xóa truyện | Quản lý users |
|---|---|---|---|---|---|
| **Guest** (chưa đăng nhập) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User** (đã đăng ký) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |

### ⭐ Quan trọng: User đầu tiên đăng ký sẽ tự động thành Admin

Không cần tạo admin thủ công. Sau khi chạy hệ thống lần đầu, **người nào đăng ký username trước** (thường là bạn) sẽ có role `admin`. Các user sau đăng ký sẽ là `user` thường, và admin có thể promote họ lên admin trong **Admin Dashboard**.

---

## 🛠️ Yêu cầu cài đặt

- **Node.js** (>= 18) — https://nodejs.org
- **MySQL Server** + **MySQL Workbench**
- **Visual Studio Code**

---

## 📦 Bước 1 — Import database (v2)

⚠️ **Nếu bạn đã chạy v1 từ trước**: script mới sẽ **XÓA toàn bộ dữ liệu cũ** (truyện cũ) để migrate sang schema mới có bảng `users`. Hãy backup trước nếu cần.

1. Mở **MySQL Workbench** và kết nối đến MySQL Server
2. **File → Open SQL Script** → chọn `backend/database.sql`
3. Bấm ⚡ **Execute** để tạo schema mới

---

## 🚀 Bước 2 — Backend setup

```bash
cd backend
npm install      # Sẽ cài thêm bcryptjs, jsonwebtoken
```

**Tạo file `.env`:**

Trên Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

Mở file `.env` mới và sửa:
```env
DB_PASSWORD=mật_khẩu_mysql_của_bạn
JWT_SECRET=chuỗi_ngẫu_nhiên_dài_32_ký_tự_trở_lên
```

> 💡 **Generate JWT_SECRET an toàn**: Chạy lệnh sau trong terminal để tạo chuỗi ngẫu nhiên mạnh:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```
> Copy kết quả dán vào `JWT_SECRET=`

**Chạy server:**
```bash
npm run dev
```

Bạn sẽ thấy:
```
🚀 Server running on http://localhost:4000
🔐 Auth enabled. First user to register will become admin.
```

---

## 🎨 Bước 3 — Frontend setup

Mở terminal mới:
```bash
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

---

## 🎯 Bước 4 — Đăng ký admin đầu tiên (QUAN TRỌNG)

1. Mở `http://localhost:5173`
2. Bấm **"Sign up"** ở góc trên phải
3. Nhập username (ví dụ `truonganhquan`) và password (ít nhất 6 ký tự)
4. Vì bạn là user đầu tiên → hệ thống tự động gán role **admin** (toast sẽ báo "🎉 Welcome! You are the first user and became an admin")
5. Bạn sẽ thấy nút **"Publish"** và **"Admin"** xuất hiện trên header

Giờ bạn có thể:
- 📖 **Đăng truyện** với nút "Publish"
- ➕ **Thêm chương** vào truyện
- 🗑️ **Xóa truyện** bất kỳ
- 👑 **Quản lý users** trong Admin Dashboard (promote user lên admin, demote, xóa)

---

## 📡 API Endpoints mới (v2)

### Auth
| Method | Endpoint | Yêu cầu | Mô tả |
|--------|----------|---------|-------|
| POST | `/api/auth/register` | Public | Đăng ký tài khoản mới |
| POST | `/api/auth/login` | Public | Đăng nhập → nhận JWT |
| GET | `/api/auth/me` | Auth | Lấy thông tin user hiện tại |

### Admin (yêu cầu role = admin)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/admin/stats` | Thống kê tổng quan |
| GET | `/api/admin/users` | Danh sách tất cả users |
| PUT | `/api/admin/users/:id/role` | Đổi role (user ↔ admin) |
| DELETE | `/api/admin/users/:id` | Xóa user (cascade xóa luôn truyện của họ) |

### Stories & Chapters (đã thay đổi)
| Method | Endpoint | Yêu cầu |
|--------|----------|---------|
| GET | `/api/stories` | Public |
| GET | `/api/stories/:id` | Public |
| POST | `/api/stories` | **Admin only** |
| DELETE | `/api/stories/:id` | **Admin only** |
| PUT | `/api/stories/:id/banner` | **Admin only** |
| POST | `/api/stories/:id/chapters` | **Admin only** |

---

## 🗄️ Cấu trúc Database v2

**Bảng mới: `users`**
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | VARCHAR(50) | Primary key |
| username | VARCHAR(50) UNIQUE | Username duy nhất |
| password_hash | VARCHAR(255) | Hash bcrypt |
| role | ENUM('user', 'admin') | Vai trò |
| created_at | DATETIME | Ngày tạo |

**Bảng `stories` có thêm cột:**
| Cột mới | Kiểu | Ghi chú |
|---------|------|---------|
| user_id | VARCHAR(50) | FK → users.id (admin đã đăng) |

---

## 🔒 Bảo mật đã áp dụng

- ✅ **Mật khẩu được hash bằng bcrypt** (10 salt rounds) — không lưu plain text
- ✅ **JWT token expires sau 7 ngày** — buộc đăng nhập lại
- ✅ **Admin không thể tự demote/xóa bản thân** — tránh mất toàn bộ admin
- ✅ **Validate username** — chỉ chấp nhận chữ/số/underscore, 3-30 ký tự
- ✅ **Frontend lưu token trong localStorage** — tự động remember login
- ✅ **Tự động logout khi token invalid** — khi server restart hay đổi JWT_SECRET

---

## 🚧 Khắc phục sự cố thường gặp

**Backend báo "JWT_SECRET chưa được set"**: Sửa file `.env`, đặt `JWT_SECRET` thành chuỗi dài ít nhất 20 ký tự.

**Đăng ký bị báo "Username already taken"**: Username đã tồn tại, thử tên khác.

**Không thấy nút "Publish" sau khi đăng nhập**: Tài khoản của bạn là role `user`, không phải `admin`. Nếu bạn là admin đầu tiên nhưng vẫn không thấy, mở MySQL Workbench và chạy:
```sql
USE inkwell;
UPDATE users SET role = 'admin' WHERE username = 'your_username';
```

**Đăng nhập OK nhưng khi publish bị báo "Login required"**: Token hết hạn (7 ngày). Logout và login lại.

---

## 📌 Hướng phát triển tiếp theo

- 🖼️ Lưu banner lên Cloudinary (thay vì local uploads/)
- 💬 Bình luận theo chương
- ⭐ Like, bookmark, follow tác giả
- 🔔 Notification khi có chương mới
- 📧 Password reset qua email
- 🌍 Deploy lên Vercel + Railway
