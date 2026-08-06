require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { sendOrderConfirmation, notifyAdminNewOrder } = require('./bot');

const app = express();
const pool = require('./database');

// ─── Cloudinary Config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'shop-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ─── Cloudinary Storage ───────────────────────────────────────────────────────
const makeCloudStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `shop/${folder}`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files allowed!'), false);
};

const uploadProducts = multer({ storage: makeCloudStorage('products'), fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadQR       = multer({ storage: makeCloudStorage('qr'),       fileFilter: imageFilter, limits: { fileSize: 5  * 1024 * 1024 } });
const uploadLogo     = multer({ storage: makeCloudStorage('logo'),     fileFilter: imageFilter, limits: { fileSize: 5  * 1024 * 1024 } });

// Helper: delete image from Cloudinary
async function deleteCloudinaryImage(url) {
  if (!url || url.startsWith('/uploads')) return;
  try {
    const parts = url.split('/');
    const filename = parts[parts.length - 1].split('.')[0];
    const folder = parts[parts.length - 2];
    const publicId = `shop/${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId);
  } catch(e) { /* ignore */ }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/product/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'product.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ─── TEMP: Reset admin password ──────────────────────
app.get('/api/setup-admin', async (req, res) => {
  try {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query(`
      INSERT INTO admin (username, password) 
      VALUES ('admin', $1)
      ON CONFLICT (username) DO UPDATE SET password = $1
    `, [hash]);
    res.json({ success: true, message: 'Admin reset: username=admin, password=admin123' });
  } catch(e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── API: Shop Settings (Public) ─────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_settings LIMIT 1');
    res.json({ success: true, data: result.rows[0] || null });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Products (Public) ───────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT p.*,
        (SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1) as main_image
      FROM products p
      WHERE p.is_active = 1
    `;
    const params = [];
    if (category && category !== 'all') {
      params.push(category);
      query += ` AND p.category = $1`;
    }
    query += ` ORDER BY p.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = 1', [req.params.id]);
    if (product.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    const images = await pool.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_main DESC, sort_order ASC', [req.params.id]);
    res.json({ success: true, data: { ...product.rows[0], images: images.rows } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Update Banner ───────────────────────────────────────────────────────
app.post('/api/banner', async (req, res) => {
  if (!req.session || !req.session.adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const { banner_title, banner_desc } = req.body;
    await pool.query('UPDATE shop_settings SET banner_title=$1, banner_desc=$2, updated_at=CURRENT_TIMESTAMP', [banner_title || '', banner_desc || '']);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin Login/Logout ──────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.json({ success: false, message: 'Username ឬ Password មិនត្រឹមត្រូវ!' });
    }
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    res.json({ success: true, message: 'Login successful' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.adminId) {
    res.json({ success: true, username: req.session.username });
  } else {
    res.json({ success: false });
  }
});

// ─── API: Admin - Products ────────────────────────────────────────────────────
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1) as main_image,
        (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) as image_count
      FROM products p
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/admin/products', requireAuth, (req, res) => {
  uploadProducts.fields([{ name: 'images', maxCount: 10 }])(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const { name, description, price, currency, account_name, account_number, bank_name, phone_number, page_link, telegram_link, discount, category } = req.body;
      if (!name || !price) return res.status(400).json({ success: false, message: 'ឈ្មោះ និងតម្លៃត្រូវការ!' });

      const result = await pool.query(`
        INSERT INTO products (name, description, price, currency, bank_name, account_name, account_number, phone_number, page_link, telegram_link, discount, category)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id
      `, [name, description || '', parseFloat(price), currency || 'USD', bank_name || '', account_name || '', account_number || '', phone_number || '', page_link || '', telegram_link || '', parseInt(discount) || 0, category || 'all']);

      const productId = result.rows[0].id;

      const imageFiles = (req.files && req.files.images) ? req.files.images : [];
      for (let i = 0; i < imageFiles.length; i++) {
        const imgUrl = imageFiles[i].path || `/uploads/products/${imageFiles[i].filename}`;
        await pool.query(`INSERT INTO product_images (product_id, image_path, is_main, sort_order) VALUES ($1,$2,$3,$4)`,
          [productId, imgUrl, i === 0 ? 1 : 0, i]);
      }

      res.json({ success: true, message: 'Product បានបន្ថែម!', id: productId });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
  });
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, price, currency, account_name, account_number, bank_name, phone_number, page_link, telegram_link, discount, category, is_active } = req.body;
    await pool.query(`
      UPDATE products SET name=$1, description=$2, price=$3, currency=$4, bank_name=$5, account_name=$6,
        account_number=$7, phone_number=$8, page_link=$9, telegram_link=$10, discount=$11, category=$12,
        is_active=$13, updated_at=CURRENT_TIMESTAMP WHERE id=$14
    `, [name, description || '', parseFloat(price), currency || 'USD', bank_name || '', account_name || '',
        account_number || '', phone_number || '', page_link || '', telegram_link || '',
        parseInt(discount) || 0, category || 'all', is_active !== undefined ? is_active : 1, req.params.id]);
    res.json({ success: true, message: 'Product បានកែប្រែ!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (product.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

    const images = await pool.query('SELECT * FROM product_images WHERE product_id = $1', [req.params.id]);
    for (const img of images.rows) {
      await deleteCloudinaryImage(img.image_path);
    }
    if (product.rows[0].qr_image) await deleteCloudinaryImage(product.rows[0].qr_image);

    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Product បានលុប!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Upload QR ───────────────────────────────────────────────────
app.post('/api/admin/products/:id/qr', requireAuth, (req, res) => {
  uploadQR.single('qr')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    try {
      const product = await pool.query('SELECT qr_image FROM products WHERE id = $1', [req.params.id]);
      if (product.rows[0]?.qr_image) await deleteCloudinaryImage(product.rows[0].qr_image);
      const qrPath = req.file.path || `/uploads/qr/${req.file.filename}`;
      await pool.query('UPDATE products SET qr_image=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [qrPath, req.params.id]);
      res.json({ success: true, message: 'QR បានបញ្ចូល!', qr_image: qrPath });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
  });
});

// ─── API: Admin - Upload More Images ─────────────────────────────────────────
app.post('/api/admin/products/:id/images', requireAuth, (req, res) => {
  uploadProducts.fields([{ name: 'images', maxCount: 10 }])(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const imageFiles = (req.files && req.files.images) ? req.files.images : [];
      if (imageFiles.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });

      const countRes = await pool.query('SELECT COUNT(*) as count FROM product_images WHERE product_id = $1', [req.params.id]);
      const existingCount = parseInt(countRes.rows[0].count);

      for (let i = 0; i < imageFiles.length; i++) {
        const imgUrl = imageFiles[i].path || `/uploads/products/${imageFiles[i].filename}`;
        await pool.query(`INSERT INTO product_images (product_id, image_path, is_main, sort_order) VALUES ($1,$2,$3,$4)`,
          [req.params.id, imgUrl, existingCount === 0 && i === 0 ? 1 : 0, existingCount + i]);
      }
      res.json({ success: true, message: 'រូបភាពបានបន្ថែម!' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
  });
});

app.delete('/api/admin/images/:id', requireAuth, async (req, res) => {
  try {
    const image = await pool.query('SELECT * FROM product_images WHERE id = $1', [req.params.id]);
    if (image.rows.length === 0) return res.status(404).json({ success: false, message: 'Image not found' });
    await deleteCloudinaryImage(image.rows[0].image_path);
    await pool.query('DELETE FROM product_images WHERE id = $1', [req.params.id]);

    if (image.rows[0].is_main) {
      const first = await pool.query('SELECT id FROM product_images WHERE product_id = $1 LIMIT 1', [image.rows[0].product_id]);
      if (first.rows.length > 0) await pool.query('UPDATE product_images SET is_main = 1 WHERE id = $1', [first.rows[0].id]);
    }
    res.json({ success: true, message: 'រូបភាពបានលុប!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/admin/images/:id/main', requireAuth, async (req, res) => {
  try {
    const image = await pool.query('SELECT * FROM product_images WHERE id = $1', [req.params.id]);
    if (image.rows.length === 0) return res.status(404).json({ success: false, message: 'Image not found' });
    await pool.query('UPDATE product_images SET is_main = 0 WHERE product_id = $1', [image.rows[0].product_id]);
    await pool.query('UPDATE product_images SET is_main = 1 WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Main image updated!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Settings ────────────────────────────────────────────────────
app.get('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_settings LIMIT 1');
    res.json({ success: true, data: result.rows[0] || null });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  uploadLogo.single('logo')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const { shop_name, shop_description, shop_phone, shop_address, facebook_link, telegram_link, banner_title, banner_desc,
              tab4_name, tab4_icon, tab4_enabled, tab5_name, tab5_icon, tab5_enabled, tab6_name, tab6_icon, tab6_enabled } = req.body;
      const current = await pool.query('SELECT * FROM shop_settings LIMIT 1');
      let logoPath = current.rows[0]?.shop_logo || null;
      if (req.file) {
        if (logoPath) await deleteCloudinaryImage(logoPath);
        logoPath = req.file.path || `/uploads/logo/${req.file.filename}`;
      }
      await pool.query(`
        UPDATE shop_settings SET shop_name=$1, shop_description=$2, shop_phone=$3, shop_address=$4,
          shop_logo=$5, facebook_link=$6, telegram_link=$7, banner_title=$8, banner_desc=$9,
          tab4_name=$10, tab4_icon=$11, tab4_enabled=$12,
          tab5_name=$13, tab5_icon=$14, tab5_enabled=$15,
          tab6_name=$16, tab6_icon=$17, tab6_enabled=$18,
          updated_at=CURRENT_TIMESTAMP
      `, [shop_name, shop_description || '', shop_phone || '', shop_address || '', logoPath,
          facebook_link || '', telegram_link || '', banner_title || '', banner_desc || '',
          tab4_name || 'Tab 4', tab4_icon || 'fas fa-tag', tab4_enabled ? 1 : 0,
          tab5_name || 'Tab 5', tab5_icon || 'fas fa-tag', tab5_enabled ? 1 : 0,
          tab6_name || 'Tab 6', tab6_icon || 'fas fa-tag', tab6_enabled ? 1 : 0,
      ]);
      res.json({ success: true, message: 'Settings បានរក្សាទុក!' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
  });
});

// ─── API: Admin - Change Password ─────────────────────────────────────────────
app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await pool.query('SELECT * FROM admin WHERE id = $1', [req.session.adminId]);
    const admin = result.rows[0];
    if (!bcrypt.compareSync(current_password, admin.password)) {
      return res.json({ success: false, message: 'Password បច្ចុប្បន្នមិនត្រឹមត្រូវ!' });
    }
    const hashedNew = bcrypt.hashSync(new_password, 10);
    await pool.query('UPDATE admin SET password = $1 WHERE id = $2', [hashedNew, req.session.adminId]);
    res.json({ success: true, message: 'Password បានផ្លាស់ប្តូររួចហើយ!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Orders (Public) — Create Order ─────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    const { product_id, buyer_name, buyer_telegram, buyer_phone } = req.body;
    if (!product_id || !buyer_name || !buyer_telegram) {
      return res.status(400).json({ success: false, message: 'ព័ត៌មានមិនគ្រប់គ្រាន់!' });
    }

    // Get product info
    const productRes = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = 1', [product_id]);
    if (productRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    const p = productRes.rows[0];

    // Get main image
    const imgRes = await pool.query('SELECT image_path FROM product_images WHERE product_id = $1 AND is_main = 1 LIMIT 1', [product_id]);
    const productImage = imgRes.rows[0]?.image_path || null;

    // Calculate sale price
    const discount = parseInt(p.discount) || 0;
    const originalPrice = parseFloat(p.price);
    const salePrice = discount > 0 ? originalPrice * (1 - discount / 100) : originalPrice;

    // Save order
    const orderRes = await pool.query(`
      INSERT INTO orders (product_id, product_name, product_price, product_image, buyer_name, buyer_telegram, buyer_phone, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *
    `, [product_id, p.name, salePrice, productImage, buyer_name.trim(), buyer_telegram.trim().replace(/^@/, ''), buyer_phone || '']);

    const order = orderRes.rows[0];

    // Notify admin via Telegram
    const settingsRes = await pool.query('SELECT telegram_link FROM shop_settings LIMIT 1');
    const adminTelegram = settingsRes.rows[0]?.telegram_link?.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '') || null;
    const adminNotified = await notifyAdminNewOrder(order, adminTelegram);

    res.json({
      success: true,
      message: 'Order បានបញ្ជូន!',
      order_id: order.id,
      admin_notified: adminNotified
    });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Get All Orders ──────────────────────────────────────────────
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, p.page_link, p.telegram_link as product_telegram
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Confirm Order & Send to Buyer ───────────────────────────────
app.post('/api/admin/orders/:id/confirm', requireAuth, async (req, res) => {
  try {
    const orderRes = await pool.query(`
      SELECT o.*, p.page_link, p.discount as product_discount, p.price as product_original_price, p.telegram_link as product_telegram
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.id = $1
    `, [req.params.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = orderRes.rows[0];
    if (order.status === 'delivered') return res.json({ success: false, message: 'Order នេះ delivered រួចហើយ!' });

    // Update status
    await pool.query(`UPDATE orders SET status='delivered', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [req.params.id]);

    // Get admin telegram for message
    const settingsRes = await pool.query('SELECT telegram_link, shop_name FROM shop_settings LIMIT 1');
    const adminTg = settingsRes.rows[0]?.telegram_link?.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '') || '';
    order.admin_telegram = adminTg;

    // Send confirmation to buyer
    await sendOrderConfirmation(order);

    res.json({ success: true, message: 'Confirmed! ផ្ញើទៅ Telegram គេរួចហើយ!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Delete Order ────────────────────────────────────────────────
app.delete('/api/admin/orders/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Order បានលុប!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── API: Admin - Update Order Status ────────────────────────────────────────
app.put('/api/admin/orders/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status មិនត្រឹមត្រូវ!' });
    }
    await pool.query(`UPDATE orders SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [status, req.params.id]);
    res.json({ success: true, message: 'Status updated!' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Admin Panel: http://localhost:${PORT}/admin`);
});
