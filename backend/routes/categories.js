// routes/categories.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Tạo slug từ tên (lowercase, dashes)
const makeSlug = (name) =>
  name.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// =====================================================
// GET /api/categories - Public (lấy categories + subcategories cho nav menu)
// =====================================================
router.get('/', async (req, res, next) => {
  try {
    const [categories] = await db.query(
      'SELECT id, name, slug, display_order FROM categories ORDER BY display_order ASC, name ASC'
    );
    const [subcategories] = await db.query(
      'SELECT id, category_id, name, slug, display_order FROM subcategories ORDER BY display_order ASC, name ASC'
    );

    // Gắn subcategories vào từng category
    const result = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      displayOrder: cat.display_order,
      subcategories: subcategories
        .filter(sub => sub.category_id === cat.id)
        .map(sub => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          displayOrder: sub.display_order,
        })),
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// =====================================================
// POST /api/categories - ADMIN tạo category mới
// =====================================================
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, displayOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const id = 'cat_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const slug = makeSlug(name);

    // Check slug trùng
    const [existing] = await db.query('SELECT id FROM categories WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }

    await db.query(
      'INSERT INTO categories (id, name, slug, display_order) VALUES (?, ?, ?, ?)',
      [id, name.trim(), slug, Number(displayOrder) || 0]
    );
    const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/categories/:id - ADMIN sửa category
// =====================================================
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, displayOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const slug = makeSlug(name);

    // Check tồn tại
    const [existing] = await db.query('SELECT id FROM categories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Category not found' });

    // Check slug trùng (trừ chính nó)
    const [dup] = await db.query(
      'SELECT id FROM categories WHERE slug = ? AND id != ?',
      [slug, req.params.id]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }

    await db.query(
      'UPDATE categories SET name = ?, slug = ?, display_order = ? WHERE id = ?',
      [name.trim(), slug, Number(displayOrder) || 0, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/categories/:id - ADMIN xóa category
// (Subcategories và stories thuộc category sẽ CASCADE DELETE / SET NULL)
// =====================================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [existing] = await db.query('SELECT id FROM categories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Category not found' });

    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
