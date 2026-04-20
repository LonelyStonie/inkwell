// routes/admin.js
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin); // Tất cả route đều cần admin

// =====================================================
// GET /api/admin/stats - Thống kê tổng quan
// =====================================================
router.get('/stats', async (req, res, next) => {
  try {
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalAdmins }]] = await db.query("SELECT COUNT(*) AS totalAdmins FROM users WHERE role = 'admin'");
    const [[{ totalStories }]] = await db.query('SELECT COUNT(*) AS totalStories FROM stories');
    const [[{ totalChapters }]] = await db.query('SELECT COUNT(*) AS totalChapters FROM chapters');

    res.json({ totalUsers, totalAdmins, totalStories, totalChapters });
  } catch (err) { next(err); }
});

// =====================================================
// GET /api/admin/users - Danh sách tất cả users
// =====================================================
router.get('/users', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.username, u.role, u.created_at,
        (SELECT COUNT(*) FROM stories WHERE user_id = u.id) AS story_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(rows.map(r => ({
      id: r.id,
      username: r.username,
      role: r.role,
      storyCount: Number(r.story_count),
      createdAt: r.created_at,
    })));
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/admin/users/:id/role - Đổi role của user
// =====================================================
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "admin"' });
    }

    // Không cho admin tự demote chính mình (tránh mất hết admin)
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote yourself' });
    }

    const [result] = await db.query(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/admin/users/:id - Xóa user (kèm theo truyện của họ)
// =====================================================
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete yourself' });
    }
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
