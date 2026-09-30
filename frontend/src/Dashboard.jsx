import { useEffect, useState } from 'react';
import { api } from './api.js';
import Filters from './Filters.jsx';

export default function Dashboard({ meta, user }) {
  const [f, setF] = useState({}); const [d, setD] = useState(null); const [detail, setDetail] = useState(null);
  useEffect(() => { api('/dashboard', { params: f }).then(setD); }, [f]);
  const openNet = async () => setDetail(await api('/dashboard/net-movement', { params: f }));
  if (!d) return <p>Loading…</p>;
  const cards = [['Opening Balance', d.opening], ['Closing Balance', d.closing], ['Net Movement', d.net_movement, openNet],
                 ['Assigned', d.assigned], ['Expended', d.expended]];
  return <>
    <Filters meta={meta} user={user} value={f} onChange={setF} />
    <div className="grid">{cards.map(([label, val, click]) =>
      <div key={label} className={'card' + (click ? ' click' : '')} onClick={click}><small>{label}</small><h1>{val}</h1></div>)}</div>
    {detail && <div className="overlay" onClick={() => setDetail(null)}><div className="card modal" onClick={e => e.stopPropagation()}>
      <h3>Net Movement = Purchases {d.purchases} + In {d.transfer_in} − Out {d.transfer_out}</h3>
      {[['Purchases', detail.purchases], ['Transfers In', detail.transfer_in], ['Transfers Out', detail.transfer_out]].map(([t, rows]) =>
        <details key={t} open><summary>{t} ({rows.length})</summary>
          {rows.map(r => <div key={r.id} className="row">{new Date(r.purchased_at || r.transferred_at).toLocaleDateString()} · type #{r.equipment_type_id} · qty {r.quantity}</div>)}
        </details>)}
      <button onClick={() => setDetail(null)}>Close</button></div></div>}
  </>;
}
