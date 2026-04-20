// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Validate username: 3-30 chars, chỉ chữ/số/dấu gạch dưới
const isValidUsername = (u) => /^[a-zA-Z0-9_]{3,30}$/.test(u);

// =====================================================
// POST /api/auth/register
// User ĐẦU TIÊN đăng ký sẽ tự động thành admin
// =====================================================
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: 'Username must be 3-30 characters, only letters, numbers, and underscores'
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Kiểm tra trùng username
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ?',
      [cleanUsername]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Nếu đây là user đầu tiên → tự động thành admin
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM users');
    const role = total === 0 ? 'admin' : 'user';

    // Hash password
    const id = 'user_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
      [id, cleanUsername, passwordHash, role]
    );

    const token = signToken(id);
    res.status(201).json({
      token,
      user: { id, username: cleanUsername, role },
      isFirstUser: role === 'admin',
    });
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/auth/login
// =====================================================
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const [rows] = await db.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = ?',
      [cleanUsername]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) { next(err); }
});

// =====================================================
// GET /api/auth/me - Lấy thông tin user hiện tại
// =====================================================
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
