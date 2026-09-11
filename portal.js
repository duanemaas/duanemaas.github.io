const statusEl = document.getElementById('status');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderRows(tbody, rows, columns) {
  tbody.innerHTML = rows.map(row =>
    '<tr>' + columns.map(col => `<td>${escapeHtml(row[col])}</td>`).join('') + '</tr>'
  ).join('');
}

async function loadTable(key, tbodySelector, columns) {
  const tbody = document.querySelector(tbodySelector);
  try {
    const res = await fetch(`/api/${key}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    renderRows(tbody, data, columns);
    return data.length;
  } catch (err) {
    statusEl.textContent = `Failed to load ${key}: ${err.message}`;
    statusEl.classList.add('error');
    return 0;
  }
}

async function init() {
  statusEl.textContent = 'Loading...';
  statusEl.classList.remove('error');

  const [accountCount, contactCount] = await Promise.all([
    loadTable('accounts', '#accounts-table tbody',
      ['ID_Account', 'Account', 'Account_Type', 'Status', 'Email', 'Phone1', 'Website', 'Billing_City', 'Billing_State_Province']),
    loadTable('contacts', '#contacts-table tbody',
      ['ID_Contact', 'Name_First', 'Name_Last', 'Title', 'Account_Name', 'Email', 'Phone1', 'Department', 'Status']),
  ]);

  if (!statusEl.classList.contains('error')) {
    statusEl.textContent = `${accountCount} accounts, ${contactCount} contacts loaded.`;
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
  });
});

init();
