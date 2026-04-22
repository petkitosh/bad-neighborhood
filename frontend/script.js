const API_BASE = '';
const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
const getToken = () => localStorage.getItem('bn_token') || '';
const getUser = () => JSON.parse(localStorage.getItem('bn_user') || 'null');
const setSession = (token, user) => {
  localStorage.setItem('bn_token', token);
  localStorage.setItem('bn_user', JSON.stringify(user));
};
const clearSession = () => {
  localStorage.removeItem('bn_token');
  localStorage.removeItem('bn_user');
};

async function api(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function initNav() {
  qs('#menuBtn')?.addEventListener('click', () => qs('#navLinks')?.classList.toggle('open'));
  const auth = qs('#authArea');
  if (!auth) return;
  const user = getUser();
  if (user) {
    auth.innerHTML = `<div class="action-row"><span class="tag">${user.username}</span>${user.role === 'admin' ? '<a class="btn btn-secondary" href="admin-dashboard.html">Dashboard</a><a class="btn btn-secondary" href="write.html">Writer</a>' : ''}<button class="btn btn-ghost" id="logoutBtn">Logout</button></div>`;
    qs('#logoutBtn')?.addEventListener('click', () => { clearSession(); window.location.href = 'index.html'; });
  } else {
    auth.innerHTML = `<a class="btn btn-secondary" href="admin-login.html">Sign in</a>`;
  }
}

async function loadHomepage() {
  const wrap = qs('#featuredChapters');
  if (!wrap) return;
  try {
    const chapters = await api('/api/chapters');
    if (!chapters.length) {
      wrap.innerHTML = `<div class="card"><h3>No chapters yet</h3><p class="muted">The neighborhood is quiet right now. Sign in as admin to publish the first chapter.</p></div>`;
      return;
    }
    wrap.innerHTML = chapters.slice(0, 3).map(ch => `
      <article class="card chapter-card">
        ${ch.cover_image ? `<img class="chapter-cover" src="${ch.cover_image}" alt="${ch.title}">` : ''}
        <div class="meta"><span>${new Date(ch.created_at).toLocaleDateString()}</span><span>by ${ch.author}</span></div>
        <h3>${ch.title}</h3>
        <p class="muted">${ch.excerpt || ch.subtitle || 'No excerpt yet.'}</p>
        <a class="btn btn-primary" href="chapter.html?id=${ch.id}">Read chapter</a>
      </article>`).join('');
  } catch (error) {
    wrap.innerHTML = `<div class="notice">${error.message}</div>`;
  }
}

async function loadChaptersPage() {
  const list = qs('#chapterList');
  if (!list) return;
  try {
    let chapters = await api('/api/chapters');
    const render = () => {
      const search = (qs('#searchInput')?.value || '').trim().toLowerCase();
      const sort = qs('#sortSelect')?.value || 'newest';
      let filtered = chapters.filter(ch => `${ch.title} ${ch.excerpt} ${ch.tags}`.toLowerCase().includes(search));
      filtered.sort((a, b) => sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      if (!filtered.length) {
        list.innerHTML = `<div class="card"><h3>No chapters found</h3><p class="muted">Try a different search, or publish the first chapter.</p></div>`;
        return;
      }
      list.innerHTML = filtered.map(ch => `
        <article class="card chapter-card">
          ${ch.cover_image ? `<img class="chapter-cover" src="${ch.cover_image}" alt="${ch.title}">` : ''}
          <div class="meta"><span>${new Date(ch.created_at).toLocaleDateString()}</span><span>by ${ch.author}</span></div>
          <h3>${ch.title}</h3>
          <p class="muted">${ch.excerpt || ch.subtitle || 'No excerpt yet.'}</p>
          <div class="tags">${(ch.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${t.trim()}</span>`).join('')}</div>
          <div class="action-row"><a class="btn btn-primary" href="chapter.html?id=${ch.id}">Read</a>${getUser()?.role === 'admin' ? `<a class="btn btn-secondary" href="write.html?id=${ch.id}">Edit</a>` : ''}</div>
        </article>`).join('');
    };
    render();
    qs('#searchInput')?.addEventListener('input', render);
    qs('#sortSelect')?.addEventListener('change', render);
  } catch (error) {
    list.innerHTML = `<div class="notice">${error.message}</div>`;
  }
}

async function loadChapterPage() {
  const wrap = qs('#chapterView');
  if (!wrap) return;
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    wrap.innerHTML = `<div class="notice">Missing chapter id.</div>`;
    return;
  }
  try {
    const data = await api(`/api/chapters/${id}`);
    const isAdmin = getUser()?.role === 'admin';
    wrap.innerHTML = `
      <article class="reader">
        ${data.chapter.cover_image ? `<img class="chapter-hero" src="${data.chapter.cover_image}" alt="${data.chapter.title}">` : ''}
        <div class="reader-header">
          <div class="meta"><span>${data.chapter.author}</span><span>${new Date(data.chapter.created_at).toLocaleString()}</span></div>
          <h1>${data.chapter.title}</h1>
          <p class="muted">${data.chapter.subtitle || ''}</p>
          ${isAdmin ? `<div class="action-row"><a class="btn btn-secondary" href="write.html?id=${data.chapter.id}">Edit chapter</a></div>` : ''}
        </div>
        <div class="reader-body">${String(data.chapter.content || '').split(/\n\n+/).map(p => `<p>${p.replace(/</g,'&lt;')}</p>`).join('')}</div>
        <div class="action-row nav-between">
          ${data.prev ? `<a class="btn btn-ghost" href="chapter.html?id=${data.prev.id}">← ${data.prev.title}</a>` : '<span></span>'}
          ${data.next ? `<a class="btn btn-ghost" href="chapter.html?id=${data.next.id}">${data.next.title} →</a>` : ''}
        </div>
      </article>
      <aside class="card">
        <h3>Comments</h3>
        <form id="commentForm" style="display:grid;gap:.75rem;margin-bottom:1rem">
          <textarea id="commentText" class="textarea" placeholder="Leave a comment"></textarea>
          <button class="btn btn-primary">Post comment</button>
        </form>
        <div class="discussion-list">${data.comments.length ? data.comments.map(c => `<div class="discussion"><strong>${c.username}</strong><p class="muted">${c.content}</p></div>`).join('') : '<div class="notice">No comments yet.</div>'}</div>
        <hr class="divider">
        <h3>Feedback</h3>
        <form id="feedbackForm" style="display:grid;gap:.75rem;margin-bottom:1rem">
          <div class="rating-grid">
            <input id="plot" class="input" type="number" min="0" max="5" placeholder="Plot 0-5">
            <input id="characters" class="input" type="number" min="0" max="5" placeholder="Characters 0-5">
            <input id="pacing" class="input" type="number" min="0" max="5" placeholder="Pacing 0-5">
            <input id="suspense" class="input" type="number" min="0" max="5" placeholder="Suspense 0-5">
            <input id="style" class="input" type="number" min="0" max="5" placeholder="Style 0-5">
          </div>
          <textarea id="review" class="textarea" placeholder="Leave feedback"></textarea>
          <button class="btn btn-secondary">Submit feedback</button>
        </form>
        <div class="discussion-list">${data.feedback.length ? data.feedback.map(f => `<div class="discussion"><strong>${f.username}</strong><p class="muted small">Plot ${f.plot} • Characters ${f.characters} • Pacing ${f.pacing} • Suspense ${f.suspense} • Style ${f.style}</p><p class="muted">${f.review || ''}</p></div>`).join('') : '<div class="notice">No feedback yet.</div>'}</div>
      </aside>`;

    qs('#commentForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = qs('#commentText')?.value.trim();
      if (!content) return alert('Write a comment first.');
      try {
        await api(`/api/chapters/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
        window.location.reload();
      } catch (error) { alert(error.message); }
    });

    qs('#feedbackForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        plot: Number(qs('#plot').value || 0),
        characters: Number(qs('#characters').value || 0),
        pacing: Number(qs('#pacing').value || 0),
        suspense: Number(qs('#suspense').value || 0),
        style: Number(qs('#style').value || 0),
        review: qs('#review').value.trim()
      };
      try {
        await api(`/api/chapters/${id}/feedback`, { method: 'POST', body: JSON.stringify(payload) });
        window.location.reload();
      } catch (error) { alert(error.message); }
    });
  } catch (error) {
    wrap.innerHTML = `<div class="notice">${error.message}</div>`;
  }
}

function initAuthPage() {
  const loginForm = qs('#loginForm');
  const signupForm = qs('#signupForm');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: qs('#loginIdentifier').value.trim(), password: qs('#loginPassword').value })
      });
      setSession(data.token, data.user);
      window.location.href = data.user.role === 'admin' ? 'admin-dashboard.html' : 'profile.html';
    } catch (error) { alert(error.message); }
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username: qs('#signupUsername').value.trim(), email: qs('#signupEmail').value.trim(), password: qs('#signupPassword').value })
      });
      setSession(data.token, data.user);
      window.location.href = 'profile.html';
    } catch (error) { alert(error.message); }
  });
}

async function loadProfile() {
  const box = qs('#profileData');
  if (!box) return;
  try {
    const data = await api('/api/me');
    box.innerHTML = `<div class="card"><h1>${data.user.username}</h1><p class="muted">${data.user.bio || 'No bio yet.'}</p><div class="stats"><div class="stat"><strong>${data.stats.chaptersCount}</strong><span class="muted small">Chapters</span></div><div class="stat"><strong>${data.stats.commentsCount}</strong><span class="muted small">Comments</span></div><div class="stat"><strong>${data.stats.feedbackCount}</strong><span class="muted small">Feedback posts</span></div></div></div>`;
  } catch (error) {
    box.innerHTML = `<div class="notice">${error.message}. Please sign in first.</div>`;
  }
}

function requireAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    window.location.href = 'admin-login.html';
    return false;
  }
  return true;
}

async function initWritePage() {
  if (!qs('#writeForm')) return;
  if (!requireAdmin()) return;
  const editor = qs('#editor');
  const hidden = qs('#contentInput');
  const coverInput = qs('#cover');
  const coverPreview = qs('#coverPreview');
  const stats = qs('#editorStats');
  const titleInput = qs('#title');
  const subtitleInput = qs('#subtitle');
  const excerptInput = qs('#excerpt');
  const tagsInput = qs('#tags');
  const chapterId = new URLSearchParams(window.location.search).get('id');
  const autosaveKey = chapterId ? `bn_editor_draft_${chapterId}` : 'bn_editor_draft_new';
  const saveStatus = qs('#saveStatus');
  const formTitle = qs('#writeHeading');
  const formButton = qs('#publishBtn');

  function setStatus(text) { if (saveStatus) saveStatus.textContent = text; }

  function syncEditor() {
    hidden.value = editor.innerText.trim();
    const text = hidden.value;
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const mins = Math.max(1, Math.ceil(words / 200));
    stats.textContent = `${words} words • ${chars} chars • ${mins} min read`;
    localStorage.setItem(autosaveKey, JSON.stringify({ title: titleInput.value, subtitle: subtitleInput.value, excerpt: excerptInput.value, tags: tagsInput.value, content: editor.innerHTML }));
    setStatus('Draft saved locally.');
  }

  async function loadExistingChapter() {
    if (!chapterId) return;
    const data = await api(`/api/chapters/${chapterId}`);
    titleInput.value = data.chapter.title || '';
    subtitleInput.value = data.chapter.subtitle || '';
    excerptInput.value = data.chapter.excerpt || '';
    tagsInput.value = data.chapter.tags || '';
    editor.innerText = data.chapter.content || '';
    hidden.value = data.chapter.content || '';
    if (data.chapter.cover_image) {
      coverPreview.src = data.chapter.cover_image;
      coverPreview.classList.remove('hidden');
    }
    if (formTitle) formTitle.textContent = 'Edit chapter';
    if (formButton) formButton.textContent = 'Save changes';
    setStatus('Loaded existing chapter.');
  }

  const saved = localStorage.getItem(autosaveKey);
  if (saved) {
    try {
      const d = JSON.parse(saved);
      titleInput.value = d.title || '';
      subtitleInput.value = d.subtitle || '';
      excerptInput.value = d.excerpt || '';
      tagsInput.value = d.tags || '';
      editor.innerHTML = d.content || '';
      setStatus('Recovered local draft.');
    } catch {}
  }

  await loadExistingChapter();

  qsa('[data-command]').forEach(btn => btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.command, false, null);
    editor.focus();
    syncEditor();
  }));
  editor?.addEventListener('input', syncEditor);
  [titleInput, subtitleInput, excerptInput, tagsInput].forEach(field => field?.addEventListener('input', syncEditor));
  coverInput?.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    if (!file) return;
    coverPreview.src = URL.createObjectURL(file);
    coverPreview.classList.remove('hidden');
    setStatus('Cover selected.');
  });
  syncEditor();

  qs('#writeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    syncEditor();
    const fd = new FormData(e.target);
    try {
      const result = chapterId
        ? await api(`/api/chapters/${chapterId}`, { method: 'PUT', body: fd, headers: {} })
        : await api('/api/chapters', { method: 'POST', body: fd, headers: {} });
      localStorage.removeItem(autosaveKey);
      window.location.href = `chapter.html?id=${result.id}`;
    } catch (error) { alert(error.message); }
  });
}

async function loadAdminDashboard() {
  const box = qs('#adminData');
  if (!box) return;
  if (!requireAdmin()) return;
  try {
    const data = await api('/api/admin/stats');
    box.innerHTML = `
      <div class="stats">
        <div class="stat"><strong>${data.stats.users}</strong><span class="muted small">Users</span></div>
        <div class="stat"><strong>${data.stats.chapters}</strong><span class="muted small">Chapters</span></div>
        <div class="stat"><strong>${data.stats.comments}</strong><span class="muted small">Comments</span></div>
        <div class="stat"><strong>${data.stats.feedback}</strong><span class="muted small">Feedback posts</span></div>
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>Recent chapters</h3>
        ${data.recent.length ? data.recent.map(ch => `<div class="discussion"><strong>${ch.title}</strong><p class="muted small">Updated ${new Date(ch.updated_at || ch.created_at).toLocaleString()}</p><div class="action-row"><a class="btn btn-secondary" href="chapter.html?id=${ch.id}">View</a><a class="btn btn-secondary" href="write.html?id=${ch.id}">Edit</a><button class="btn btn-ghost" data-delete-id="${ch.id}">Delete</button></div></div>`).join('') : '<div class="notice">No chapters yet.</div>'}
      </div>`;
    qsa('[data-delete-id]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this chapter?')) return;
      try {
        await api(`/api/chapters/${btn.dataset.deleteId}`, { method: 'DELETE' });
        window.location.reload();
      } catch (error) { alert(error.message); }
    }));
  } catch (error) {
    box.innerHTML = `<div class="notice">${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  loadHomepage();
  loadChaptersPage();
  loadChapterPage();
  initAuthPage();
  loadProfile();
  initWritePage();
  loadAdminDashboard();
});
