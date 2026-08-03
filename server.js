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

const app = express();
const db = require('./database');

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

const uploadProducts = multer({ storage: makeCloudStorage('products'), fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024, fields: 50 } });
const uploadQR       = multer({ storage: makeCloudStorage('qr'),       fileFilter: imageFilter, limits: { fileSize: 5  * 1024 * 1024, fields: 50 } });
const uploadLogo     = multer({ storage: makeCloudStorage('logo'),     fileFilter: imageFilter, limits: { fileSize: 5  * 1024 * 1024, fields: 50 } });

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

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Product detail page
app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── API: Shop Settings (Public) ─────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
  res.json({ success: true, data: settings });
});

// ─── API: Products (Public) ───────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const products = db.prepare(`
    SELECT p.*, 
      (SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1) as main_image
    FROM products p 
    WHERE p.is_active = 1 
    ORDER BY p.created_at DESC
  `).all();
  res.json({ success: true, data: products });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC').all(req.params.id);
  res.json({ success: true, data: { ...product, images } });
});

// ─── API: Update Banner Text (inline edit) ───────────────────────────────────
app.post('/api/banner', async (req, res) => {
  // Check if admin is logged in
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const { banner_title, banner_desc } = req.body;
  db.prepare('UPDATE shop_settings SET banner_title=?, banner_desc=?, updated_at=CURRENT_TIMESTAMP').run(
    banner_title || '', banner_desc || ''
  );
  res.json({ success: true });
});


app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
  
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.json({ success: false, message: 'Username ឬ Password មិនត្រឹមត្រូវ!' });
  }
  
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  res.json({ success: true, message: 'Login successful' });
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
app.get('/api/admin/products', requireAuth, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, 
      (SELECT image_path FROM product_images WHERE product_id = p.id AND is_main = 1 LIMIT 1) as main_image,
      (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) as image_count
    FROM products p 
    ORDER BY p.created_at DESC
  `).all();
  res.json({ success: true, data: products });
});

app.post('/api/admin/products', requireAuth, (req, res) => {
  uploadProducts.array('images', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    
    const { name, description, price, currency, account_name, account_number, bank_name, phone_number, page_link, telegram_link, discount } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'ឈ្មោះ និងតម្លៃត្រូវការ!' });
    }
    
    const result = db.prepare(`
      INSERT INTO products (name, description, price, currency, bank_name, account_name, account_number, phone_number, page_link, telegram_link, discount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, description || '', parseFloat(price), currency || 'USD', bank_name || '', account_name || '', account_number || '', phone_number || '', page_link || '', telegram_link || '', parseInt(discount) || 0);
    
    const productId = result.lastInsertRowid;
    
    // Save images
    if (req.files && req.files.length > 0) {
      const insertImage = db.prepare(`
        INSERT INTO product_images (product_id, image_path, is_main, sort_order)
        VALUES (?, ?, ?, ?)
      `);
      
      req.files.forEach((file, index) => {
        const imgUrl = file.path || `/uploads/products/${file.filename}`;
        insertImage.run(productId, imgUrl, index === 0 ? 1 : 0, index);
      });
    }
    
    res.json({ success: true, message: 'Product បានបន្ថែមរួចហើយ!', id: productId });
  });
});

app.put('/api/admin/products/:id', requireAuth, (req, res) => {
  const { name, description, price, currency, account_name, account_number, bank_name, phone_number, page_link, telegram_link, discount, is_active } = req.body;
  
  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, currency=?, bank_name=?, account_name=?, account_number=?, phone_number=?, page_link=?, telegram_link=?, discount=?, is_active=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, description || '', parseFloat(price), currency || 'USD', bank_name || '', account_name || '', account_number || '', phone_number || '', page_link || '', telegram_link || '', parseInt(discount) || 0, is_active !== undefined ? is_active : 1, req.params.id);
  
  res.json({ success: true, message: 'Product បានកែប្រែ!' });
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  
  // Delete images from Cloudinary + filesystem
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ?').all(req.params.id);
  for (const img of images) {
    await deleteCloudinaryImage(img.image_path);
    if (img.image_path.startsWith('/uploads')) {
      const filePath = path.join(__dirname, img.image_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
  
  // Delete QR from Cloudinary
  if (product.qr_image) {
    await deleteCloudinaryImage(product.qr_image);
    if (product.qr_image.startsWith('/uploads')) {
      const qrPath = path.join(__dirname, product.qr_image);
      if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    }
  }
  
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Product បានលុបរួចហើយ!' });
});

// ─── API: Admin - Upload QR ───────────────────────────────────────────────────
app.post('/api/admin/products/:id/qr', requireAuth, (req, res) => {
  uploadQR.single('qr')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    // Delete old QR
    const product = db.prepare('SELECT qr_image FROM products WHERE id = ?').get(req.params.id);
    if (product && product.qr_image) {
      const oldPath = path.join(__dirname, product.qr_image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    
    const qrPath = req.file.path || `/uploads/qr/${req.file.filename}`;
    db.prepare('UPDATE products SET qr_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(qrPath, req.params.id);
    
    res.json({ success: true, message: 'QR បានបញ្ចូលរួចហើយ!', qr_image: qrPath });
  });
});

// ─── API: Admin - Upload More Images ─────────────────────────────────────────
app.post('/api/admin/products/:id/images', requireAuth, (req, res) => {
  uploadProducts.array('images', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });
    
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM product_images WHERE product_id = ?').get(req.params.id).count;
    
    const insertImage = db.prepare(`
      INSERT INTO product_images (product_id, image_path, is_main, sort_order)
      VALUES (?, ?, ?, ?)
    `);
    
    req.files.forEach((file, index) => {
      const imgUrl = file.path || `/uploads/products/${file.filename}`;
      insertImage.run(req.params.id, imgUrl, existingCount === 0 && index === 0 ? 1 : 0, existingCount + index);
    });
    
    res.json({ success: true, message: 'រូបភាពបានបន្ថែម!' });
  });
});

app.delete('/api/admin/images/:id', requireAuth, async (req, res) => {
  const image = db.prepare('SELECT * FROM product_images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });
  
  await deleteCloudinaryImage(image.image_path);
  if (image.image_path.startsWith('/uploads')) {
    const filePath = path.join(__dirname, image.image_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  
  db.prepare('DELETE FROM product_images WHERE id = ?').run(req.params.id);
  
  // If deleted was main image, set first remaining as main
  if (image.is_main) {
    const firstImage = db.prepare('SELECT id FROM product_images WHERE product_id = ? LIMIT 1').get(image.product_id);
    if (firstImage) db.prepare('UPDATE product_images SET is_main = 1 WHERE id = ?').run(firstImage.id);
  }
  
  res.json({ success: true, message: 'រូបភាពបានលុប!' });
});

app.put('/api/admin/images/:id/main', requireAuth, (req, res) => {
  const image = db.prepare('SELECT * FROM product_images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ success: false, message: 'Image not found' });
  
  db.prepare('UPDATE product_images SET is_main = 0 WHERE product_id = ?').run(image.product_id);
  db.prepare('UPDATE product_images SET is_main = 1 WHERE id = ?').run(req.params.id);
  
  res.json({ success: true, message: 'Main image updated!' });
});

// ─── API: Admin - Settings ────────────────────────────────────────────────────
app.get('/api/admin/settings', requireAuth, (req, res) => {
  const settings = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
  res.json({ success: true, data: settings });
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    
    const { shop_name, shop_description, shop_phone, shop_address, facebook_link, telegram_link, banner_title, banner_desc } = req.body;
    
    const current = db.prepare('SELECT * FROM shop_settings LIMIT 1').get();
    let logoPath = current ? current.shop_logo : null;
    
    if (req.file) {
      if (logoPath) {
        const oldPath = path.join(__dirname, logoPath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      logoPath = req.file.path || `/uploads/logo/${req.file.filename}`;
    }
    
    db.prepare(`
      UPDATE shop_settings SET 
        shop_name=?, shop_description=?, shop_phone=?, shop_address=?, 
        shop_logo=?, facebook_link=?, telegram_link=?, banner_title=?, banner_desc=?, updated_at=CURRENT_TIMESTAMP
    `).run(shop_name, shop_description || '', shop_phone || '', shop_address || '', logoPath, facebook_link || '', telegram_link || '', banner_title || '', banner_desc || '');
    
    res.json({ success: true, message: 'Settings បានរក្សាទុក!' });
  });
});

// ─── API: Admin - Change Password ─────────────────────────────────────────────
app.post('/api/admin/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.adminId);
  
  if (!bcrypt.compareSync(current_password, admin.password)) {
    return res.json({ success: false, message: 'Password បច្ចុប្បន្នមិនត្រឹមត្រូវ!' });
  }
  
  const hashedNew = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin SET password = ? WHERE id = ?').run(hashedNew, req.session.adminId);
  
  res.json({ success: true, message: 'Password បានផ្លាស់ប្តូររួចហើយ!' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Admin Panel: http://localhost:${PORT}/admin`);
});
