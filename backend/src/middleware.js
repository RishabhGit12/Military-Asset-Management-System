import jwt from 'jsonwebtoken';
import { q } from './db.js';

// 1. Authentication: verify JWT, attach { id, role, base_id }
export const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthenticated' }); }
};

// 2. Authorization: which roles may call this route
export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

// 3. Data scoping: admin may choose any base; others are pinned to their own
export const scopeBase = (req, requested) =>
  req.user.role === 'admin' ? (requested ? Number(requested) : null) : req.user.base_id;

// 4. Audit: every request is logged after the response is sent
export const audit = (req, res, next) => {
  res.on('finish', () => {
    const { password, ...body } = req.body || {};
    q(`INSERT INTO audit_log(user_id, role, method, path, status, body, ip) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [req.user?.id ?? null, req.user?.role ?? null, req.method, req.originalUrl, res.statusCode,
       JSON.stringify(body), req.ip]).catch(console.error);
  });
  next();
};
