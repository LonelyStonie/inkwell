// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { attachUser } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const storiesRouter = require('./routes/stories');
const chaptersRouter = require('./routes/chapters');

const app = express();
const PORT = process.env.PORT || 4000;

// Check JWT_SECRET
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) {
  console.error('❌ JWT_SECRET chưa được set hoặc quá ngắn. Hãy sửa trong file .env');
  process.exit(1);
}

// Đảm bảo thư mục uploads tồn tại
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// =====================================================
// CORS configuration — linh hoạt hơn
// =====================================================
// Parse FRONTEND_URL — hỗ trợ:
// - Dấu "*" → cho phép mọi origin
// - Nhiều URL cách nhau bởi dấu phẩy
// - Tự động cho phép tất cả *.vercel.app (để tránh phải update khi Vercel tạo URL mới)
const frontendUrlEnv = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
const allowAllOrigins = frontendUrlEnv === '*';
const allowedOrigins = frontendUrlEnv.split(',').map(s => s.trim()).filter(Boolean);

console.log('🌐 CORS config:', allowAllOrigins ? 'ALLOW ALL ORIGINS (*)' : allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Cho phép các tool như Postman (không gửi origin)
    if (!origin) return callback(null, true);
    // Nếu set FRONTEND_URL=*, cho phép mọi origin
    if (allowAllOrigins) return callback(null, true);
    // Nếu origin nằm trong whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Tự động cho phép tất cả *.vercel.app (tiện lợi cho Vercel preview URLs)
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
    // Từ chối
    console.warn('⚠️ CORS blocked:', origin);
    callback(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Attach user info from JWT nếu có (đặt trước tất cả routes)
app.use(attachUser);

// Phục vụ ảnh static
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// Health check
app.get('/', (req, res) => {
  res.json({ name: 'Inkwell API', status: 'running', version: '2.0.0' });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/stories', chaptersRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Max 5MB.' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads served from /uploads`);
  console.log(`🔐 Auth enabled. First user to register will become admin.`);
});
