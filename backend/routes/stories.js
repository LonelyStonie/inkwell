// routes/stories.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const COVER_COLORS = [
  'from-amber-700 to-orange-900', 'from-rose-700 to-pink-900',
  'from-emerald-700 to-teal-900', 'from-indigo-700 to-purple-900',
  'from-slate-700 to-gray-900', 'from-red-800 to-rose-950',
  'from-blue-700 to-indigo-900', 'from-yellow-700 to-amber-900',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `banner-${Date.now()}-${uuidv4().slice(0, 8)}${safeExt}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const buildBannerUrl = (req, filename) =>
  filename ? `${req.protocol}://${req.get('host')}/uploads/${filename}` : null;

const formatStory = (req, row, chapterCount = 0) => ({
  id: row.id,
  title: row.title,
  author: row.author,
  genre: row.genre,
  description: row.description || '',
  coverColor: row.cover_color,
  bannerUrl: buildBannerUrl(req, row.banner_filename),
  chapterCount: Number(chapterCount),
  createdAt: row.created_at,
  postedBy: row.posted_by || null,
});

// =====================================================
// GET /api/stories - Public (guest được xem)
// =====================================================
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, u.username AS posted_by, COUNT(c.id) AS chapter_count
      FROM stories s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN chapters c ON c.story_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json(rows.map(r => formatStory(req, r, r.chapter_count)));
  } catch (err) { next(err); }
});

// =====================================================
// GET /api/stories/:id - Public
// =====================================================
router.get('/:id', async (req, res, next) => {
  try {
    const [stories] = await db.query(`
      SELECT s.*, u.username AS posted_by
      FROM stories s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [req.params.id]);
    if (stories.length === 0) return res.status(404).json({ error: 'Story not found' });

    const [chapters] = await db.query(
      'SELECT id, title, content, chapter_order, created_at FROM chapters WHERE story_id = ? ORDER BY chapter_order ASC',
      [req.params.id]
    );

    res.json({
      ...formatStory(req, stories[0], chapters.length),
      chapters: chapters.map(c => ({
        id: c.id, title: c.title, content: c.content,
        order: c.chapter_order, createdAt: c.created_at,
      })),
    });
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/stories - CHỈ ADMIN
// =====================================================
router.post('/', requireAdmin, upload.single('banner'), async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { title, author, genre, description, firstChapterTitle, firstChapterContent } = req.body;
    if (!title || !author || !genre) {
      return res.status(400).json({ error: 'title, author, and genre are required' });
    }

    const id = 'story_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
    const bannerFilename = req.file ? req.file.filename : null;

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO stories (id, user_id, title, author, genre, description, cover_color, banner_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, title.trim(), author.trim(), genre.trim(),
       (description || '').trim(), coverColor, bannerFilename]
    );

    if (firstChapterContent && firstChapterContent.trim()) {
      const chapterId = 'ch_' + uuidv4().replace(/-/g, '').slice(0, 16);
      await conn.query(
        `INSERT INTO chapters (id, story_id, title, content, chapter_order) VALUES (?, ?, ?, ?, ?)`,
        [chapterId, id, (firstChapterTitle || 'Chapter 1').trim(), firstChapterContent.trim(), 1]
      );
    }
    await conn.commit();

    const [rows] = await conn.query(`
      SELECT s.*, u.username AS posted_by FROM stories s
      LEFT JOIN users u ON s.user_id = u.id WHERE s.id = ?
    `, [id]);
    res.status(201).json(formatStory(req, rows[0], firstChapterContent ? 1 : 0));
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// =====================================================
// DELETE /api/stories/:id - CHỈ ADMIN
// =====================================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT banner_filename FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });

    if (rows[0].banner_filename) {
      const filePath = path.join(__dirname, '..', 'uploads', rows[0].banner_filename);
      fs.unlink(filePath, () => {});
    }
    await db.query('DELETE FROM stories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/stories/:id/banner - CHỈ ADMIN
// =====================================================
router.put('/:id/banner', requireAdmin, upload.single('banner'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No banner file uploaded' });
    const [rows] = await db.query('SELECT banner_filename FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });

    if (rows[0].banner_filename) {
      fs.unlink(path.join(__dirname, '..', 'uploads', rows[0].banner_filename), () => {});
    }
    await db.query('UPDATE stories SET banner_filename = ? WHERE id = ?', [req.file.filename, req.params.id]);
    const [updated] = await db.query('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    res.json(formatStory(req, updated[0]));
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/stories/:id/banner - CHỈ ADMIN
// =====================================================
router.delete('/:id/banner', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT banner_filename FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    if (rows[0].banner_filename) {
      fs.unlink(path.join(__dirname, '..', 'uploads', rows[0].banner_filename), () => {});
    }
    await db.query('UPDATE stories SET banner_filename = NULL WHERE id = ?', [req.params.id]);
    const [updated] = await db.query('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    res.json(formatStory(req, updated[0]));
  } catch (err) { next(err); }
});

module.exports = router;
