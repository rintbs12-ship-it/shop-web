// ═══════════════════════════════════════════════════════
//  ADMIN PANEL - admin.js
// ═══════════════════════════════════════════════════════

// ─── State ────────────────────────────────────────────
let currentPage = 'products';
let editingProductId = null;
let managingImagesProductId = null;
let newImageFiles = [];
let newQRFile = null;

// ─── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const check = await fetch('/api/admin/check');
  const data = await check.json();
  if (data.success) {
    showDashboard(data.username);
  } else {
    showLogin();
  }
  setupEventListeners();
});

// ─── Show Login / Dashboard ───────────────────────────
function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminDashboard').style.display = 'none';
}

function showDashboard(username) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'flex';
  document.getElementById('adminName').textContent = username || 'Admin';
  loadProducts();
  loadSettingsForm();
}

// ─── Setup Event Listeners ────────────────────────────
function setupEventListeners() {
  // Login form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Add product button
  document.getElementById('addProductBtn').addEventListener('click', openAddProductModal);

  // Product modal close
  document.getElementById('modalClose').addEventListener('click', closeProductModal);
  document.getElementById('modalOverlay').addEventListener('click', closeProductModal);
  document.getElementById('cancelBtn').addEventListener('click', closeProductModal);
  document.getElementById('saveProductBtn').addEventListener('click', saveProduct);

  // Image upload area
  const uploadArea = document.getElementById('uploadArea');
  const productImages = document.getElementById('productImages');
  uploadArea.addEventListener('click', (e) => {
    if (e.target.id === 'pasteImageBtn' || e.target.closest('#pasteImageBtn')) return;
    productImages.click();
  });
  productImages.addEventListener('change', handleImageSelect);
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleImageFiles(e.dataTransfer.files);
  });

  // Paste button
  document.getElementById('pasteImageBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `paste-${Date.now()}.png`, { type });
            handleImageFiles([file]);
            found = true;
            showToast('Paste រូបបានហើយ!', 'success');
          }
        }
      }
      if (!found) showToast('មិនមានរូបក្នុង Clipboard', 'error');
    } catch(e) {
      showToast('Ctrl+V ដោយផ្ទាល់ក្នុង upload area', 'info');
    }
  });

  // Global Ctrl+V paste when modal is open
  document.addEventListener('paste', (e) => {
    if (!document.getElementById('productModal').classList.contains('open')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleImageFiles([file]);
          showToast('Paste រូបបានហើយ!', 'success');
        }
      }
    }
  });

  // QR upload
  const qrArea = document.getElementById('qrUploadArea');
  const qrInput = document.getElementById('productQR');
  qrArea.addEventListener('click', () => qrInput.click());
  qrInput.addEventListener('change', handleQRSelect);

  // Settings form
  document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
  const logoArea = document.getElementById('logoUploadArea');
  const logoInput = document.getElementById('logoInput');
  logoArea.addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      document.getElementById('logoPreview').src = url;
      document.getElementById('logoPreview').style.display = 'block';
      document.getElementById('logoPlaceholder').style.display = 'none';
    }
  });

  // Password form
  document.getElementById('passwordForm').addEventListener('submit', handlePasswordChange);

  // Images modal
  document.getElementById('imagesModalClose').addEventListener('click', closeImagesModal);
  document.getElementById('imagesModalOverlay').addEventListener('click', closeImagesModal);
  document.getElementById('uploadMoreBtn').addEventListener('click', uploadMoreImages);
}

// ─── Login / Logout ───────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      showDashboard(username);
    } else {
      errEl.textContent = data.message || 'Login failed';
    }
  } catch (err) {
    errEl.textContent = 'Connection error. Please try again.';
  }
}

async function handleLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
  document.getElementById('loginForm').reset();
}

// ─── Navigation ───────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

  const titles = { products: 'Products', orders: 'Orders', settings: 'Settings', password: 'Change Password' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  // Load orders when navigating to orders page
  if (page === 'orders') loadOrders();

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

// ─── Load Products ─────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('adminProductsGrid');
  grid.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> កំពុងផ្ទុក...</div>`;

  try {
    const res = await fetch('/api/admin/products');
    const data = await res.json();

    if (!data.success || data.data.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-box-open"></i>
          <p>មិនទាន់មាន Product ណាមួយ</p>
          <button class="btn-primary" onclick="openAddProductModal()">
            <i class="fas fa-plus"></i> បន្ថែម Product ដំបូង
          </button>
        </div>`;
      return;
    }

    grid.innerHTML = data.data.map(p => `
      <div class="admin-product-card ${p.is_active ? '' : 'inactive'}">
        ${p.main_image
          ? `<img class="admin-card-image" src="${p.main_image}" alt="${escHtml(p.name)}" loading="lazy">`
          : `<div class="admin-card-image-placeholder"><i class="fas fa-image"></i></div>`
        }
        <div class="admin-card-body">
          <div class="admin-card-name" title="${escHtml(p.name)}">${escHtml(p.name)}</div>
          <div class="admin-card-price">${formatPrice(p.price, p.currency)}</div>
          <div class="admin-card-meta">
            <span class="badge ${p.is_active ? 'badge-active' : 'badge-inactive'}">
              ${p.is_active ? 'Active' : 'Hidden'}
            </span>
            <span class="badge badge-images"><i class="fas fa-image"></i> ${p.image_count}</span>
            ${p.qr_image ? `<span class="badge badge-qr"><i class="fas fa-qrcode"></i> QR</span>` : ''}
          </div>
          <div class="admin-card-actions">
            <button class="btn-edit" onclick="openEditModal(${p.id})">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn-images" onclick="openImagesModal(${p.id})">
              <i class="fas fa-images"></i> រូប
            </button>
            <button class="btn-danger" onclick="deleteProduct(${p.id}, '${escHtml(p.name)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>មានបញ្ហា</p></div>`;
  }
}

// ─── Product Modal ─────────────────────────────────────
function openAddProductModal() {
  editingProductId = null;
  newImageFiles = [];
  newQRFile = null;
  document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus"></i> បន្ថែម Product';
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productCategory').value = 'all';

  // Auto-fill saved payment info
  const saved = JSON.parse(localStorage.getItem('savedPaymentInfo') || '{}');
  if (saved.bank_name)       document.getElementById('productBankName').value      = saved.bank_name;
  if (saved.account_name)    document.getElementById('productAccountName').value   = saved.account_name;
  if (saved.account_number)  document.getElementById('productAccountNumber').value = saved.account_number;
  if (saved.phone_number)    document.getElementById('productPhoneNumber').value   = saved.phone_number;
  if (saved.telegram_link)   document.getElementById('productTelegramLink').value  = saved.telegram_link;
  if (saved.description)     document.getElementById('productDesc').value          = saved.description;
  if (saved.page_link)       document.getElementById('productPageLink').value      = saved.page_link;

  document.getElementById('imagesPreview').innerHTML = '';
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('qrPreview').style.display = 'none';
  document.getElementById('qrPlaceholder').style.display = 'block';
  document.getElementById('productModal').classList.add('open');
}

async function openEditModal(id) {
  editingProductId = id;
  newImageFiles = [];
  newQRFile = null;

  try {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const p = data.data;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> កែប្រែ Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productCurrency').value = p.currency || 'USD';
    document.getElementById('productDiscount').value = p.discount || 0;
    document.getElementById('productCurrency').value = p.currency || 'USD';
    document.getElementById('productCategory').value = p.category || 'all';
    document.getElementById('productDesc').value = p.description || '';
    document.getElementById('productBankName').value = p.bank_name || '';
    document.getElementById('productAccountName').value = p.account_name || '';
    document.getElementById('productAccountNumber').value = p.account_number || '';
    document.getElementById('productPhoneNumber').value = p.phone_number || '';
    document.getElementById('productPageLink').value = p.page_link || '';
    document.getElementById('productTelegramLink').value = p.telegram_link || '';

    // Show existing images count
    document.getElementById('imagesPreview').innerHTML = '';
    document.getElementById('uploadPlaceholder').style.display = 'flex';
    if (p.images && p.images.length > 0) {
      document.getElementById('uploadPlaceholder').querySelector('p').textContent =
        `មានរូបរួចហើយ ${p.images.length} រូប - Upload ថ្មីបន្ថែម`;
    }

    // QR
    if (p.qr_image) {
      document.getElementById('qrPreview').src = p.qr_image;
      document.getElementById('qrPreview').style.display = 'block';
      document.getElementById('qrPlaceholder').style.display = 'none';
    } else {
      document.getElementById('qrPreview').style.display = 'none';
      document.getElementById('qrPlaceholder').style.display = 'block';
    }

    document.getElementById('productModal').classList.add('open');
  } catch (err) {
    showToast('មានបញ្ហា', 'error');
  }
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  editingProductId = null;
  newImageFiles = [];
  newQRFile = null;
}

// ─── Image Select ──────────────────────────────────────
function handleImageSelect(e) {
  handleImageFiles(e.target.files);
}

function handleImageFiles(files) {
  const preview = document.getElementById('imagesPreview');
  const placeholder = document.getElementById('uploadPlaceholder');

  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    newImageFiles.push(file);

    const reader = new FileReader();
    reader.onload = e => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-remove';
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const allItems = document.querySelectorAll('.preview-item');
        const itemIndex = Array.from(allItems).indexOf(item);
        newImageFiles.splice(itemIndex, 1);
        item.remove();
        if (newImageFiles.length === 0) {
          document.getElementById('uploadPlaceholder').style.display = 'flex';
        }
      });
      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = 'preview';
      item.appendChild(img);
      item.appendChild(removeBtn);
      preview.appendChild(item);
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}

function removePreviewImage(btn, idx) {
  btn.closest('.preview-item').remove();
  newImageFiles.splice(idx, 1);
  if (newImageFiles.length === 0) {
    document.getElementById('uploadPlaceholder').style.display = 'flex';
  }
}

// ─── QR Select ────────────────────────────────────────
function handleQRSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  newQRFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('qrPreview').src = ev.target.result;
    document.getElementById('qrPreview').style.display = 'block';
    document.getElementById('qrPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ─── Save Product ──────────────────────────────────────
async function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const price = document.getElementById('productPrice').value;
  if (!name || !price) {
    showToast('សូមបំពេញឈ្មោះ និងតម្លៃ!', 'error');
    return;
  }

  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> កំពុងរក្សាទុក...';

  try {
    if (editingProductId) {
      // Update product info
      const res = await fetch(`/api/admin/products/${editingProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          price,
          currency: document.getElementById('productCurrency').value,
          discount: document.getElementById('productDiscount').value || 0,
          category: document.getElementById('productCategory').value || 'all',
          description: document.getElementById('productDesc').value,
          bank_name: document.getElementById('productBankName').value,
          account_name: document.getElementById('productAccountName').value,
          account_number: document.getElementById('productAccountNumber').value,
          phone_number: document.getElementById('productPhoneNumber').value,
          page_link: document.getElementById('productPageLink').value,
          telegram_link: document.getElementById('productTelegramLink').value,
          is_active: 1
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Upload new images if any
      if (newImageFiles.length > 0) {
        const fd = new FormData();
        newImageFiles.forEach(f => fd.append('images', f));
        await fetch(`/api/admin/products/${editingProductId}/images`, { method: 'POST', body: fd });
      }

      // Upload new QR if any
      if (newQRFile) {
        const fd = new FormData();
        fd.append('qr', newQRFile);
        await fetch(`/api/admin/products/${editingProductId}/qr`, { method: 'POST', body: fd });
      }

      showToast('Product បានកែប្រែ!', 'success');

    } else {
      // Create new product
      const fd = new FormData();
      fd.append('name', name);
      fd.append('price', price);
      fd.append('currency', document.getElementById('productCurrency').value);
      fd.append('discount', document.getElementById('productDiscount').value || 0);
      fd.append('category', document.getElementById('productCategory').value || 'all');
      fd.append('description', document.getElementById('productDesc').value);
      fd.append('bank_name', document.getElementById('productBankName').value);
      fd.append('account_name', document.getElementById('productAccountName').value);
      fd.append('account_number', document.getElementById('productAccountNumber').value);
      fd.append('phone_number', document.getElementById('productPhoneNumber').value);
      fd.append('page_link', document.getElementById('productPageLink').value);
      fd.append('telegram_link', document.getElementById('productTelegramLink').value);
      newImageFiles.forEach(f => fd.append('images', f));

      // Save payment info for next time
      localStorage.setItem('savedPaymentInfo', JSON.stringify({
        bank_name:      document.getElementById('productBankName').value,
        account_name:   document.getElementById('productAccountName').value,
        account_number: document.getElementById('productAccountNumber').value,
        phone_number:   document.getElementById('productPhoneNumber').value,
        telegram_link:  document.getElementById('productTelegramLink').value,
        page_link:      document.getElementById('productPageLink').value,
        description:    document.getElementById('productDesc').value,
      }));

      const res = await fetch('/api/admin/products', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Upload QR if any
      if (newQRFile && data.id) {
        const qrFd = new FormData();
        qrFd.append('qr', newQRFile);
        await fetch(`/api/admin/products/${data.id}/qr`, { method: 'POST', body: qrFd });
      }

      showToast('Product បានបន្ថែម!', 'success');
    }

    closeProductModal();
    loadProducts();

  } catch (err) {
    showToast(err.message || 'មានបញ្ហា', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> រក្សាទុក';
  }
}

// ─── Delete Product ────────────────────────────────────
async function deleteProduct(id, name) {
  if (!confirm(`តើអ្នកចង់លុប "${name}" មែនទេ?`)) return;

  try {
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Product បានលុប!', 'success');
      loadProducts();
    } else {
      showToast(data.message || 'មានបញ្ហា', 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  }
}

// ─── Images Modal ──────────────────────────────────────
async function openImagesModal(productId) {
  managingImagesProductId = productId;
  document.getElementById('imagesModal').classList.add('open');
  await loadManageImages(productId);
}

function closeImagesModal() {
  document.getElementById('imagesModal').classList.remove('open');
  managingImagesProductId = null;
  document.getElementById('addMoreImages').value = '';
  loadProducts();
}

async function loadManageImages(productId) {
  const grid = document.getElementById('manageImagesGrid');
  grid.innerHTML = '<div style="padding:20px;color:#999"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    const res = await fetch(`/api/products/${productId}`);
    const data = await res.json();
    if (!data.success) return;

    const images = data.data.images || [];
    if (images.length === 0) {
      grid.innerHTML = '<p style="color:#999;padding:12px">មិនទាន់មានរូបភាព</p>';
      return;
    }

    grid.innerHTML = images.map(img => `
      <div class="manage-image-item ${img.is_main ? 'is-main' : ''}" id="img-${img.id}">
        ${img.is_main ? '<span class="main-badge">Main</span>' : ''}
        <img src="${img.image_path}" alt="product image" loading="lazy">
        <div class="manage-image-actions">
          ${!img.is_main ? `
            <button class="btn-set-main" onclick="setMainImage(${img.id}, ${productId})">
              <i class="fas fa-star"></i> Main
            </button>` : '<span style="font-size:0.72rem;color:#2e7d32;padding:4px">✓ Main</span>'
          }
          <button class="btn-danger" onclick="deleteImage(${img.id}, ${productId})" style="flex:1">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    grid.innerHTML = '<p style="color:red">Error loading images</p>';
  }
}

async function setMainImage(imageId, productId) {
  try {
    const res = await fetch(`/api/admin/images/${imageId}/main`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      showToast('Main image updated!', 'success');
      loadManageImages(productId);
    }
  } catch (err) {
    showToast('Error', 'error');
  }
}

async function deleteImage(imageId, productId) {
  if (!confirm('លុបរូបភាពនេះ?')) return;
  try {
    const res = await fetch(`/api/admin/images/${imageId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('រូបភាពបានលុប!', 'success');
      loadManageImages(productId);
    }
  } catch (err) {
    showToast('Error', 'error');
  }
}

async function uploadMoreImages() {
  const input = document.getElementById('addMoreImages');
  if (!input.files.length || !managingImagesProductId) return;

  const btn = document.getElementById('uploadMoreBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  try {
    const fd = new FormData();
    Array.from(input.files).forEach(f => fd.append('images', f));
    const res = await fetch(`/api/admin/products/${managingImagesProductId}/images`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('រូបភាពបានបន្ថែម!', 'success');
      input.value = '';
      loadManageImages(managingImagesProductId);
    } else {
      showToast(data.message || 'Error', 'error');
    }
  } catch (err) {
    showToast('Upload failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
  }
}

// ─── Update Category Dropdown with Tab Names ──────────
function updateCategoryDropdown(s) {
  const select = document.getElementById('productCategory');
  if (!select) return;
  // Update tab4/5/6 option labels
  [4, 5, 6].forEach(n => {
    const opt = select.querySelector(`option[value="tab${n}"]`);
    if (!opt) return;
    const name = s[`tab${n}_name`];
    const enabled = s[`tab${n}_enabled`];
    if (name && enabled) {
      opt.textContent = name;
      opt.style.display = '';
    } else {
      opt.style.display = 'none';
    }
  });
}

// ─── Settings ──────────────────────────────────────────
async function loadSettingsForm() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (!data.success || !data.data) return;
    const s = data.data;
    document.getElementById('shopName').value = s.shop_name || '';
    document.getElementById('shopDesc').value = s.shop_description || '';
    document.getElementById('shopPhone').value = s.shop_phone || '';
    document.getElementById('shopAddress').value = s.shop_address || '';
    document.getElementById('shopFacebook').value = s.facebook_link || '';
    document.getElementById('shopTelegram').value = s.telegram_link || '';
    document.getElementById('bannerTitle').value = s.banner_title || '';
    document.getElementById('bannerDesc').value = s.banner_desc || '';

    if (s.shop_logo) {
      document.getElementById('logoPreview').src = s.shop_logo;
      document.getElementById('logoPreview').style.display = 'block';
      document.getElementById('logoPlaceholder').style.display = 'none';
    }

    // Load tab settings
    [4, 5, 6].forEach(n => {
      const nameEl    = document.getElementById(`tab${n}Name`);
      const iconEl    = document.getElementById(`tab${n}Icon`);
      const enabledEl = document.getElementById(`tab${n}Enabled`);
      if (nameEl)    nameEl.value     = s[`tab${n}_name`]    || '';
      if (iconEl)    iconEl.value     = s[`tab${n}_icon`]    || 'fas fa-tag';
      if (enabledEl) enabledEl.checked = !!s[`tab${n}_enabled`];
    });

    // Update product category dropdown with actual tab names
    updateCategoryDropdown(s);

  } catch (err) {
    console.error('Settings load error:', err);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> កំពុងរក្សាទុក...';

  try {
    // Build FormData manually to avoid unexpected fields
    const fd = new FormData();
    fd.append('shop_name',        document.getElementById('shopName').value);
    fd.append('shop_description', document.getElementById('shopDesc').value);
    fd.append('shop_phone',       document.getElementById('shopPhone').value);
    fd.append('shop_address',     document.getElementById('shopAddress').value);
    fd.append('facebook_link',    document.getElementById('shopFacebook').value);
    fd.append('telegram_link',    document.getElementById('shopTelegram').value);
    fd.append('banner_title',     document.getElementById('bannerTitle').value);
    fd.append('banner_desc',      document.getElementById('bannerDesc').value);

    // Tab settings
    [4, 5, 6].forEach(n => {
      fd.append(`tab${n}_name`,    document.getElementById(`tab${n}Name`)?.value    || '');
      fd.append(`tab${n}_icon`,    document.getElementById(`tab${n}Icon`)?.value    || 'fas fa-tag');
      fd.append(`tab${n}_enabled`, document.getElementById(`tab${n}Enabled`)?.checked ? '1' : '0');
    });

    const logoFile = document.getElementById('logoInput').files[0];
    if (logoFile) fd.append('logo', logoFile);

    const res = await fetch('/api/admin/settings', { method: 'PUT', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('Settings បានរក្សាទុក!', 'success');
    } else {
      showToast(data.message || 'Error', 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> រក្សាទុក Settings';
  }
}

// ─── Password Change ───────────────────────────────────
async function handlePasswordChange(e) {
  e.preventDefault();
  const current = document.getElementById('currentPwd').value;
  const newPwd = document.getElementById('newPwd').value;
  const confirm = document.getElementById('confirmPwd').value;

  if (newPwd.length < 6) { showToast('Password ថ្មីត្រូវការយ៉ាងហោចណាស់ 6 តួ!', 'error'); return; }
  if (newPwd !== confirm) { showToast('Password ថ្មីមិនដូចគ្នា!', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> កំពុង...';

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: newPwd })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Password បានផ្លាស់ប្តូររួចហើយ!', 'success');
      e.target.reset();
    } else {
      showToast(data.message || 'Error', 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> ផ្លាស់ប្តូរ Password';
  }
}

// ─── Toast Notification ────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.className = `toast ${type} show`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
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

// ═══════════════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════════════

let allOrders = [];

// Setup orders event listeners (called once on page load)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshOrdersBtn')?.addEventListener('click', loadOrders);
  document.getElementById('orderFilterStatus')?.addEventListener('change', renderOrders);
});

// ─── Load Orders ──────────────────────────────────────
async function loadOrders() {
  const container = document.getElementById('ordersContainer');
  container.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> កំពុងផ្ទុក...</div>`;
  try {
    const res  = await fetch('/api/admin/orders');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    allOrders = data.data || [];
    renderOrders();
  } catch (e) {
    container.innerHTML = `<div class="orders-empty"><i class="fas fa-exclamation-circle"></i><p>${e.message}</p></div>`;
  }
}

// ─── Render Orders Table ──────────────────────────────
function renderOrders() {
  const container  = document.getElementById('ordersContainer');
  const filter     = document.getElementById('orderFilterStatus')?.value || 'all';
  const filtered   = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="orders-empty"><i class="fas fa-shopping-cart"></i><p>មិនមាន Order${filter !== 'all' ? ' (' + filter + ')' : ''}ទេ</p></div>`;
    return;
  }

  const rows = filtered.map(o => {
    const statusClass = `status-${o.status}`;
    const statusLabel = { pending: '⏳ Pending', confirmed: '🔵 Confirmed', delivered: '✅ Delivered', cancelled: '❌ Cancelled' }[o.status] || o.status;
    const img = o.product_image
      ? `<img src="${o.product_image}" class="order-product-img" alt="">`
      : `<div class="order-product-img" style="background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#bbb"><i class="fas fa-image"></i></div>`;
    const date = new Date(o.created_at).toLocaleDateString('km-KH', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const isDelivered = o.status === 'delivered' || o.status === 'cancelled';

    return `
      <tr data-id="${o.id}">
        <td><span style="color:#999;font-size:0.78rem">#${o.id}</span></td>
        <td>
          <div class="order-product-cell">
            ${img}
            <div>
              <div class="order-product-name">${escHtml(o.product_name)}</div>
              <div class="order-price">$${Number(o.product_price).toFixed(2)}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight:600">${escHtml(o.buyer_name)}</div>
          <a href="https://t.me/${o.buyer_telegram}" target="_blank" class="tg-link">@${escHtml(o.buyer_telegram)}</a>
          ${o.buyer_admin_link ? `<div><a href="${escHtml(o.buyer_admin_link)}" target="_blank" rel="noopener" class="tg-link"><i class="fas fa-link"></i> Admin Link</a></div>` : ''}
          ${o.buyer_phone ? `<div style="font-size:0.75rem;color:#888">${escHtml(o.buyer_phone)}</div>` : ''}
        </td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td class="order-date">${date}</td>
        <td>
          <div class="order-actions">
            ${!isDelivered ? `<button class="btn-confirm" onclick="confirmOrder(${o.id}, this)"><i class="fas fa-check"></i> Confirm</button>` : ''}
            <button class="btn-delete-order" onclick="deleteOrder(${o.id})"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="orders-table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ទំនិញ</th>
            <th>អ្នកទិញ</th>
            <th>Status</th>
            <th>ពេលវេលា</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Confirm Order ────────────────────────────────────
async function confirmOrder(id, btn) {
  if (!confirm('Confirm order នេះ ហើយផ្ញើ Telegram ទៅអ្នកទិញ?')) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const res  = await fetch(`/api/admin/orders/${id}/confirm`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('✅ ' + data.message, 'success');
      loadOrders();
    } else {
      showToast('❌ ' + data.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
    }
  } catch (e) {
    showToast('❌ Connection error!', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
  }
}

// ─── Delete Order ─────────────────────────────────────
async function deleteOrder(id) {
  if (!confirm('លុប Order នេះ?')) return;
  try {
    const res  = await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('🗑️ Order បានលុប!', 'success');
      loadOrders();
    } else {
      showToast('❌ ' + data.message, 'error');
    }
  } catch (e) {
    showToast('❌ Connection error!', 'error');
  }
}

// ─── Escape HTML helper ───────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
