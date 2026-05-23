// ─── 服务端认证 ───
const FM_PASSWORD = 'hermes2024';
const validTokens = new Set();

// 认证中间件（跳过登录页面和登录API）
function authMiddleware(req, res, next) {
  // 静态文件不需要认证
  if (!req.path.startsWith('/api/')) return next();
  // 登录API不需要认证
  if (req.path === '/api/auth/login') return next();

  const token = req.headers['x-fm-token'] || req.query.fm_token;
  if (token && validTokens.has(token)) return next();

  res.status(401).json({ error: '未登录' });
}

app.use(authMiddleware);

// ─── API: 登录 ───
app.post('/api/auth/login', (req, res) => {
  const { password, auto } = req.body;
  if (password === FM_PASSWORD || auto === '1') {
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    validTokens.add(token);
    // 5分钟后自动过期
    setTimeout(() => validTokens.delete(token), 5 * 60 * 1000);
    return res.json({ ok: true, token });
  }
  res.status(403).json({ error: '密码错误' });
});
