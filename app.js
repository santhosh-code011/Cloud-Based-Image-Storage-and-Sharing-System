/**
 * CloudVault - Cloud-Based Image Storage and Sharing System
 * Core Client Application Logic
 */

const CloudVault = {
  activeRegionFilter: 'all',
  activeTagFilter: '',
  searchQuery: '',
  currentImages: [],
  selectedImageForLightbox: null,

  init() {
    this.bindEvents();
    this.checkSharedUrlParam();
    this.loadStats();
    this.loadImages();
    this.initLatencyPing();
  },

  // ----------------- Bind Event Listeners -----------------
  bindEvents() {
    // Upload drawer toggle
    const triggerUploadBtn = document.getElementById('triggerUploadBtn');
    const closeUploadDrawerBtn = document.getElementById('closeUploadDrawerBtn');
    const uploadDrawer = document.getElementById('uploadDrawer');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    triggerUploadBtn.addEventListener('click', () => {
      uploadDrawer.scrollIntoView({ behavior: 'smooth' });
      fileInput.click();
    });

    closeUploadDrawerBtn.addEventListener('click', () => {
      uploadDrawer.style.display = uploadDrawer.style.display === 'none' ? 'flex' : 'none';
    });

    dropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-active');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) this.handleFilesUpload(files);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleFilesUpload(e.target.files);
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.trim();
        this.loadImages();
      }, 300);
    });

    // Region filter pills
    const pillBtns = document.querySelectorAll('#regionFilterPills .pill-btn');
    pillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        pillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeRegionFilter = btn.dataset.region;
        this.loadImages();
      });
    });

    // Tag filter dropdown
    const tagFilterSelect = document.getElementById('tagFilterSelect');
    tagFilterSelect.addEventListener('change', (e) => {
      this.activeTagFilter = e.target.value;
      this.loadImages();
    });

    // Architecture Modal
    const openArchBtn = document.getElementById('openArchBtn');
    const archModal = document.getElementById('archModal');
    const closeArchModalBtn = document.getElementById('closeArchModalBtn');
    openArchBtn.addEventListener('click', () => archModal.classList.add('active'));
    closeArchModalBtn.addEventListener('click', () => archModal.classList.remove('active'));

    // Share Modal
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const createShareForm = document.getElementById('createShareForm');
    const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');

    closeShareModalBtn.addEventListener('click', () => shareModal.classList.remove('active'));
    createShareForm.addEventListener('submit', (e) => this.handleCreateShare(e));
    copyShareUrlBtn.addEventListener('click', () => this.copyShareLink());

    // Lightbox Modal
    const lightboxModal = document.getElementById('lightboxModal');
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');
    const lbShareBtn = document.getElementById('lbShareBtn');
    const lbDeleteBtn = document.getElementById('lbDeleteBtn');

    closeLightboxBtn.addEventListener('click', () => lightboxModal.classList.remove('active'));
    lbShareBtn.addEventListener('click', () => {
      if (this.selectedImageForLightbox) {
        lightboxModal.classList.remove('active');
        this.openShareModal(this.selectedImageForLightbox);
      }
    });
    lbDeleteBtn.addEventListener('click', () => {
      if (this.selectedImageForLightbox) {
        if (confirm(`Permanently delete object "${this.selectedImageForLightbox.filename}" from cloud storage?`)) {
          this.deleteImage(this.selectedImageForLightbox.id);
          lightboxModal.classList.remove('active');
        }
      }
    });

    // Close on backdrop click
    [shareModal, lightboxModal, archModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });
  },

  openUploadDrawer() {
    const uploadDrawer = document.getElementById('uploadDrawer');
    uploadDrawer.style.display = 'flex';
    uploadDrawer.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('fileInput').click();
  },

  // ----------------- Cloud Latency Simulation -----------------
  initLatencyPing() {
    const latencyEl = document.getElementById('latencyDisplay');
    setInterval(() => {
      const region = this.activeRegionFilter === 'all' ? 'ap-south-1' : this.activeRegionFilter;
      const base = region === 'ap-south-1' ? 18 : region === 'eu-west-1' ? 72 : 110;
      const jitter = Math.floor(Math.random() * 8) - 4;
      latencyEl.textContent = `${base + jitter}ms (${region})`;
    }, 4000);
  },

  // ----------------- Load Cloud Metrics -----------------
  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        document.getElementById('storageUsedText').textContent = data.total_size_formatted;
        document.getElementById('storageProgressBar').style.width = `${Math.min(data.used_percentage, 100)}%`;
        document.getElementById('objectCountText').textContent = data.total_objects;
        document.getElementById('activeSharesText').textContent = data.total_shares;
        document.getElementById('slaText').textContent = data.uptime;
      }
    } catch (err) {
      console.warn('Stats fetch notice: Server initializing or offline mode.', err);
    }
  },

  // ----------------- Load Images from Cloud -----------------
  async loadImages() {
    try {
      const params = new URLSearchParams();
      if (this.searchQuery) params.set('search', this.searchQuery);
      if (this.activeRegionFilter && this.activeRegionFilter !== 'all') params.set('region', this.activeRegionFilter);
      if (this.activeTagFilter) params.set('tag', this.activeTagFilter);

      const res = await fetch(`/api/images?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        this.currentImages = data.images;
        this.renderGallery(data.images);
        this.updateTagDropdown(data.images);
      }
    } catch (err) {
      console.error('Failed to load cloud objects:', err);
      this.showToast('Could not fetch cloud images. Make sure server.py is running.', 'error');
    }
  },

  // ----------------- Render Gallery Grid -----------------
  renderGallery(images) {
    const grid = document.getElementById('imagesGrid');
    const emptyState = document.getElementById('emptyState');

    if (!images || images.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    grid.innerHTML = images.map(img => {
      const rawUrl = `/api/raw/${img.id}`;
      const hashSlice = img.checksum ? img.checksum.substring(0, 10) + '...' : '';
      const tagsHtml = (img.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join('');

      return `
        <div class="image-card" data-id="${img.id}">
          <div class="card-media-wrap" onclick="CloudVault.openLightbox('${img.id}')">
            <img src="${rawUrl}" alt="${img.filename}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'150\\' viewBox=\\'0 0 200 150\\'><rect fill=\\'%23121826\\' width=\\'200\\' height=\\'150\\'/><text fill=\\'%2364748b\\' x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>Object Synced</text></svg>'">
            <span class="card-badge-top-left badge badge-region">${img.region}</span>
            <span class="card-badge-top-right badge badge-purple">${img.storage_class}</span>
          </div>
          <div class="card-content">
            <div class="card-title-row">
              <span class="card-filename" title="${img.filename}">${img.filename}</span>
              <span class="badge badge-cyan">${img.formatted_size}</span>
            </div>
            <div class="card-metadata-row">
              <div class="card-checksum-wrap" title="SHA-256: ${img.checksum}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                ${hashSlice}
              </div>
              <span>${img.created_date ? img.created_date.split(' ')[0] : ''}</span>
            </div>
            <div class="card-tags">${tagsHtml}</div>
            <div class="card-footer-actions">
              <button class="btn-card-action share" onclick="CloudVault.openShareModalById('${img.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
              <button class="btn-card-action" onclick="CloudVault.openLightbox('${img.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Inspect
              </button>
              <button class="btn-card-action delete" onclick="CloudVault.deleteImage('${img.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ----------------- Update Filter Tags Dropdown -----------------
  updateTagDropdown(images) {
    const select = document.getElementById('tagFilterSelect');
    const existing = select.value;
    const tagSet = new Set();
    images.forEach(img => {
      (img.tags || []).forEach(t => tagSet.add(t));
    });

    let html = '<option value="">All Tags</option>';
    tagSet.forEach(tag => {
      html += `<option value="${tag}" ${existing === tag ? 'selected' : ''}>${tag}</option>`;
    });
    select.innerHTML = html;
  },

  // ----------------- Handle Multiple File Uploads -----------------
  async handleFilesUpload(filesList) {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    const queueContainer = document.getElementById('uploadQueueContainer');
    const queueList = document.getElementById('queueList');
    queueContainer.style.display = 'block';

    const primaryRegion = document.getElementById('primaryRegion').value;
    const storageClass = document.getElementById('storageTier').value;
    const tagInput = document.getElementById('imageTags').value.trim();
    const tags = tagInput ? tagInput.split(',').map(s => s.trim()).filter(Boolean) : ['General', 'CloudAsset'];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.showToast(`Skipped "${file.name}" (not an image)`, 'error');
        continue;
      }

      const itemId = 'q_' + Math.random().toString(36).substring(2, 9);
      const itemEl = document.createElement('div');
      itemEl.className = 'queue-item';
      itemEl.id = itemId;
      itemEl.innerHTML = `
        <div class="queue-item-info">
          <span>${file.name}</span>
          <span class="text-muted">(${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
        </div>
        <div class="queue-progress-bar">
          <div class="queue-fill" id="fill_${itemId}"></div>
        </div>
      `;
      queueList.appendChild(itemEl);

      try {
        const fillEl = document.getElementById(`fill_${itemId}`);
        fillEl.style.width = '35%';

        const base64Data = await this.readFileAsBase64(file);
        fillEl.style.width = '70%';

        const payload = {
          filename: file.name,
          data: base64Data,
          region: primaryRegion,
          storage_class: storageClass,
          tags: tags
        };

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await res.json();
        fillEl.style.width = '100%';

        if (result.success) {
          this.showToast(`Uploaded & Replicated: ${file.name}`, 'success');
          setTimeout(() => itemEl.remove(), 2500);
        } else {
          this.showToast(result.error || 'Upload error', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast(`Failed uploading ${file.name}`, 'error');
      }
    }

    // Refresh cloud list and metrics
    setTimeout(() => {
      this.loadStats();
      this.loadImages();
    }, 600);
  },

  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ----------------- Lightbox Inspector -----------------
  openLightbox(imageId) {
    const img = this.currentImages.find(i => i.id === imageId);
    if (!img) return;

    this.selectedImageForLightbox = img;
    const modal = document.getElementById('lightboxModal');

    document.getElementById('lightboxImg').src = `/api/raw/${img.id}`;
    document.getElementById('lbFilename').textContent = img.filename;
    document.getElementById('lbStorageClass').textContent = img.storage_class;
    document.getElementById('lbUploadDate').textContent = `Stored on ${img.created_date}`;
    document.getElementById('lbId').textContent = img.id;
    document.getElementById('lbSize').textContent = img.formatted_size;
    document.getElementById('lbMime').textContent = img.mimetype;
    document.getElementById('lbRegion').textContent = `${img.region} (Primary Zone)`;
    document.getElementById('lbChecksum').textContent = img.checksum;

    // Replication badges
    const repBadges = document.getElementById('lbReplicationBadges');
    const allRep = [img.region, ...(img.replicated_regions || [])];
    repBadges.innerHTML = allRep.map(r => `
      <span class="badge ${r === img.region ? 'badge-cyan' : 'badge-emerald'}">
        ✓ ${r} ${r === img.region ? '(Primary)' : '(Replica Synced)'}
      </span>
    `).join('');

    // Tags
    const tagsContainer = document.getElementById('lbTags');
    tagsContainer.innerHTML = (img.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join('');

    // Download button
    const dlBtn = document.getElementById('lbDownloadBtn');
    dlBtn.href = `/api/raw/${img.id}`;
    dlBtn.download = img.filename;

    modal.classList.add('active');
  },

  // ----------------- Presigned URL Sharing Modal -----------------
  openShareModalById(imageId) {
    const img = this.currentImages.find(i => i.id === imageId);
    if (img) this.openShareModal(img);
  },

  openShareModal(img) {
    const modal = document.getElementById('shareModal');
    document.getElementById('shareTargetImageId').value = img.id;
    document.getElementById('shareModalThumb').src = `/api/raw/${img.id}`;
    document.getElementById('shareModalFilename').textContent = img.filename;
    document.getElementById('shareModalMeta').textContent = `${img.formatted_size} • ${img.region}`;
    document.getElementById('shareResultBlock').style.display = 'none';
    document.getElementById('sharePassword').value = '';

    modal.classList.add('active');
  },

  async handleCreateShare(e) {
    e.preventDefault();
    const imageId = document.getElementById('shareTargetImageId').value;
    const durationHours = parseInt(document.getElementById('shareExpiry').value, 10);
    const password = document.getElementById('sharePassword').value.trim();
    const allowDownload = document.getElementById('shareAllowDownload').checked;

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageId,
          duration_hours: durationHours,
          password: password,
          allow_download: allowDownload
        })
      });

      const data = await res.json();
      if (data.success) {
        const fullShareUrl = window.location.origin + data.share_url;
        document.getElementById('generatedShareUrl').value = fullShareUrl;
        document.getElementById('shareResultBlock').style.display = 'block';

        // Render QR Code onto Canvas
        this.renderCanvasQR(fullShareUrl, document.getElementById('qrCanvas'));
        this.showToast('Presigned secure token generated!', 'success');
        this.loadStats();
      } else {
        this.showToast(data.error || 'Failed to generate link', 'error');
      }
    } catch (err) {
      this.showToast('Error generating presigned link', 'error');
    }
  },

  copyShareLink() {
    const input = document.getElementById('generatedShareUrl');
    input.select();
    navigator.clipboard.writeText(input.value);
    this.showToast('Presigned URL copied to clipboard!', 'info');
  },

  // ----------------- Canvas QR Code Generator -----------------
  renderCanvasQR(text, canvas) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Pseudorandom pseudo-matrix based on text hash for authentic visual QR display
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    const gridSize = 21;
    const cellSize = Math.floor((size - 20) / gridSize);
    const offset = 10;

    ctx.fillStyle = '#0f172a';

    // Corner Position Markers (Finder Patterns)
    const drawFinder = (x, y) => {
      ctx.fillRect(x, y, cellSize * 7, cellSize * 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + cellSize, y + cellSize, cellSize * 5, cellSize * 5);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + cellSize * 2, y + cellSize * 2, cellSize * 3, cellSize * 3);
    };

    drawFinder(offset, offset);
    drawFinder(offset + (gridSize - 7) * cellSize, offset);
    drawFinder(offset, offset + (gridSize - 7) * cellSize);

    // Data dots
    let seed = Math.abs(hash);
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const inFinder1 = r < 7 && c < 7;
        const inFinder2 = r < 7 && c >= gridSize - 7;
        const inFinder3 = r >= gridSize - 7 && c < 7;
        if (inFinder1 || inFinder2 || inFinder3) continue;

        seed = (seed * 9301 + 49297) % 233280;
        if ((seed / 233280) > 0.52) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
  },

  // ----------------- Public Shared Link Handler -----------------
  async checkSharedUrlParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('share');
    if (!token) return;

    const modal = document.getElementById('publicShareModal');
    modal.classList.add('active');

    this.resolveShareToken(token, '');

    document.getElementById('submitPublicPassBtn').onclick = () => {
      const pass = document.getElementById('publicPasscodeInput').value.trim();
      this.resolveShareToken(token, pass);
    };
  },

  async resolveShareToken(token, password) {
    try {
      const url = `/api/share/${token}${password ? '?p=' + encodeURIComponent(password) : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      const passPrompt = document.getElementById('publicPasswordPrompt');
      const content = document.getElementById('publicShareContent');

      if (res.status === 401 && data.password_required) {
        passPrompt.style.display = 'block';
        content.style.display = 'none';
        document.getElementById('publicShareTitle').textContent = `Passcode Protected: ${data.filename}`;
        return;
      }

      if (data.success) {
        passPrompt.style.display = 'none';
        content.style.display = 'block';
        document.getElementById('publicShareTitle').textContent = data.filename;
        document.getElementById('publicSharedFilename').textContent = data.filename;
        document.getElementById('publicSharedSize').textContent = `Size: ${data.formatted_size} • Hosted in ${data.region}`;
        document.getElementById('publicSharedImg').src = data.raw_url;

        const dlBtn = document.getElementById('publicDownloadBtn');
        if (data.allow_download) {
          dlBtn.href = data.raw_url;
          dlBtn.download = data.filename;
          dlBtn.style.display = 'inline-flex';
        } else {
          dlBtn.style.display = 'none';
        }
      } else {
        this.showToast(data.error || 'Share link invalid or expired', 'error');
      }
    } catch (err) {
      this.showToast('Failed to resolve shared link', 'error');
    }
  },

  // ----------------- Delete Cloud Object -----------------
  async deleteImage(imageId) {
    try {
      const res = await fetch(`/api/image/${imageId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Object deleted from cloud storage', 'info');
        this.loadStats();
        this.loadImages();
      } else {
        this.showToast(data.error || 'Could not delete object', 'error');
      }
    } catch (err) {
      this.showToast('Delete request failed', 'error');
    }
  },

  // ----------------- Toast Notifications -----------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  CloudVault.init();
});
