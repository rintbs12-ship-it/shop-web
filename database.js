const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Create data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'shop.db'));
db.pragma('journal_mode = WAL');

// Init tables
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
    page_link TEXT,
    telegram_link TEXT,
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
    banner_title TEXT,
    banner_desc TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations
['ALTER TABLE products ADD COLUMN bank_name TEXT',
 'ALTER TABLE products ADD COLUMN phone_number TEXT',
 'ALTER TABLE products ADD COLUMN page_link TEXT',
 'ALTER TABLE products ADD COLUMN telegram_link TEXT',
 'ALTER TABLE shop_settings ADD COLUMN banner_title TEXT',
 'ALTER TABLE shop_settings ADD COLUMN banner_desc TEXT',
].forEach(sql => { try { db.exec(sql); } catch(e) {} });

// Default admin
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM admin WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin (username, password) VALUES (?, ?)').run('admin', hash);
  console.log('✅ Default admin: username=admin, password=admin123');
}

// Default settings
const settingsExists = db.prepare('SELECT id FROM shop_settings').get();
if (!settingsExists) {
  db.prepare('INSERT INTO shop_settings (shop_name) VALUES (?)').run('ហាងរបស់ខ្ញុំ');
}

module.exports = db;
