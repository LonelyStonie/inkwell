// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * attachUser: Nếu có JWT hợp lệ trong header, gắn req.user.
 * KHÔNG báo lỗi nếu không có token — cho phép guest truy cập.
 * Dùng như middleware toàn cục.
 */
async function attachUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7); // bỏ "Bearer "
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      'SELECT id, username, role, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (rows.length) req.user = rows[0];
  } catch (err) {
    // Token invalid/expired — ignore, treat as guest
  }
  next();
}

/** requireAuth: Yêu cầu đã đăng nhập */
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

/** requireAdmin: Yêu cầu role = admin */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
