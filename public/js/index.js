// ═══════════════════════════════════════════════════════
//  PUBLIC HOMEPAGE - index.js
// ═══════════════════════════════════════════════════════

let allProducts = [];
let activeTab = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadProducts();
  setupTabs();
  fitTabLabels();
  window.addEventListener('resize', fitTabLabels);
  setupSearch();
});

function fitTabLabels() {
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.style.fontSize = '';
    let size = parseFloat(getComputedStyle(button).fontSize);
    while (button.scrollWidth > button.clientWidth && size > 8) {
      size -= 0.5;
      button.style.fontSize = `${size}px`;
    }
  });
}

// ─── Load Shop Settings ───────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success || !data.data) return;

    const s = data.data;

    if (s.banner_image) {
      const hero = document.querySelector('.hero-banner');
      hero.style.backgroundImage = `url("${String(s.banner_image).replace(/["\\]/g, '')}")`;
      hero.classList.add('has-image');
    }

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
      document.getElementById('footerPhone').innerHTML =
        `<i class="fas fa-phone" style="color:var(--primary)"></i> ${s.shop_phone}`;
    }

    if (s.shop_address) {
      document.getElementById('footerAddress').innerHTML =
        `<i class="fas fa-map-marker-alt" style="color:var(--primary)"></i> ${s.shop_address}`;
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

      const floatBtn = document.getElementById('floatTelegram');
      if (floatBtn) {
        floatBtn.href = s.telegram_link;
        // Position button above footer dynamically
        const positionAboveFooter = () => {
          const footer = document.querySelector('.footer');
          if (!footer) return;
          const footerH = footer.offsetHeight;
          floatBtn.style.bottom = (footerH + 10) + 'px';
        };
        positionAboveFooter();
        window.addEventListener('resize', positionAboveFooter);
      }
    }

    // Inject dynamic tabs 4,5,6
    injectDynamicTabs(s);

  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// ─── Load All Products ─────────────────────────────────
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
      allProducts = [];
      return;
    }

    allProducts = data.data;
    applyFilters();

  } catch (err) {
    grid.innerHTML = `
      <div class="no-products">
        <i class="fas fa-exclamation-circle"></i>
        <p>មានបញ្ហាក្នុងការផ្ទុក</p>
      </div>`;
  }
}

// ─── Inject Dynamic Tabs 4,5,6 ───────────────────────
function injectDynamicTabs(s) {
  const tabsContainer = document.getElementById('categoryTabs');
  if (!tabsContainer) return;

  const dynamicTabs = Array.from({ length: 9 }, (_, index) => {
    const number = index + 4;
    return {
      key: `tab${number}`,
      name: s[`tab${number}_name`],
      icon: s[`tab${number}_icon`],
      enabled: s[`tab${number}_enabled`],
    };
  });

  dynamicTabs.forEach(tab => {
    // Only show if explicitly enabled (=1) AND has a custom name set (not default)
    if (!tab.enabled || parseInt(tab.enabled) !== 1) return;
    if (!tab.name || tab.name.trim() === '') return;
    // Hide if still using default name like "Tab 4", "Tab 5", "Tab 6"
    if (/^Tab\s*(?:[4-9]|1[0-2])$/i.test(tab.name.trim())) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = tab.key;
    btn.innerHTML = `<i class="${tab.icon || 'fas fa-tag'}"></i> ${tab.name}`;
    tabsContainer.appendChild(btn);

    // Attach click event
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = tab.key;
      const input = document.getElementById('searchInput');
      const clearBtn = document.getElementById('searchClear');
      if (input) input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      updateResultCount(null);
      applyFilters();
    });
  });
}

// ─── Tabs ──────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;

      // Clear search when switching tabs
      const input = document.getElementById('searchInput');
      const clearBtn = document.getElementById('searchClear');
      if (input) input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      updateResultCount(null);

      applyFilters();
    });
  });
}

// ─── Apply tab + search filters together ──────────────
function applyFilters() {
  const query = (document.getElementById('searchInput')?.value || '').trim();

  let filtered = allProducts;

  // 1. Tab filter
  if (activeTab === 'sold') {
    filtered = filtered.filter(p => Number(p.is_sold) === 1);
  } else if (activeTab === 'all') {
    filtered = filtered.filter(p => Number(p.is_sold) !== 1);
  } else {
    filtered = filtered.filter(p => Number(p.is_sold) !== 1 && (p.category || 'all') === activeTab);
  }

  // 2. Search filter on top of tab
  if (query) {
    const rawQuery = query.toLowerCase().replace(/,/g, '').trim();
    const q = rawQuery.replace(/\s/g, '');
    const exactK = rawQuery.match(/^(\d+(?:\.\d+)?)\s*k$/i);
    filtered = filtered.filter(p => {
      const searchableText = `${p.name || ''} ${p.description || ''}`.toLowerCase().replace(/,/g, '');

      if (exactK) {
        const requestedK = Number(exactK[1]);
        const requestedFull = requestedK * 1000;
        const kValues = [...searchableText.matchAll(/(\d+(?:\.\d+)?)\s*k\b/gi)]
          .map(match => Number(match[1]));
        const numberValues = (searchableText.match(/\d+(?:\.\d+)?/g) || [])
          .map(Number);
        return kValues.includes(requestedK) || numberValues.includes(requestedFull);
      }

      return searchableText.replace(/\s/g, '').includes(q);
    });
    updateResultCount(filtered.length);
  }

  renderProducts(filtered);
}

// ─── Render Products ───────────────────────────────────
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="no-products">
        <i class="fas fa-search"></i>
        <p>រកមិនឃើញទំនិញ</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const discount = parseInt(p.discount) || 0;
    const originalPrice = parseFloat(p.price);
    const salePrice = discount > 0 ? originalPrice * (1 - discount / 100) : originalPrice;

    const discountBadge = discount > 0
      ? `<div class="product-card-discount">-${discount}%</div>`
      : '';
    const sold = Number(p.is_sold) === 1;
    const soldBadge = sold
      ? '<div class="product-card-sold"><i class="fas fa-check-circle"></i> បានលក់ចេញ</div>'
      : '';

    const priceHtml = discount > 0
      ? `<div class="product-card-price-wrap">
           <span class="price-final">${formatPrice(salePrice, p.currency)}</span>
           <span class="price-original">${formatPrice(originalPrice, p.currency)}</span>
         </div>`
      : `<div class="product-card-price">${formatPrice(originalPrice, p.currency)}</div>`;

    const imageHtml = p.main_image
      ? `<img class="product-card-image" src="${p.main_image}" alt="${escHtml(p.name)}" loading="lazy">`
      : `<div class="product-card-image-placeholder"><i class="fas fa-image"></i></div>`;

    return `
      <a href="/product/${p.id}" class="product-card">
        ${discountBadge}
        ${soldBadge}
        ${imageHtml}
        <div class="product-card-body">
          <div class="product-card-name">${escHtml(p.name)}</div>
          ${priceHtml}
        </div>
        <div class="product-card-btn ${sold ? 'sold' : ''}">
          <i class="fas ${sold ? 'fa-check-circle' : 'fa-eye'}"></i> ${sold ? 'បានលក់ចេញ' : 'មើលលម្អិត'}
        </div>
      </a>
    `;
  }).join('');
}

// ─── Search ────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearBtn.style.display = query ? 'block' : 'none';
    if (!query) updateResultCount(null);
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    updateResultCount(null);
    applyFilters();
    input.focus();
  });
}

function updateResultCount(count) {
  let countEl = document.getElementById('searchResultCount');
  if (!countEl) {
    countEl = document.createElement('p');
    countEl.id = 'searchResultCount';
    countEl.className = 'search-result-count';
    const wrap = document.querySelector('.search-section');
    if (wrap) wrap.appendChild(countEl);
  }
  countEl.textContent = count === null ? '' : `រកឃើញ ${count} ទំនិញ`;
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
