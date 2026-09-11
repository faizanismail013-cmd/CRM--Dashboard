/**
 * SmartPay CRM — Products / Services Routes
 * CRUD operations for the product catalog
 */

const express = require('express');
const router = express.Router();
const { requireAuth, rbacFilter } = require('../middleware/auth');
const crmStore = require('../crm-store');

// ─── List Products (paginated, searchable) ──────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '', category = '' } = req.query;
    const filters = {};
    if (category && category !== 'all') filters.category = category;

    const result = await crmStore.listPaginated('products', {
      page: Number(page),
      limit: Number(limit),
      search,
      searchFields: ['name', 'sku', 'description', 'category'],
      filters,
      sort: 'id',
      order: 'desc'
    });

    // Filter out inactive if needed
    res.json(result);
  } catch (error) { next(error); }
});

// ─── Get Single Product ─────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const product = await crmStore.findById('products', req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) { next(error); }
});

// ─── Create Product ─────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, sku, description, unit_price, currency, category } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const userId = req.user?.id || null;
    const product = await crmStore.create('products', {
      name: String(name).trim(),
      sku: sku ? String(sku).trim() : null,
      description: description ? String(description).trim() : null,
      unit_price: Number(unit_price) || 0,
      currency: currency || 'INR',
      category: category ? String(category).trim() : null,
      is_active: true,
      user_id: userId
    });

    res.status(201).json(product);
  } catch (error) { next(error); }
});

// ─── Update Product ─────────────────────────────────────────────────

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'sku', 'description', 'unit_price', 'currency', 'category', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
      }
    }
    if (updates.unit_price !== undefined) updates.unit_price = Number(updates.unit_price) || 0;

    const product = await crmStore.update('products', req.params.id, updates);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) { next(error); }
});

// ─── Delete (soft-delete) Product ───────────────────────────────────

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    // Soft delete — set is_active = false
    const product = await crmStore.update('products', req.params.id, { is_active: false });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, message: 'Product archived' });
  } catch (error) { next(error); }
});

module.exports = router;
