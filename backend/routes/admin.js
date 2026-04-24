// routes/admin.js  (v2 - no chapters)
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// =====================================================
// GET /api/admin/stats - Platform overview
// =====================================================
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const [[usersRow]] = await db.query('SELECT COUNT(*) AS count FROM users');
    const [[adminsRow]] = await db.query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
    );
    const [[storiesRow]] = await db.query('SELECT COUNT(*) AS count FROM stories');
    const [[categoriesRow]] = await db.query('SELECT COUNT(*) AS count FROM categories');
    const [[subcatsRow]] = await db.query('SELECT COUNT(*) AS count FROM subcategories');
    const [[viewsRow]] = await db.query(
      'SELECT COALESCE(SUM(views), 0) AS total FROM stories'
    );

    res.json({
      totalUsers: Number(usersRow.count) || 0,
      totalAdmins: Number(adminsRow.count) || 0,
      totalStories: Number(storiesRow.count) || 0,
      totalCategories: Number(categoriesRow.count) || 0,
      totalSubcategories: Number(subcatsRow.count) || 0,
      totalViews: Number(viewsRow.total) || 0,
    });
  } catch (err) { next(err); }
});

// =====================================================
// GET /api/admin/users - List all users with story count
// =====================================================
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id, u.username, u.role, u.created_at,
        COUNT(s.id) AS story_count
      FROM users u
      LEFT JOIN stories s ON s.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.created_at,
      storyCount: Number(u.story_count) || 0,
    })));
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/admin/users/:id/role - Promote / demote a user
// =====================================================
router.put('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'user' or 'admin'" });
    }

    // Prevent admin from demoting themselves (would lock out access)
    if (req.params.id === req.user.id && role === 'user') {
      return res.status(400).json({ error: "You can't demote yourself" });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ success: true, id: req.params.id, role });
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/admin/users/:id - Delete user and all their stories
// =====================================================
router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You can't delete yourself" });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    // Stories have ON DELETE CASCADE so they'll be removed automatically
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
