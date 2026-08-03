// ═══════════════════════════════════════════════════════
//  PRODUCT DETAIL PAGE - product.js
// ═══════════════════════════════════════════════════════

let currentProduct = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  const id = getProductIdFromUrl();
  if (!id) { showNotFound(); return; }
  await loadProduct(id);
  setupBuyModal();
});

// ─── Get product ID from URL ──────────────────────────
function getProductIdFromUrl() {
  const parts = window.location.pathname.split('/');
  const id = parts[parts.length - 1];
  return id && !isNaN(id) ? id : null;
}

// ─── Load Shop Settings ───────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success || !data.data) return;
    const s = data.data;
    if (s.shop_name) {
      document.getElementById('shopName').textContent = s.shop_name;
      const footer = document.getElementById('footerName');
      if (footer) footer.textContent = s.shop_name;
    }
    if (s.shop_logo) {
      const logo = document.getElementById('shopLogo');
      logo.src = s.shop_logo;
      logo.style.display = 'block';
    }
    // Floating Telegram
    const floatBtn = document.getElementById('floatTelegram');
    if (floatBtn && s.telegram_link) {
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
  } catch (err) {
    console.error('Settings error:', err);
  }
}

// ─── Load Product ─────────────────────────────────────
async function loadProduct(id) {
  const loading = document.getElementById('productLoading');
  const content = document.getElementById('productContent');

  try {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json();
    loading.style.display = 'none';
    if (!data.success || !data.data) { showNotFound(); return; }

    currentProduct = data.data;
    const p = currentProduct;

    // Page title
    document.title = `${p.name} - ហាងរបស់ខ្ញុំ`;

    // Name & Price (with discount support)
    document.getElementById('detailName').textContent = p.name;
    const discount = parseInt(p.discount) || 0;
    if (discount > 0) {
      const originalPrice = parseFloat(p.price);
      const salePrice = originalPrice * (1 - discount / 100);
      document.getElementById('detailPrice').innerHTML = `
        ${formatPrice(salePrice, p.currency)}
        <span class="product-price-original">${formatPrice(originalPrice, p.currency)}</span>
        <span class="discount-badge-detail">-${discount}%</span>
      `;
    } else {
      document.getElementById('detailPrice').textContent = formatPrice(p.price, p.currency);
    }

    // Description
    if (p.description) {
      document.getElementById('detailDesc').textContent = p.description;
    }

    // Facebook + Telegram Buttons
    if (p.page_link) {
      const btn = document.getElementById('pageLinkBtn');
      btn.href = p.page_link;
      btn.style.display = 'inline-flex';
    }
    if (p.telegram_link) {
      const btn = document.getElementById('telegramLinkBtn');
      btn.href = p.telegram_link;
      btn.style.display = 'inline-flex';
    }

    // Images
    const images = p.images || [];
    if (images.length > 0) {
      const mainImg = document.getElementById('mainImage');
      const mainImage = images.find(i => i.is_main) || images[0];
      mainImg.src = mainImage.image_path;
      mainImg.alt = p.name;

      const thumbsEl = document.getElementById('thumbnails');
      if (images.length > 1) {
        thumbsEl.innerHTML = images.map((img, idx) => `
          <div class="thumb ${img.is_main ? 'active' : ''}" data-src="${img.image_path}">
            <img src="${img.image_path}" alt="Thumbnail ${idx + 1}" loading="lazy">
          </div>
        `).join('');

        thumbsEl.querySelectorAll('.thumb').forEach(thumb => {
          thumb.addEventListener('click', () => {
            mainImg.style.opacity = '0';
            setTimeout(() => {
              mainImg.src = thumb.dataset.src;
              mainImg.style.opacity = '1';
            }, 150);
            thumbsEl.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
          });
          // Support touch tap on mobile without scroll conflict
          let touchStartX = 0;
          thumb.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
          thumb.addEventListener('touchend', e => {
            const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
            if (dx < 8) { // tap (not swipe)
              mainImg.style.opacity = '0';
              setTimeout(() => {
                mainImg.src = thumb.dataset.src;
                mainImg.style.opacity = '1';
              }, 150);
              thumbsEl.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
              thumb.classList.add('active');
            }
          });
        });

        // Mouse wheel scroll on PC
        const wrap = document.querySelector('.thumbnails-wrap');
        if (wrap) {
          wrap.addEventListener('wheel', e => {
            e.preventDefault();
            wrap.scrollLeft += e.deltaY;
          }, { passive: false });

          // Mouse drag scroll on PC
          let isDown = false, startX, scrollLeft;
          wrap.addEventListener('mousedown', e => {
            isDown = true;
            wrap.style.cursor = 'grabbing';
            startX = e.pageX - wrap.offsetLeft;
            scrollLeft = wrap.scrollLeft;
          });
          wrap.addEventListener('mouseleave', () => { isDown = false; wrap.style.cursor = 'grab'; });
          wrap.addEventListener('mouseup', () => { isDown = false; wrap.style.cursor = 'grab'; });
          wrap.addEventListener('mousemove', e => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - wrap.offsetLeft;
            wrap.scrollLeft = scrollLeft - (x - startX);
          });
          wrap.style.cursor = 'grab';
        }
      }
    } else {
      document.querySelector('.main-image-wrap').innerHTML = `
        <div style="width:100%;min-height:300px;display:flex;align-items:center;justify-content:center;
          background:#f5f5f5;color:#bdbdbd;font-size:4rem;border-radius:12px">
          <i class="fas fa-image"></i>
        </div>`;
    }

    // Show Buy Button (always show)
    document.getElementById('buyNowBtn').style.display = 'flex';

    // Setup lightbox
    if (images.length > 0) setupLightbox(images);

    content.style.display = 'block';

  } catch (err) {
    console.error('Product load error:', err);
    document.getElementById('productLoading').style.display = 'none';
    showNotFound();
  }
}

// ─── Buy Modal Setup ──────────────────────────────────
function setupBuyModal() {
  const modal     = document.getElementById('buyModal');
  const overlay   = document.getElementById('buyModalOverlay');
  const closeBtn  = document.getElementById('buyModalClose');
  const buyBtn    = document.getElementById('buyNowBtn');

  buyBtn.addEventListener('click', openBuyModal);
  closeBtn.addEventListener('click', closeBuyModal);
  overlay.addEventListener('click', closeBuyModal);

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBuyModal();
  });
}

function openBuyModal() {
  const p = currentProduct;
  if (!p) return;

  const modal = document.getElementById('buyModal');

  // Fill product info
  document.getElementById('modalProductName').textContent = p.name;
  const discount = parseInt(p.discount) || 0;
  if (discount > 0) {
    const originalPrice = parseFloat(p.price);
    const salePrice = originalPrice * (1 - discount / 100);
    document.getElementById('modalProductPrice').innerHTML = `
      ${formatPrice(salePrice, p.currency)}
      <span style="font-size:1rem;color:#999;text-decoration:line-through;font-weight:400;margin-left:6px">${formatPrice(originalPrice, p.currency)}</span>
      <span style="font-size:0.8rem;background:var(--primary);color:white;padding:2px 8px;border-radius:20px;margin-left:6px;font-weight:700">-${discount}%</span>
    `;
  } else {
    document.getElementById('modalProductPrice').textContent = formatPrice(p.price, p.currency);
  }

  // QR Section
  const qrSection = document.getElementById('modalQrSection');
  const divider   = document.getElementById('modalDivider');
  if (p.qr_image) {
    document.getElementById('modalQrImage').src = p.qr_image;

    // Account info rows
    const infoEl = document.getElementById('modalAccountInfo');
    infoEl.innerHTML = '';
    const rows = [
      { icon: 'fas fa-university', color: '#1565c0', value: p.bank_name,      label: 'ធនាគារ' },
      { icon: 'fas fa-user',       color: '#e65100', value: p.account_name,   label: 'ឈ្មោះ' },
      { icon: 'fas fa-credit-card',color: '#2e7d32', value: p.account_number, label: 'Account' },
      { icon: 'fas fa-phone',      color: '#6a1b9a', value: p.phone_number,   label: 'ទូរស័ព្ទ' },
    ];
    rows.forEach(r => {
      if (r.value) {
        infoEl.innerHTML += `
          <div class="modal-account-row">
            <i class="${r.icon}" style="color:${r.color}"></i>
            <span style="color:#757575;min-width:70px">${r.label}:</span>
            <span>${escHtml(r.value)}</span>
          </div>`;
      }
    });

    qrSection.style.display = 'block';
    divider.style.display = 'flex';
  } else {
    qrSection.style.display = 'none';
    divider.style.display = 'none';
  }

  // Telegram Button - use product telegram_link first, fallback to shop settings
  const telegramSection = document.getElementById('modalTelegramSection');
  const telegramBtn     = document.getElementById('modalTelegramBtn');

  const tgLink = p.telegram_link || '';
  if (tgLink) {
    telegramBtn.href = tgLink;
    telegramSection.style.display = 'block';
    divider.style.display = 'flex';
  } else {
    fetch('/api/settings').then(r => r.json()).then(data => {
      const fallback = data.data && data.data.telegram_link ? data.data.telegram_link : '';
      if (fallback) {
        telegramBtn.href = fallback;
        telegramSection.style.display = 'block';
        divider.style.display = 'flex';
      } else {
        telegramSection.style.display = 'none';
      }
    });
  }

  // Open modal
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBuyModal() {
  document.getElementById('buyModal').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Lightbox ─────────────────────────────────────────
let lightboxImages = [];
let lightboxIndex  = 0;

function setupLightbox(images) {
  lightboxImages = images.map(i => i.image_path);

  const lb        = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lightboxImg');
  const lbClose   = document.getElementById('lightboxClose');
  const lbOverlay = document.getElementById('lightboxOverlay');
  const lbPrev    = document.getElementById('lightboxPrev');
  const lbNext    = document.getElementById('lightboxNext');
  const lbCounter = document.getElementById('lightboxCounter');

  // Click main image to open
  const mainWrap = document.querySelector('.main-image-wrap');
  if (mainWrap) {
    mainWrap.addEventListener('click', () => {
      const mainImg = document.getElementById('mainImage');
      lightboxIndex = lightboxImages.indexOf(mainImg.src);
      if (lightboxIndex < 0) lightboxIndex = 0;
      openLightbox();
    });
  }

  // Click thumbnail to open at that index
  document.getElementById('thumbnails').addEventListener('click', e => {
    const thumb = e.target.closest('.thumb');
    if (!thumb) return;
    const src = thumb.dataset.src;
    lightboxIndex = lightboxImages.indexOf(src);
    if (lightboxIndex < 0) lightboxIndex = 0;
    openLightbox();
  });

  function openLightbox() {
    updateLightboxImg();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    // hide prev/next if only 1 image
    lbPrev.style.display = lightboxImages.length > 1 ? 'flex' : 'none';
    lbNext.style.display = lightboxImages.length > 1 ? 'flex' : 'none';
  }

  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  function updateLightboxImg() {
    lbImg.src = lightboxImages[lightboxIndex];
    lbCounter.textContent = lightboxImages.length > 1
      ? `${lightboxIndex + 1} / ${lightboxImages.length}` : '';
  }

  lbClose.addEventListener('click', closeLightbox);
  lbOverlay.addEventListener('click', closeLightbox);

  lbPrev.addEventListener('click', () => {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightboxImg();
  });

  lbNext.addEventListener('click', () => {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    updateLightboxImg();
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')  { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; updateLightboxImg(); }
    if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; updateLightboxImg(); }
  });

  // Swipe on mobile
  let touchStartX = 0;
  lb.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; }
    else        { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; }
    updateLightboxImg();
  });
}

// ─── Helpers ──────────────────────────────────────────
function showNotFound() {
  document.getElementById('productLoading').style.display = 'none';
  document.getElementById('productNotFound').style.display = 'block';
}

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
