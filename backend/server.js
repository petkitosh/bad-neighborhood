const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'bad_neighborhood.db');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@badneighborhood.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMeNow123!';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(FRONTEND_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}_${safeBase}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only PNG, JPG/JPEG, and WebP are allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function signUser(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'reader',
    bio TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    excerpt TEXT DEFAULT '',
    content TEXT NOT NULL,
    tags TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    author_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(author_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chapter_id) REFERENCES chapters(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    plot INTEGER DEFAULT 0,
    characters INTEGER DEFAULT 0,
    pacing INTEGER DEFAULT 0,
    suspense INTEGER DEFAULT 0,
    style INTEGER DEFAULT 0,
    review TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chapter_id) REFERENCES chapters(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  const admin = await get(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`);
  if (!admin) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    await run(`INSERT INTO users (username, email, password_hash, role, bio) VALUES (?, ?, ?, 'admin', ?)`, [
      ADMIN_USERNAME,
      ADMIN_EMAIL,
      hash,
      'Site administrator.'
    ]);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Bad Neighborhood', time: new Date().toISOString() });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await run(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'reader')`, [username.trim(), email?.trim() || null, hash]);
    const user = await get(`SELECT id, username, email, role, bio FROM users WHERE id = ?`, [result.lastID]);
    res.json({ token: signUser(user), user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(400).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: 'Could not create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await get(`SELECT * FROM users WHERE username = ? OR email = ?`, [identifier, identifier]);
    if (!user) return res.status(400).json({ error: 'User not found' });
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Wrong password' });
    res.json({
      token: signUser(user),
      user: { id: user.id, username: user.username, email: user.email, role: user.role, bio: user.bio }
    });
  } catch (_error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', authRequired, async (req, res) => {
  const user = await get(`SELECT id, username, email, role, bio, created_at FROM users WHERE id = ?`, [req.user.id]);
  const stats = await get(`SELECT
      (SELECT COUNT(*) FROM chapters WHERE author_id = ?) AS chaptersCount,
      (SELECT COUNT(*) FROM comments WHERE user_id = ?) AS commentsCount,
      (SELECT COUNT(*) FROM feedback WHERE user_id = ?) AS feedbackCount`, [req.user.id, req.user.id, req.user.id]);
  res.json({ user, stats, bookmarks: [] });
});

app.get('/api/chapters', async (_req, res) => {
  const chapters = await all(`SELECT c.id, c.title, c.subtitle, c.excerpt, c.tags, c.cover_image, c.created_at, c.updated_at, u.username as author
    FROM chapters c JOIN users u ON c.author_id = u.id ORDER BY c.updated_at DESC, c.created_at DESC`);
  res.json(chapters);
});

app.get('/api/chapters/:id', async (req, res) => {
  const chapter = await get(`SELECT c.*, u.username as author
    FROM chapters c JOIN users u ON c.author_id = u.id WHERE c.id = ?`, [req.params.id]);
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
  const comments = await all(`SELECT comments.id, comments.content, comments.created_at, users.username
    FROM comments JOIN users ON comments.user_id = users.id
    WHERE comments.chapter_id = ? ORDER BY comments.created_at DESC`, [req.params.id]);
  const feedback = await all(`SELECT feedback.*, users.username
    FROM feedback JOIN users ON feedback.user_id = users.id
    WHERE feedback.chapter_id = ? ORDER BY feedback.created_at DESC`, [req.params.id]);
  const prev = await get(`SELECT id, title FROM chapters WHERE id < ? ORDER BY id DESC LIMIT 1`, [req.params.id]);
  const next = await get(`SELECT id, title FROM chapters WHERE id > ? ORDER BY id ASC LIMIT 1`, [req.params.id]);
  res.json({ chapter, comments, feedback, prev, next });
});

app.post('/api/chapters', authRequired, adminRequired, upload.single('cover'), async (req, res) => {
  const { title, subtitle = '', excerpt = '', content, tags = '' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
  const cover = req.file ? `/uploads/${req.file.filename}` : '';
  const result = await run(`INSERT INTO chapters (title, subtitle, excerpt, content, tags, cover_image, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [title, subtitle, excerpt, content, tags, cover, req.user.id]);
  const created = await get(`SELECT * FROM chapters WHERE id = ?`, [result.lastID]);
  res.json(created);
});

app.put('/api/chapters/:id', authRequired, adminRequired, upload.single('cover'), async (req, res) => {
  const current = await get(`SELECT * FROM chapters WHERE id = ?`, [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Chapter not found' });
  const { title = current.title, subtitle = current.subtitle, excerpt = current.excerpt, content = current.content, tags = current.tags } = req.body;
  const cover = req.file ? `/uploads/${req.file.filename}` : current.cover_image;
  await run(`UPDATE chapters SET title = ?, subtitle = ?, excerpt = ?, content = ?, tags = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    title, subtitle, excerpt, content, tags, cover, req.params.id
  ]);
  const updated = await get(`SELECT * FROM chapters WHERE id = ?`, [req.params.id]);
  res.json(updated);
});

app.delete('/api/chapters/:id', authRequired, adminRequired, async (req, res) => {
  await run(`DELETE FROM chapters WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/chapters/:id/comments', authRequired, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Comment is required' });
  const result = await run(`INSERT INTO comments (chapter_id, user_id, content) VALUES (?, ?, ?)`, [req.params.id, req.user.id, content]);
  const comment = await get(`SELECT comments.id, comments.content, comments.created_at, users.username
    FROM comments JOIN users ON comments.user_id = users.id WHERE comments.id = ?`, [result.lastID]);
  res.json(comment);
});

app.post('/api/chapters/:id/feedback', authRequired, async (req, res) => {
  const { plot = 0, characters = 0, pacing = 0, suspense = 0, style = 0, review = '' } = req.body;
  const result = await run(`INSERT INTO feedback (chapter_id, user_id, plot, characters, pacing, suspense, style, review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [req.params.id, req.user.id, plot, characters, pacing, suspense, style, review]);
  const item = await get(`SELECT feedback.*, users.username FROM feedback JOIN users ON feedback.user_id = users.id WHERE feedback.id = ?`, [result.lastID]);
  res.json(item);
});

app.get('/api/admin/stats', authRequired, adminRequired, async (_req, res) => {
  const stats = await get(`SELECT
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM chapters) as chapters,
    (SELECT COUNT(*) FROM comments) as comments,
    (SELECT COUNT(*) FROM feedback) as feedback`);
  const recent = await all(`SELECT id, title, created_at, updated_at FROM chapters ORDER BY updated_at DESC, created_at DESC LIMIT 10`);
  res.json({ stats, recent });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const requested = path.join(FRONTEND_DIR, req.path === '/' ? 'index.html' : req.path);
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) return res.sendFile(requested);
  return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Bad Neighborhood running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to start app:', error);
  process.exit(1);
});
