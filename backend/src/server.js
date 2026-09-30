import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, q } from './db.js';
import { auth, allow, scopeBase, audit } from './middleware.js';

const app = express();
app.use(helmet(), cors({ origin: process.env.CORS_ORIGIN }), express.json(), audit);

const A = 'admin', C = 'base_commander', L = 'logistics_officer';
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const pos = n => Number.isInteger(n) && n > 0;

// ---------- Auth ----------
app.post('/api/auth/login', wrap(async (req, res) => {
  const [u] = await q('SELECT * FROM users WHERE username=$1', [req.body.username]);
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: u.id, role: u.role, base_id: u.base_id };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' }), user });
}));

app.use('/api', auth);

app.get('/api/meta', wrap(async (_req, res) =>
  res.json({ bases: await q('SELECT * FROM bases ORDER BY name'),
             types: await q('SELECT * FROM equipment_types ORDER BY name') })));

// ---------- Dashboard ----------
const filt = req => [scopeBase(req, req.query.base_id), req.query.type_id || null,
  req.query.from || '1970-01-01', req.query.to || new Date().toISOString()];

app.get('/api/dashboard', allow(A, C), wrap(async (req, res) => {
  const [r] = await q(`
    SELECT
     COALESCE(SUM(qty) FILTER (WHERE kind<>'assigned' AND ts <  $3),0)::int opening,
     COALESCE(SUM(qty) FILTER (WHERE kind='purchase'     AND ts BETWEEN $3 AND $4),0)::int purchases,
     COALESCE(SUM(qty) FILTER (WHERE kind='transfer_in'  AND ts BETWEEN $3 AND $4),0)::int transfer_in,
    -COALESCE(SUM(qty) FILTER (WHERE kind='transfer_out' AND ts BETWEEN $3 AND $4),0)::int transfer_out,
     COALESCE(SUM(qty) FILTER (WHERE kind='assigned'     AND ts BETWEEN $3 AND $4),0)::int assigned,
    -COALESCE(SUM(qty) FILTER (WHERE kind='expended'     AND ts BETWEEN $3 AND $4),0)::int expended,
     COALESCE(SUM(qty) FILTER (WHERE kind<>'assigned' AND ts <= $4),0)::int closing
    FROM movements
    WHERE ($1::int IS NULL OR base_id=$1) AND ($2::int IS NULL OR equipment_type_id=$2)`, filt(req));
  r.net_movement = r.purchases + r.transfer_in - r.transfer_out;
  res.json(r); // closing = opening + net_movement - expended
}));

app.get('/api/dashboard/net-movement', allow(A, C), wrap(async (req, res) => {   // pop-up detail
  const p = filt(req);
  const w = (b, t) => `($1::int IS NULL OR ${b}=$1) AND ($2::int IS NULL OR equipment_type_id=$2) AND ${t} BETWEEN $3 AND $4`;
  res.json({
    purchases: await q(`SELECT * FROM purchases WHERE ${w('base_id','purchased_at')} ORDER BY purchased_at DESC`, p),
    transfer_in: await q(`SELECT * FROM transfers WHERE ${w('to_base_id','transferred_at')} ORDER BY transferred_at DESC`, p),
    transfer_out: await q(`SELECT * FROM transfers WHERE ${w('from_base_id','transferred_at')} ORDER BY transferred_at DESC`, p) });
}));

// ---------- Purchases ----------
app.get('/api/purchases', allow(A, C, L), wrap(async (req, res) => {
  res.json(await q(`SELECT p.*, b.name base, e.name equipment FROM purchases p
    JOIN bases b ON b.id=p.base_id JOIN equipment_types e ON e.id=p.equipment_type_id
    WHERE ($1::int IS NULL OR p.base_id=$1) AND ($2::int IS NULL OR p.equipment_type_id=$2)
    AND p.purchased_at BETWEEN $3 AND $4 ORDER BY p.purchased_at DESC`, filt(req)));
}));
app.post('/api/purchases', allow(A, L), wrap(async (req, res) => {
  const base = scopeBase(req, req.body.base_id), { equipment_type_id, quantity } = req.body;
  if (!base || !pos(quantity)) return res.status(400).json({ error: 'base_id and positive quantity required' });
  const [row] = await q(`INSERT INTO purchases(base_id,equipment_type_id,quantity,created_by) VALUES($1,$2,$3,$4) RETURNING *`,
    [base, equipment_type_id, quantity, req.user.id]);
  res.status(201).json(row);
}));

// ---------- Transfers ----------
app.get('/api/transfers', allow(A, C, L), wrap(async (req, res) => {
  res.json(await q(`SELECT t.*, f.name from_base, d.name to_base, e.name equipment FROM transfers t
    JOIN bases f ON f.id=t.from_base_id JOIN bases d ON d.id=t.to_base_id JOIN equipment_types e ON e.id=t.equipment_type_id
    WHERE ($1::int IS NULL OR t.from_base_id=$1 OR t.to_base_id=$1) AND ($2::int IS NULL OR t.equipment_type_id=$2)
    AND t.transferred_at BETWEEN $3 AND $4 ORDER BY t.transferred_at DESC`, filt(req)));
}));
app.post('/api/transfers', allow(A, C, L), wrap(async (req, res) => {
  const from = scopeBase(req, req.body.from_base_id), { to_base_id, equipment_type_id, quantity } = req.body;
  if (!from || from === Number(to_base_id) || !pos(quantity)) return res.status(400).json({ error: 'Invalid transfer' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [from]);   // serialise per source base: no overdraw races
    const { rows: [s] } = await c.query(`SELECT COALESCE(SUM(qty),0)::int stock FROM movements
      WHERE base_id=$1 AND equipment_type_id=$2 AND kind<>'assigned'`, [from, equipment_type_id]);
    if (s.stock < quantity) { await c.query('ROLLBACK'); return res.status(409).json({ error: `Insufficient stock (${s.stock})` }); }
    const { rows: [t] } = await c.query(`INSERT INTO transfers(from_base_id,to_base_id,equipment_type_id,quantity,created_by)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [from, to_base_id, equipment_type_id, quantity, req.user.id]);
    await c.query('COMMIT');
    res.status(201).json(t);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

// ---------- Assignments & Expenditures (Admin, Commander) ----------
for (const [path, ts, extra] of [['assignments', 'assigned_at', 'assigned_to'], ['expenditures', 'expended_at', 'reason']]) {
  app.get(`/api/${path}`, allow(A, C), wrap(async (req, res) => {
    res.json(await q(`SELECT x.*, e.name equipment FROM ${path} x JOIN equipment_types e ON e.id=x.equipment_type_id
      WHERE ($1::int IS NULL OR x.base_id=$1) AND ($2::int IS NULL OR x.equipment_type_id=$2)
      AND x.${ts} BETWEEN $3 AND $4 ORDER BY x.${ts} DESC`, filt(req)));
  }));
  app.post(`/api/${path}`, allow(A, C), wrap(async (req, res) => {
    const base = scopeBase(req, req.body.base_id), { equipment_type_id, quantity } = req.body;
    if (!base || !pos(quantity) || (path === 'assignments' && !req.body.assigned_to))
      return res.status(400).json({ error: 'Invalid input' });
    const [row] = await q(`INSERT INTO ${path}(base_id,equipment_type_id,quantity,${extra},created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [base, equipment_type_id, quantity, req.body[extra] ?? null, req.user.id]);
    res.status(201).json(row);
  }));
}

app.get('/api/audit', allow(A), wrap(async (_req, res) =>
  res.json(await q('SELECT * FROM audit_log ORDER BY at DESC LIMIT 500'))));

app.listen(process.env.PORT || 4000);
