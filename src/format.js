export const money = minor => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((minor || 0) / 100);
export const time = value => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : '—';

export function downloadCsv(name, rows) {
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const text = rows.map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
