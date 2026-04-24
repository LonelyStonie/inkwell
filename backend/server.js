// server.js (v2 - redesign)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { attachUser } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const storiesRouter = require('./routes/stories');
const categoriesRouter = require('./routes/categories');
const subcategoriesRouter = require('./routes/subcategories');

const app = express();
const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) {
  console.error('❌ JWT_SECRET chưa được set hoặc quá ngắn. Hãy sửa trong file .env');
  process.exit(1);
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// =====================================================
// CORS — linh hoạt với Vercel subdomain
// =====================================================
const frontendUrlEnv = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();
const allowAllOrigins = frontendUrlEnv === '*';
const allowedOrigins = frontendUrlEnv.split(',').map(s => s.trim()).filter(Boolean);

console.log('🌐 CORS config:', allowAllOrigins ? 'ALLOW ALL ORIGINS (*)' : allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowAllOrigins) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
    console.warn('⚠️ CORS blocked:', origin);
    callback(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(attachUser);

app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// Health check
app.get('/', (req, res) => {
  res.json({ name: 'TheTaleDistrict API', status: 'running', version: '2.0.0-redesign' });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/subcategories', subcategoriesRouter);

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
  console.log(`📚 API v2 - redesign with categories/subcategories`);
});
