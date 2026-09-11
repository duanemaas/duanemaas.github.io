const statusEl = document.getElementById('status');
const tbody = document.querySelector('#courses-table tbody');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadCourses() {
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/courses');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    tbody.innerHTML = data.rows.map(row =>
      `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.city)}</td></tr>`
    ).join('');

    if (data.source === 'live') {
      statusEl.textContent = `${data.rows.length} courses, live from FileMaker.`;
    } else {
      statusEl.textContent = `${data.rows.length} courses from a snapshot taken ${data.capturedAt}. The FileMaker server isn't reachable over OData right now (${data.reason}).`;
      statusEl.classList.add('snapshot');
    }
  } catch (err) {
    statusEl.textContent = `Failed to load courses: ${err.message}`;
    statusEl.classList.add('error');
  }
}

loadCourses();
