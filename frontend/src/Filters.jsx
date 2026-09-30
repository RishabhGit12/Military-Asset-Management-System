export default function Filters({ meta, user, value, onChange }) {
  const set = k => e => onChange({ ...value, [k]: e.target.value });
  return <div className="filters">
    <input type="date" value={value.from || ''} onChange={set('from')} />
    <input type="date" value={value.to || ''} onChange={set('to')} />
    {user.role === 'admin' && <select value={value.base_id || ''} onChange={set('base_id')}>
      <option value="">All bases</option>{meta.bases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
    <select value={value.type_id || ''} onChange={set('type_id')}>
      <option value="">All equipment</option>{meta.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
  </div>;
}
