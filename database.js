const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Create data directory if not exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'shop.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    qr_image TEXT,
    bank_name TEXT,
    account_name TEXT,
    account_number TEXT,
    phone_number TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    is_main INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shop_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_name TEXT DEFAULT 'ហាងរបស់ខ្ញុំ',
    shop_description TEXT,
    shop_phone TEXT,
    shop_address TEXT,
    shop_logo TEXT,
    facebook_link TEXT,
    telegram_link TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default admin if not exists (username: admin, password: admin123)
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM admin WHERE username = ?').get('admin');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)').run('admin', hashedPassword);
  console.log('✅ Default admin created: username=admin, password=admin123');
}

try { db.exec('ALTER TABLE shop_settings ADD COLUMN banner_title TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE shop_settings ADD COLUMN banner_desc TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE products ADD COLUMN phone_number TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE products ADD COLUMN page_link TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE products ADD COLUMN telegram_link TEXT'); } catch(e) {}

// Insert default shop settings if not exists
const settingsExists = db.prepare('SELECT id FROM shop_settings').get();
if (!settingsExists) {
  db.prepare('INSERT INTO shop_settings (shop_name) VALUES (?)').run('ហាងរបស់ខ្ញុំ');
}

module.exports = db;
