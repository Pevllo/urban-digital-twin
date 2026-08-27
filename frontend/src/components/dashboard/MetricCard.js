export function renderMetricCard(title, value, unit = '', color = '#38bdf8') {
  return `
    <div style="background:rgba(15,23,42,0.6); padding:8px; border-radius:6px; border-left:3px solid ${color};">
      <div style="font-size:10px; color:#64748b;">${title}</div>
      <div style="font-size:14px; font-weight:700; color:#f8fafc;">${value} <span style="font-size:10px; color:#94a3b8;">${unit}</span></div>
    </div>
  `;
}
