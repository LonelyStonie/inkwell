// routes/stories.js
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const COVER_COLORS = [
  'from-amber-700 to-orange-900', 'from-rose-700 to-pink-900',
  'from-emerald-700 to-teal-900', 'from-indigo-700 to-purple-900',
  'from-slate-700 to-gray-900', 'from-red-800 to-rose-950',
  'from-blue-700 to-indigo-900', 'from-yellow-700 to-amber-900',
];

// =====================================================
// CLOUDINARY CONFIG
// =====================================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Validate credentials on startup
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary credentials missing. Banner upload will fail.');
} else {
  console.log('☁️  Cloudinary configured:', process.env.CLOUDINARY_CLOUD_NAME);
}

// =====================================================
// MULTER CONFIG — Upload directly to Cloudinary
// =====================================================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'inkwell/banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    // Tự động resize & nén để tiết kiệm bandwidth
    transformation: [
      { width: 800, height: 1200, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
    public_id: () => `banner-${Date.now()}-${uuidv4().slice(0, 8)}`,
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// =====================================================
// HELPERS
// =====================================================
// Extract public_id từ Cloudinary URL để có thể xóa sau này
// VD: https://res.cloudinary.com/xxx/image/upload/v123/inkwell/banners/banner-abc.jpg
//      → inkwell/banners/banner-abc
function extractPublicId(url) {
  if (!url) return null;
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function deleteCloudinaryImage(url) {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary delete failed:', err.message);
  }
}

const formatStory = (row, chapterCount = 0) => ({
  id: row.id,
  title: row.title,
  author: row.author,
  genre: row.genre,
  description: row.description || '',
  coverColor: row.cover_color,
  bannerUrl: row.banner_url || null,
  chapterCount: Number(chapterCount),
  createdAt: row.created_at,
  postedBy: row.posted_by || null,
});

// =====================================================
// GET /api/stories - Public
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
    res.json(rows.map(r => formatStory(r, r.chapter_count)));
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
      ...formatStory(stories[0], chapters.length),
      chapters: chapters.map(c => ({
        id: c.id, title: c.title, content: c.content,
        order: c.chapter_order, createdAt: c.created_at,
      })),
    });
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/stories - ADMIN ONLY — Upload banner lên Cloudinary
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
    // Cloudinary trả về URL trong req.file.path
    const bannerUrl = req.file ? req.file.path : null;

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO stories (id, user_id, title, author, genre, description, cover_color, banner_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, title.trim(), author.trim(), genre.trim(),
       (description || '').trim(), coverColor, bannerUrl]
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
    res.status(201).json(formatStory(rows[0], firstChapterContent ? 1 : 0));
  } catch (err) {
    await conn.rollback();
    // Nếu lỗi và đã upload ảnh lên Cloudinary, xóa đi tránh rác
    if (req.file && req.file.path) {
      await deleteCloudinaryImage(req.file.path);
    }
    next(err);
  } finally {
    conn.release();
  }
});

// =====================================================
// DELETE /api/stories/:id - ADMIN ONLY
// =====================================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT banner_url FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });

    // Xóa ảnh trên Cloudinary
    if (rows[0].banner_url) {
      await deleteCloudinaryImage(rows[0].banner_url);
    }
    await db.query('DELETE FROM stories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/stories/:id/banner - ADMIN ONLY
// =====================================================
router.put('/:id/banner', requireAdmin, upload.single('banner'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No banner file uploaded' });
    const [rows] = await db.query('SELECT banner_url FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      // Clean up upload vì update thất bại
      await deleteCloudinaryImage(req.file.path);
      return res.status(404).json({ error: 'Story not found' });
    }

    // Xóa banner cũ trên Cloudinary
    if (rows[0].banner_url) {
      await deleteCloudinaryImage(rows[0].banner_url);
    }
    await db.query('UPDATE stories SET banner_url = ? WHERE id = ?', [req.file.path, req.params.id]);
    const [updated] = await db.query('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    res.json(formatStory(updated[0]));
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/stories/:id/banner - ADMIN ONLY
// =====================================================
router.delete('/:id/banner', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT banner_url FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    if (rows[0].banner_url) {
      await deleteCloudinaryImage(rows[0].banner_url);
    }
    await db.query('UPDATE stories SET banner_url = NULL WHERE id = ?', [req.params.id]);
    const [updated] = await db.query('SELECT * FROM stories WHERE id = ?', [req.params.id]);
    res.json(formatStory(updated[0]));
  } catch (err) { next(err); }
});

module.exports = router;
