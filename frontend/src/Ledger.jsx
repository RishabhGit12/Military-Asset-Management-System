import { useEffect, useState } from 'react';
import { api } from './api.js';
import Filters from './Filters.jsx';

// Generic "form + history" page, reused for purchases, transfers, assignments, expenditures
export default function Ledger({ path, fields, cols, meta, user }) {
  const [f, setF] = useState({}); const [rows, setRows] = useState([]);
  const [form, setForm] = useState({}); const [msg, setMsg] = useState('');
  const load = () => api(path, { params: f }).then(setRows);
  useEffect(() => { load(); }, [f, path]);

  const submit = async e => {
    e.preventDefault(); setMsg('');
    try {
      await api(path, { method: 'POST', body: { ...form, quantity: Number(form.quantity) } });
      setForm({}); load();
    } catch (x) { setMsg(x.message); }
  };
  const input = k => {
    const set = e => setForm({ ...form, [k]: e.target.value });
    if (k === 'equipment_type_id') return <select key={k} required value={form[k] || ''} onChange={set}><option value="">Equipment</option>{meta.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
    if (k.endsWith('base_id')) return user.role === 'admin' || k === 'to_base_id'
      ? <select key={k} required value={form[k] || ''} onChange={set}><option value="">   {k === 'to_base_id' ? 'Destination base' : k === 'from_base_id' ? 'Source base' : 'Base'}</option>{meta.bases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : null;
    return <input key={k} required={k !== 'reason'} type={k === 'quantity' ? 'number' : 'text'} min="1" placeholder={k.replace('_', ' ')} value={form[k] || ''} onChange={set} />;
  };
  return <>
    <form className="card formrow" onSubmit={submit}>{fields.map(input)}<button>Record</button>{msg && <span className="err">{msg}</span>}</form>
    <Filters meta={meta} user={user} value={f} onChange={setF} />
    <div className="tablewrap"><table><thead><tr>{cols.map(c => <th key={c}>{c.replace('_', ' ')}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>{cols.map(c => <td key={c}>{c.endsWith('_at') ? new Date(r[c]).toLocaleString() : r[c]}</td>)}</tr>)}</tbody></table></div>
  </>;
}
