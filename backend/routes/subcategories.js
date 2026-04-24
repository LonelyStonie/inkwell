// routes/subcategories.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const makeSlug = (name) =>
  name.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

// =====================================================
// POST /api/subcategories - ADMIN tạo subcategory mới
// =====================================================
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { categoryId, name, displayOrder } = req.body;
    if (!categoryId || !name || !name.trim()) {
      return res.status(400).json({ error: 'categoryId and name are required' });
    }

    // Check category tồn tại
    const [cats] = await db.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
    if (cats.length === 0) return res.status(404).json({ error: 'Category not found' });

    const id = 'sub_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const slug = makeSlug(name);

    // Check slug trùng trong cùng category
    const [dup] = await db.query(
      'SELECT id FROM subcategories WHERE category_id = ? AND slug = ?',
      [categoryId, slug]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: 'A subcategory with this name already exists in this category' });
    }

    await db.query(
      'INSERT INTO subcategories (id, category_id, name, slug, display_order) VALUES (?, ?, ?, ?, ?)',
      [id, categoryId, name.trim(), slug, Number(displayOrder) || 0]
    );
    const [rows] = await db.query('SELECT * FROM subcategories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// =====================================================
// PUT /api/subcategories/:id - ADMIN sửa subcategory
// =====================================================
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name, displayOrder, categoryId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const [existing] = await db.query('SELECT * FROM subcategories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Subcategory not found' });

    const slug = makeSlug(name);
    const newCategoryId = categoryId || existing[0].category_id;

    // Check slug trùng
    const [dup] = await db.query(
      'SELECT id FROM subcategories WHERE category_id = ? AND slug = ? AND id != ?',
      [newCategoryId, slug, req.params.id]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: 'A subcategory with this name already exists' });
    }

    await db.query(
      'UPDATE subcategories SET name = ?, slug = ?, display_order = ?, category_id = ? WHERE id = ?',
      [name.trim(), slug, Number(displayOrder) || 0, newCategoryId, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM subcategories WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// =====================================================
// DELETE /api/subcategories/:id - ADMIN xóa subcategory
// =====================================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const [existing] = await db.query('SELECT id FROM subcategories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Subcategory not found' });

    await db.query('DELETE FROM subcategories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
