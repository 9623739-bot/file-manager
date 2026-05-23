const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { execSync } = require('child_process');

const app = express();
const PORT = 3456;
const UPLOAD_DIR = '/root/workspace/.uploads_staging';
// 允许访问的前缀白名单
const ALLOWED_PREFIXES = [
  '/root',
  '/home',
  '/tmp',
  '/data',
  '/mnt',
  '/media',
  '/var/www',
  '/var/log/hermes',
  '/usr/local',
];
const DEFAULT_ROOT = '/root/workspace';

function isPathAllowed(target) {
  const resolved = path.resolve(target);
  return ALLOWED_PREFIXES.some(prefix => resolved.startsWith(prefix));
}

// 确保 staging 目录存在
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const relPath = req.body.path || file.originalname;
    const fullPath = path.join(UPLOAD_DIR, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    cb(null, relPath);
  }
});
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── API: 列出目录 ───
app.get('/api/list', (req, res) => {
  try {
    const dir = req.query.dir || DEFAULT_ROOT;
    // 安全防护：防止路径穿越攻击
    const resolved = path.resolve(dir);
    if (!isPathAllowed(resolved)) {
      return res.status(403).json({ error: '禁止访问此路径' });
    }
    if (!fs.existsSync(resolved)) {
      return res.json({ dir: resolved, entries: [] });
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(d => ({
      name: d.name,
      isDir: d.isDirectory(),
      size: d.isDirectory() ? null : fs.statSync(path.join(resolved, d.name)).size,
      mtime: fs.statSync(path.join(resolved, d.name)).mtimeMs,
    }));
    // 排序：目录在前，按名称
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ dir: resolved, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 上传单个文件 ───
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    const targetDir = req.body.targetDir || DEFAULT_ROOT;
    const relPath = req.body.path || req.file.originalname;
    const dest = path.join(targetDir, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(req.file.path, dest);
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, file: relPath, dest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 批量上传 ───
app.post('/api/upload-batch', upload.array('files', 500), (req, res) => {
  try {
    const targetDir = req.body.targetDir || DEFAULT_ROOT;
    const results = [];
    for (const f of req.files) {
      const relPath = req.body['paths'] 
        ? JSON.parse(req.body['paths'])[req.files.indexOf(f)] 
        : f.originalname;
      const dest = path.join(targetDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(f.path, dest);
      fs.unlinkSync(f.path);
      results.push({ name: relPath, dest });
    }
    res.json({ ok: true, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 创建目录 ───
app.post('/api/mkdir', (req, res) => {
  try {
    const dirPath = path.resolve(path.join(req.body.parent || '/', req.body.name));
    if (!isPathAllowed(dirPath)) return res.status(403).json({ error: '禁止访问' });
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true, path: dirPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 重命名 ───
app.post('/api/rename', (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(403).json({ error: '禁止访问' });
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    if (!isPathAllowed(resolvedOld) || !isPathAllowed(resolvedNew)) {
      return res.status(403).json({ error: '禁止访问' });
    }
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 批量下载 ───
app.get('/api/download-batch', (req, res) => {
  try {
    const dir = req.query.dir || DEFAULT_ROOT;
    const paths = [];
    for (const [key, val] of Object.entries(req.query)) {
      if (key === 'path') {
        if (Array.isArray(val)) paths.push(...val);
        else paths.push(val);
      }
    }
    if (paths.length === 0) return res.status(400).json({ error: '没有指定文件' });
    // 安全防护：防止路径穿越
    for (const p of paths) {
      if (!isPathAllowed(path.resolve(p))) return res.status(403).json({ error: '禁止访问' });
    }
    const archive = archiver('zip', { zlib: { level: 5 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="selected.zip"`);
    archive.pipe(res);
    for (const p of paths) {
      const name = path.basename(p);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        archive.directory(p, name);
      } else {
        archive.file(p, { name });
      }
    }
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 删除 ───
app.post('/api/delete', (req, res) => {
  try {
    const target = req.body.path;
    if (!target) return res.status(403).json({ error: '禁止访问' });
    const resolved = path.resolve(target);
    if (!isPathAllowed(resolved)) return res.status(403).json({ error: '禁止访问' });
    if (fs.statSync(target).isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 解压压缩包 ───
app.post('/api/extract', (req, res) => {
  try {
    const filePath = req.body.path;
    if (!filePath) return res.status(403).json({ error: '缺少路径' });
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) return res.status(403).json({ error: '禁止访问' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: '文件不存在' });
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return res.status(400).json({ error: '目录无法解压' });

    const dir = path.dirname(resolved);
    const baseName = path.basename(resolved);
    const nameNoExt = baseName.replace(/\.(zip|tar\.gz|tgz|tar\.bz2|tar)$/i, '');

    // 解压到同名目录
    const extractDir = req.body.targetDir || path.join(dir, nameNoExt);
    fs.mkdirSync(extractDir, { recursive: true });

    const ext = baseName.toLowerCase();
    if (ext.endsWith('.zip')) {
      execSync(`unzip -o "${resolved}" -d "${extractDir}"`, { stdio: 'pipe' });
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      execSync(`tar xzf "${resolved}" -C "${extractDir}"`, { stdio: 'pipe' });
    } else if (ext.endsWith('.tar.bz2')) {
      execSync(`tar xjf "${resolved}" -C "${extractDir}"`, { stdio: 'pipe' });
    } else if (ext.endsWith('.tar')) {
      execSync(`tar xf "${resolved}" -C "${extractDir}"`, { stdio: 'pipe' });
    } else if (ext.endsWith('.gz') && !ext.endsWith('.tar.gz')) {
      // 单独的 .gz 文件
      execSync(`gunzip -c "${resolved}" > "${extractDir}/${nameNoExt}"`, { stdio: 'pipe' });
    } else {
      return res.status(400).json({ error: '不支持的解压格式' });
    }

    res.json({ ok: true, path: extractDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 下载文件 ───
app.get('/api/download', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(403).json({ error: '禁止访问' });
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) return res.status(403).json({ error: '禁止访问' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      // 目录 -> 打包下载
      const archive = archiver('zip', { zlib: { level: 5 } });
      res.setHeader('Content-Type', 'application/zip');
      const baseName = path.basename(filePath);
      const encName = encodeURIComponent(baseName);
      res.setHeader('Content-Disposition', `attachment; filename="${encName}.zip"`);
      archive.pipe(res);
      archive.directory(filePath, baseName);
      archive.finalize();
    } else {
      // 单个文件
      const name = path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
      res.sendFile(filePath);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 复制 ───
app.post('/api/copy', (req, res) => {
  try {
    const { sources, targetDir } = req.body;
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: '缺少源文件' });
    }
    const resolvedTarget = path.resolve(targetDir);
    if (!isPathAllowed(resolvedTarget)) return res.status(403).json({ error: '禁止访问' });
    const results = [];
    for (const src of sources) {
      const resolvedSrc = path.resolve(src);
      if (!isPathAllowed(resolvedSrc)) return res.status(403).json({ error: '禁止访问' });
      if (!fs.existsSync(resolvedSrc)) return res.status(404).json({ error: `文件不存在: ${src}` });
      const name = path.basename(resolvedSrc);
      const dest = path.join(resolvedTarget, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.statSync(resolvedSrc).isDirectory()) {
        execSync(`cp -r "${resolvedSrc}" "${dest}"`, { stdio: 'pipe' });
      } else {
        fs.copyFileSync(resolvedSrc, dest);
      }
      results.push({ name, src: resolvedSrc, dest });
    }
    res.json({ ok: true, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 移动 ───
app.post('/api/move', (req, res) => {
  try {
    const { sources, targetDir } = req.body;
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: '缺少源文件' });
    }
    const resolvedTarget = path.resolve(targetDir);
    if (!isPathAllowed(resolvedTarget)) return res.status(403).json({ error: '禁止访问' });
    for (const src of sources) {
      const resolvedSrc = path.resolve(src);
      if (!isPathAllowed(resolvedSrc)) return res.status(403).json({ error: '禁止访问' });
      if (!fs.existsSync(resolvedSrc)) return res.status(404).json({ error: `文件不存在: ${src}` });
      const name = path.basename(resolvedSrc);
      const dest = path.join(resolvedTarget, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        fs.renameSync(resolvedSrc, dest);
      } catch (renameErr) {
        // 跨设备移动，回退到 cp + rm
        const stat = fs.statSync(resolvedSrc);
        if (stat.isDirectory()) {
          execSync(`cp -r "${resolvedSrc}" "${dest}"`, { stdio: 'pipe' });
          fs.rmSync(resolvedSrc, { recursive: true, force: true });
        } else {
          fs.copyFileSync(resolvedSrc, dest);
          fs.unlinkSync(resolvedSrc);
        }
      }
    }
    res.json({ ok: true, count: sources.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 上传压缩包并解压 ───
app.post('/api/upload-archive', upload.single('archive'), (req, res) => {
  try {
    const targetDir = req.body.targetDir || DEFAULT_ROOT;
    const archPath = req.file.path;
    if (archPath.endsWith('.zip')) {
      execSync(`unzip -o "${archPath}" -d "${targetDir}"`, { stdio: 'pipe' });
    } else {
      execSync(`tar xzf "${archPath}" -C "${targetDir}"`, { stdio: 'pipe' });
    }
    fs.unlinkSync(archPath);
    res.json({ ok: true, target: targetDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 读取文件内容 ───
app.get('/api/read', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) return res.status(403).json({ error: '禁止访问' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: '文件不存在' });
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return res.status(400).json({ error: '不能读取目录' });
    // 限制读取 10MB 以上的文件
    if (stat.size > 10 * 1024 * 1024) return res.status(400).json({ error: '文件过大，无法在线编辑' });
    const content = fs.readFileSync(resolved, 'utf-8');
    const ext = path.extname(resolved).toLowerCase();
    res.json({ ok: true, content, ext, size: stat.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 保存文件内容 ───
app.post('/api/save', (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: '缺少路径' });
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) return res.status(403).json({ error: '禁止访问' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: '文件不存在' });
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return res.status(400).json({ error: '不能写入目录' });
    fs.writeFileSync(resolved, content, 'utf-8');
    res.json({ ok: true, path: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`File manager running on http://0.0.0.0:${PORT}`);
});
