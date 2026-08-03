require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── Init Tables ──────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
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
        discount INTEGER DEFAULT 0,
        category TEXT DEFAULT 'all',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_path TEXT NOT NULL,
        is_main INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS shop_settings (
        id SERIAL PRIMARY KEY,
        shop_name TEXT DEFAULT 'ហាងរបស់ខ្ញុំ',
        shop_description TEXT,
        shop_phone TEXT,
        shop_address TEXT,
        shop_logo TEXT,
        facebook_link TEXT,
        telegram_link TEXT,
        banner_title TEXT,
        banner_desc TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrations — add columns if missing
    const migrations = [
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS bank_name TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS phone_number TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS page_link TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS telegram_link TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'all'`,
      `ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS banner_title TEXT`,
      `ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS banner_desc TEXT`,
    ];
    for (const sql of migrations) {
      try { await client.query(sql); } catch(e) {}
    }

    // Default admin
    const adminRes = await client.query(`SELECT id FROM admin WHERE username = 'admin'`);
    if (adminRes.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await client.query(`INSERT INTO admin (username, password) VALUES ('admin', $1)`, [hash]);
      console.log('✅ Default admin: username=admin, password=admin123');
    }

    // Default settings
    const settingsRes = await client.query(`SELECT id FROM shop_settings`);
    if (settingsRes.rows.length === 0) {
      await client.query(`INSERT INTO shop_settings (shop_name) VALUES ('ហាងរបស់ខ្ញុំ')`);
    }

    console.log('✅ PostgreSQL connected and tables ready');
  } finally {
    client.release();
  }
}

initDB().catch(err => {
  console.error('❌ DB init error:', err.message);
  process.exit(1);
});

module.exports = pool;
