import { useEffect, useState } from 'react';
import { api, setToken } from './api.js';
import Dashboard from './Dashboard.jsx';
import Ledger from './Ledger.jsx';

// Tabs per role (UX only; the server enforces the same rules)
const TABS = {
  admin: ['Dashboard', 'Purchases', 'Transfers', 'Assignments', 'Expenditures'],
  base_commander: ['Dashboard', 'Transfers', 'Assignments', 'Expenditures'],
  logistics_officer: ['Purchases', 'Transfers'],
};
const PAGES = {
  Purchases:    { path: '/purchases',    fields: ['base_id', 'equipment_type_id', 'quantity'], cols: ['purchased_at', 'base', 'equipment', 'quantity'] },
  // Transfers:    { path: '/transfers',    fields: ['to_base_id', 'equipment_type_id', 'quantity'], cols: ['transferred_at', 'from_base', 'to_base', 'equipment', 'quantity'] },
  Transfers:    { path: '/transfers',    fields: ['from_base_id', 'to_base_id', 'equipment_type_id', 'quantity'], cols: ['transferred_at', 'from_base', 'to_base', 'equipment', 'quantity'] },
  // Assignments:  { path: '/assignments',  fields: ['equipment_type_id', 'quantity', 'assigned_to'], cols: ['assigned_at', 'equipment', 'quantity', 'assigned_to'] },
  // Expenditures: { path: '/expenditures', fields: ['equipment_type_id', 'quantity', 'reason'], cols: ['expended_at', 'equipment', 'quantity', 'reason'] },
  Assignments:  { path: '/assignments',  fields: ['base_id', 'equipment_type_id', 'quantity', 'assigned_to'], cols: ['assigned_at', 'equipment', 'quantity', 'assigned_to'] },
  Expenditures: { path: '/expenditures', fields: ['base_id', 'equipment_type_id', 'quantity', 'reason'], cols: ['expended_at', 'equipment', 'quantity', 'reason'] },
};

export default function App() {
  const [user, setUser] = useState(JSON.parse(sessionStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState(null);
  const [meta, setMeta] = useState({ bases: [], types: [] });
  useEffect(() => { if (user) { setTab(TABS[user.role][0]); api('/meta').then(setMeta); } }, [user]);

  if (!user) return <Login onLogin={u => { sessionStorage.setItem('user', JSON.stringify(u)); setUser(u); }} />;
  const logout = () => { setToken(null); setUser(null); };
  return (
    <>
      <nav>{TABS[user.role].map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
        <button onClick={logout} className="right">Logout</button></nav>
      <main>{tab === 'Dashboard' ? <Dashboard meta={meta} user={user} />
        : tab && <Ledger key={tab} {...PAGES[tab]} meta={meta} user={user} />}</main>
    </>);
}

function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' }); const [err, setErr] = useState('');
  const submit = async e => { e.preventDefault(); try { const d = await api('/auth/login', { method: 'POST', body: f }); setToken(d.token); onLogin(d.user); } catch (x) { setErr(x.message); } };
  return <form className="card login" onSubmit={submit}><h2>MAMS Login</h2>
    <input placeholder="Username" onChange={e => setF({ ...f, username: e.target.value })} />
    <input type="password" placeholder="Password" onChange={e => setF({ ...f, password: e.target.value })} />
    <button>Sign in</button>{err && <p className="err">{err}</p>}</form>;
}
