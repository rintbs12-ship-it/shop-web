// ═══════════════════════════════════════════════════════
//  PUBLIC HOMEPAGE - index.js
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadProducts();
});

// ─── Load Shop Settings ───────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success || !data.data) return;

    const s = data.data;

    if (s.shop_name) {
      document.getElementById('shopName').textContent = s.shop_name;
      document.getElementById('footerName').textContent = s.shop_name;
      document.getElementById('footerCopyName').textContent = s.shop_name;
      document.title = s.shop_name;
      document.getElementById('heroBannerTitle').textContent = s.banner_title || s.shop_name;
    }

    document.getElementById('heroBannerDesc').textContent =
      s.banner_desc || s.shop_description || 'ទំនិញគុណភាពល្អ តម្លៃសមរម្យ';

    if (s.shop_description) {
      document.getElementById('shopDesc').textContent = s.shop_description;
      const footerDesc = document.getElementById('footerDesc');
      if (footerDesc) footerDesc.textContent = s.shop_description;
    }

    if (s.shop_logo) {
      const logo = document.getElementById('shopLogo');
      logo.src = s.shop_logo;
      logo.style.display = 'block';
      const footerLogo = document.getElementById('footerLogo');
      if (footerLogo) { footerLogo.src = s.shop_logo; footerLogo.style.display = 'block'; }
    }

    if (s.shop_phone) {
      const phoneEl = document.getElementById('phoneLink');
      phoneEl.href = `tel:${s.shop_phone}`;
      phoneEl.style.display = 'flex';
      document.getElementById('footerPhone').innerHTML = `<i class="fas fa-phone" style="color:var(--primary)"></i> ${s.shop_phone}`;
    }

    if (s.shop_address) {
      document.getElementById('footerAddress').innerHTML = `<i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${s.shop_address}`;
    }

    if (s.facebook_link) {
      const fb = document.getElementById('fbLink');
      fb.href = s.facebook_link;
      fb.style.display = 'flex';
      const footerFb = document.getElementById('footerFb');
      footerFb.href = s.facebook_link;
      footerFb.style.display = 'flex';
    }

    if (s.telegram_link) {
      const tg = document.getElementById('tgLink');
      tg.href = s.telegram_link;
      tg.style.display = 'flex';
      const footerTg = document.getElementById('footerTg');
      footerTg.href = s.telegram_link;
      footerTg.style.display = 'flex';
    }

  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// ─── Load Products ─────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  try {
    const res = await fetch('/api/products');
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      grid.innerHTML = `
        <div class="no-products">
          <i class="fas fa-box-open"></i>
          <p>មិនទាន់មានទំនិញនៅឡើយ</p>
        </div>`;
      return;
    }

    grid.innerHTML = data.data.map(p => `
      <a href="/product/${p.id}" class="product-card">
        ${p.main_image
          ? `<img class="product-card-image" src="${p.main_image}" alt="${escHtml(p.name)}" loading="lazy">`
          : `<div class="product-card-image-placeholder"><i class="fas fa-image"></i></div>`
        }
        <div class="product-card-body">
          <div class="product-card-name">${escHtml(p.name)}</div>
          <div class="product-card-price">${formatPrice(p.price, p.currency)}</div>
        </div>
        <div class="product-card-btn">
          <i class="fas fa-eye"></i> មើលលម្អិត
        </div>
      </a>
    `).join('');

  } catch (err) {
    grid.innerHTML = `<div class="no-products"><i class="fas fa-exclamation-circle"></i><p>មានបញ្ហាក្នុងការផ្ទុក</p></div>`;
  }
}

// ─── Helpers ──────────────────────────────────────────
function formatPrice(price, currency) {
  if (currency === 'KHR') return `${Number(price).toLocaleString()} ៛`;
  return `$${Number(price).toFixed(2)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
