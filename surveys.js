const statusEl = document.getElementById('status');
const tbody = document.querySelector('#surveys-table tbody');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadSurveys() {
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/surveys');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    tbody.innerHTML = data.map(row =>
      `<tr><td>${escapeHtml(row.SurveyID)}</td><td>${escapeHtml(row.Email)}</td><td class="num">${row.TotalScore ?? '—'}</td></tr>`
    ).join('');
    statusEl.textContent = `${data.length} surveys loaded.`;
  } catch (err) {
    statusEl.textContent = `Failed to load surveys: ${err.message}`;
    statusEl.classList.add('error');
  }
}

loadSurveys();
