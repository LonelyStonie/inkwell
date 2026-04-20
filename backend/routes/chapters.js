// routes/chapters.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// =====================================================
// POST /api/stories/:storyId/chapters - CHỈ ADMIN
// =====================================================
router.post('/:storyId/chapters', requireAdmin, async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Chapter content is required' });
    }

    const [stories] = await db.query('SELECT id FROM stories WHERE id = ?', [req.params.storyId]);
    if (stories.length === 0) return res.status(404).json({ error: 'Story not found' });

    const [orderResult] = await db.query(
      'SELECT COALESCE(MAX(chapter_order), 0) + 1 AS next_order FROM chapters WHERE story_id = ?',
      [req.params.storyId]
    );
    const nextOrder = orderResult[0].next_order;

    const id = 'ch_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const finalTitle = (title && title.trim()) || `Chapter ${nextOrder}`;

    await db.query(
      `INSERT INTO chapters (id, story_id, title, content, chapter_order) VALUES (?, ?, ?, ?, ?)`,
      [id, req.params.storyId, finalTitle, content.trim(), nextOrder]
    );

    const [rows] = await db.query('SELECT * FROM chapters WHERE id = ?', [id]);
    res.status(201).json({
      id: rows[0].id, title: rows[0].title, content: rows[0].content,
      order: rows[0].chapter_order, createdAt: rows[0].created_at,
    });
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/stories/:storyId/chapters/:chapterId - CHỈ ADMIN
// =====================================================
router.delete('/:storyId/chapters/:chapterId', requireAdmin, async (req, res, next) => {
  try {
    const [result] = await db.query(
      'DELETE FROM chapters WHERE id = ? AND story_id = ?',
      [req.params.chapterId, req.params.storyId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Chapter not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
