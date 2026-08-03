// ═══════════════════════════════════════════════════════
//  PUBLIC HOMEPAGE - index.js
// ═══════════════════════════════════════════════════════

let allProducts = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadProducts();
  setupSearch();
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

    if (s.shop_description) document.getElementById('shopDesc').textContent = s.shop_description;

    if (s.shop_logo) {
      const logo = document.getElementById('shopLogo');
      logo.src = s.shop_logo; logo.style.display = 'block';
      const fl = document.getElementById('footerLogo');
      if (fl) { fl.src = s.shop_logo; fl.style.display = 'block'; }
    }

    if (s.shop_phone) {
      document.getElementById('phoneLink').href = `tel:${s.shop_phone}`;
      document.getElementById('phoneLink').style.display = 'flex';
      document.getElementById('footerPhone').innerHTML = `<i class="fas fa-phone" style="color:var(--primary)"></i> ${s.shop_phone}`;
    }

    if (s.shop_address) {
      document.getElementById('footerAddress').innerHTML = `<i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${s.shop_address}`;
    }

    if (s.facebook_link) {
      document.getElementById('fbLink').href = s.facebook_link;
      document.getElementById('fbLink').style.display = 'flex';
      document.getElementById('footerFb').href = s.facebook_link;
      document.getElementById('footerFb').style.display = 'flex';
    }

    if (s.telegram_link) {
      document.getElementById('tgLink').href = s.telegram_link;
      document.getElementById('tgLink').style.display = 'flex';
      document.getElementById('footerTg').href = s.telegram_link;
      document.getElementById('footerTg').style.display = 'flex';
      // Floating Telegram
      const floatBtn = document.getElementById('floatTelegram');
      if (floatBtn) { floatBtn.href = s.telegram_link; floatBtn.style.display = 'flex'; }
    }

  } catch (err) { console.error('Settings error:', err); }
}

// ─── Load Products ────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  try {
    const res = await fetch('/api/products');
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      grid.innerHTML = `<div class="no-products"><i class="fas fa-box-open"></i><p>មិនទាន់មានទំនិញ</p></div>`;
      return;
    }

    allProducts = data.data;
    renderProducts(allProducts);

  } catch (err) {
    grid.innerHTML = `<div class="no-products"><i class="fas fa-exclamation-circle"></i><p>មានបញ្ហា</p></div>`;
  }
}

// ─── Render Products ──────────────────────────────────
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');

  if (products.length === 0) {
    grid.innerHTML = `<div class="no-products"><i class="fas fa-search"></i><p>រកមិនឃើញ</p></div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const discount = parseInt(p.discount) || 0;
    const finalPrice = discount > 0 ? p.price * (1 - discount / 100) : p.price;
    const priceHtml = discount > 0
      ? `<div class="product-card-price-wrap">
           <span class="price-final">${formatPrice(finalPrice, p.currency)}</span>
           <span class="price-original">${formatPrice(p.price, p.currency)}</span>
         </div>`
      : `<div class="product-card-price-wrap">
           <span class="price-final">${formatPrice(p.price, p.currency)}</span>
         </div>`;

    return `
      <a href="/product/${p.id}" class="product-card">
        ${discount > 0 ? `<div class="product-card-discount">-${discount}%</div>` : ''}
        ${p.main_image
          ? `<img class="product-card-image" src="${p.main_image}" alt="${escHtml(p.name)}" loading="lazy">`
          : `<div class="product-card-image-placeholder"><i class="fas fa-image"></i></div>`
        }
        <div class="product-card-body">
          <div class="product-card-name">${escHtml(p.name)}</div>
          ${priceHtml}
        </div>
        <div class="product-card-btn">
          <i class="fas fa-eye"></i> មើលលម្អិត
        </div>
      </a>`;
  }).join('');
}

// ─── Search ───────────────────────────────────────────
function setupSearch() {
  const input  = document.getElementById('searchInput');
  const clear  = document.getElementById('searchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clear.style.display = q ? 'block' : 'none';

    if (!q) {
      renderProducts(allProducts);
      return;
    }

    const filtered = allProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
    renderProducts(filtered);

    // Show count
    const existing = document.getElementById('searchCount');
    if (existing) existing.remove();
    const count = document.createElement('p');
    count.id = 'searchCount';
    count.className = 'search-result-count';
    count.innerHTML = `<i class="fas fa-filter"></i> រកឃើញ <strong>${filtered.length}</strong> លទ្ធផល`;
    input.closest('.search-section').appendChild(count);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.style.display = 'none';
    renderProducts(allProducts);
    const existing = document.getElementById('searchCount');
    if (existing) existing.remove();
  });
}

// ─── Helpers ─────────────────────────────────────────
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
