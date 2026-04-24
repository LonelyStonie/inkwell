// routes/stories.js  (v2 - oneshot, views, featured, subcategory)
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

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary credentials missing. Banner upload will fail.');
} else {
  console.log('☁️  Cloudinary configured:', process.env.CLOUDINARY_CLOUD_NAME);
}

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'inkwell/banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      { width: 1600, height: 900, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
    public_id: () => `banner-${Date.now()}-${uuidv4().slice(0, 8)}`,
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

// =====================================================
// HELPERS
// =====================================================
function extractPublicId(url) {
  if (!url) return null;
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch { return null; }
}

async function deleteCloudinaryImage(url) {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try { await cloudinary.uploader.destroy(publicId); }
  catch (err) { console.error('Cloudinary delete failed:', err.message); }
}

const formatStory = (row) => ({
  id: row.id,
  title: row.title,
  author: row.author,
  excerpt: row.excerpt || '',
  content: row.content || '',
  description: row.description || '',
  coverColor: row.cover_color,
  bannerUrl: row.banner_url || null,
  views: Number(row.views) || 0,
  featured: Boolean(row.featured),
  category: row.category_name ? {
    id: row.category_id,
    name: row.category_name,
    slug: row.category_slug,
  } : null,
  subcategory: row.subcategory_id ? {
    id: row.subcategory_id,
    name: row.subcategory_name,
    slug: row.subcategory_slug,
  } : null,
  postedBy: row.posted_by || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Base query for stories with joined category/subcategory info
const STORY_SELECT = `
  SELECT 
    s.*,
    u.username AS posted_by,
    sub.name AS subcategory_name,
    sub.slug AS subcategory_slug,
    cat.id   AS category_id,
    cat.name AS category_name,
    cat.slug AS category_slug
  FROM stories s
  LEFT JOIN users u ON s.user_id = u.id
  LEFT JOIN subcategories sub ON s.subcategory_id = sub.id
  LEFT JOIN categories cat ON sub.category_id = cat.id
`;

// =====================================================
// GET /api/stories - Public
// Query params:
//   ?category=stories&subcategory=fantasy
//   ?featured=true
//   ?sort=popular | latest (default: latest)
//   ?limit=10
// =====================================================
router.get('/', async (req, res, next) => {
  try {
    const { category, subcategory, featured, sort = 'latest', limit } = req.query;
    const conditions = [];
    const params = [];

    if (category) {
      conditions.push('cat.slug = ?');
      params.push(category);
    }
    if (subcategory) {
      conditions.push('sub.slug = ?');
      params.push(subcategory);
    }
    if (featured === 'true') {
      conditions.push('s.featured = TRUE');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = sort === 'popular'
      ? 'ORDER BY s.views DESC, s.created_at DESC'
      : 'ORDER BY s.created_at DESC';
    const limitClause = limit && !isNaN(Number(limit)) ? `LIMIT ${Number(limit)}` : '';

    const [rows] = await db.query(
      `${STORY_SELECT} ${whereClause} ${orderClause} ${limitClause}`,
      params
    );
    res.json(rows.map(formatStory));
  } catch (err) { next(err); }
});

// =====================================================
// GET /api/stories/:id - Public
// =====================================================
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    res.json(formatStory(rows[0]));
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/stories/:id/view - Public, tăng view counter
// =====================================================
router.post('/:id/view', async (req, res, next) => {
  try {
    await db.query('UPDATE stories SET views = views + 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/stories - ADMIN ONLY — Tạo truyện mới (oneshot)
// =====================================================
router.post('/', requireAdmin, upload.single('banner'), async (req, res, next) => {
  try {
    const { title, author, subcategoryId, excerpt, content, description, featured } = req.body;
    if (!title || !author || !content) {
      if (req.file) await deleteCloudinaryImage(req.file.path);
      return res.status(400).json({ error: 'title, author, and content are required' });
    }

    if (subcategoryId) {
      const [subs] = await db.query('SELECT id FROM subcategories WHERE id = ?', [subcategoryId]);
      if (subs.length === 0) {
        if (req.file) await deleteCloudinaryImage(req.file.path);
        return res.status(400).json({ error: 'Invalid subcategoryId' });
      }
    }

    const id = 'story_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
    const bannerUrl = req.file ? req.file.path : null;

    await db.query(
      `INSERT INTO stories 
        (id, user_id, title, author, subcategory_id, description, excerpt, content, cover_color, banner_url, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.user.id, title.trim(), author.trim(),
        subcategoryId || null,
        (description || '').trim(),
        (excerpt || '').trim(),
        content.trim(),
        coverColor, bannerUrl,
        featured === 'true' || featured === true ? 1 : 0,
      ]
    );

    const [rows] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [id]);
    res.status(201).json(formatStory(rows[0]));
  } catch (err) {
    if (req.file && req.file.path) await deleteCloudinaryImage(req.file.path);
    next(err);
  }
});

// =====================================================
// PUT /api/stories/:id - ADMIN ONLY — Sửa truyện
// =====================================================
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { title, author, subcategoryId, excerpt, content, description, featured } = req.body;
    const [existing] = await db.query('SELECT id FROM stories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Story not found' });

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()); }
    if (author !== undefined) { fields.push('author = ?'); params.push(author.trim()); }
    if (subcategoryId !== undefined) { fields.push('subcategory_id = ?'); params.push(subcategoryId || null); }
    if (excerpt !== undefined) { fields.push('excerpt = ?'); params.push((excerpt || '').trim()); }
    if (content !== undefined) { fields.push('content = ?'); params.push(content.trim()); }
    if (description !== undefined) { fields.push('description = ?'); params.push((description || '').trim()); }
    if (featured !== undefined) { fields.push('featured = ?'); params.push(featured === 'true' || featured === true ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await db.query(`UPDATE stories SET ${fields.join(', ')} WHERE id = ?`, params);

    const [rows] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [req.params.id]);
    res.json(formatStory(rows[0]));
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/stories/:id - ADMIN ONLY
// =====================================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT banner_url FROM stories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    if (rows[0].banner_url) await deleteCloudinaryImage(rows[0].banner_url);
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
      await deleteCloudinaryImage(req.file.path);
      return res.status(404).json({ error: 'Story not found' });
    }
    if (rows[0].banner_url) await deleteCloudinaryImage(rows[0].banner_url);
    await db.query('UPDATE stories SET banner_url = ? WHERE id = ?', [req.file.path, req.params.id]);
    const [updated] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [req.params.id]);
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
    if (rows[0].banner_url) await deleteCloudinaryImage(rows[0].banner_url);
    await db.query('UPDATE stories SET banner_url = NULL WHERE id = ?', [req.params.id]);
    const [updated] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [req.params.id]);
    res.json(formatStory(updated[0]));
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/stories/:id/featured - ADMIN toggle featured
// =====================================================
router.put('/:id/featured', requireAdmin, async (req, res, next) => {
  try {
    const { featured } = req.body;
    await db.query('UPDATE stories SET featured = ? WHERE id = ?',
      [featured ? 1 : 0, req.params.id]);
    const [rows] = await db.query(`${STORY_SELECT} WHERE s.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Story not found' });
    res.json(formatStory(rows[0]));
  } catch (err) { next(err); }
});

module.exports = router;
