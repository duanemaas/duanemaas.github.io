const http = require('http');
const fs = require('fs');
const path = require('path');

// Local dev reads .env from the project folder; Render mounts it as a secret file in /etc/secrets.
const ENV_FILE = [path.join(__dirname, '.env'), '/etc/secrets/.env'].find(file => fs.existsSync(file));
if (ENV_FILE) process.loadEnvFile(ENV_FILE);

const auth = require('./auth');

const { PORT = 3000, SITE_USERNAME, SITE_PASSWORD_HASH, NODE_ENV, RENDER } = process.env;
const SESSION_COOKIE = 'session';
const SECURE_COOKIE = NODE_ENV === 'production';

function connection(prefix) {
  const env = process.env;
  return {
    base: `https://${env[`${prefix}_SERVER`]}/fmi/odata/v4/${encodeURIComponent(env[`${prefix}_FILE`])}`,
    auth: 'Basic ' + Buffer.from(`${env[`${prefix}_ACCOUNT`]}:${env[`${prefix}_PASSWORD`]}`).toString('base64'),
  };
}

const CONNECTIONS = {
  atrcc: connection('FM'),
  raynor: connection('RAYNOR'),
  lando: connection('LANDO'),
};

// FileMaker OData requires double quotes around field names containing spaces.
const TABLES = {
  accounts: {
    conn: 'atrcc',
    entity: 'T01_ACCOUNTS',
    select: ['ID_Account', 'Account', 'Account_Type', 'Status', 'Email', 'Phone1', 'Website', 'Billing_City', 'Billing_State_Province'],
    orderby: 'Account',
  },
  contacts: {
    conn: 'atrcc',
    entity: 'T05_CONTACTS',
    select: ['ID_Contact', 'Name_First', 'Name_Last', 'Title', 'Account_Name', 'Email', 'Phone1', 'Department', 'Status'],
    orderby: 'Name_Last',
  },
  courses: {
    conn: 'raynor',
    entity: 'Course',
    select: ['"Course Name"', 'City'],
    orderby: '"Course Name"',
  },
  surveys: {
    conn: 'lando',
    entity: 'Survey',
    select: ['SurveyID', 'Email', 'TotalScore'],
    orderby: 'StartDateTime desc',
  },
};

async function fetchTable(key) {
  const table = TABLES[key];
  const conn = CONNECTIONS[table.conn];
  // FileMaker rejects an encoded comma (%2C), so encode each name and join with a literal comma.
  const query = `$select=${table.select.map(encodeURIComponent).join(',')}&$orderby=${encodeURIComponent(table.orderby)}&$top=1000`;
  const res = await fetch(`${conn.base}/${encodeURIComponent(table.entity)}?${query}`, {
    headers: { Authorization: conn.auth, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`FileMaker OData request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.value || [];
}

const COURSES_SNAPSHOT = path.join(__dirname, 'data', 'courses-snapshot.json');

async function getCourses() {
  try {
    const rows = await fetchTable('courses');
    return {
      source: 'live',
      rows: rows.map(r => ({ name: (r['Course Name'] || '').trim(), city: (r.City || '').trim() })),
    };
  } catch (err) {
    const snapshot = JSON.parse(fs.readFileSync(COURSES_SNAPSHOT, 'utf8'));
    return { source: 'snapshot', reason: err.cause?.code || err.message, ...snapshot };
  }
}

const PUBLIC_FILES = {
  '/index.html': 'text/html',
  '/login.html': 'text/html',
  '/styles.css': 'text/css',
  '/portal.css': 'text/css',
  '/script.js': 'application/javascript',
  '/login.js': 'application/javascript',
};

const PROTECTED_FILES = {
  '/portal.html': 'text/html',
  '/courses.html': 'text/html',
  '/surveys.html': 'text/html',
  '/portal.js': 'application/javascript',
  '/courses.js': 'application/javascript',
  '/surveys.js': 'application/javascript',
};

const PROTECTED_PAGES = new Set(Object.keys(PROTECTED_FILES).filter(route => route.endsWith('.html')));

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendFile(res, route, mime) {
  fs.readFile(path.join(__dirname, route), (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(303, headers);
  res.end();
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${SECURE_COOKIE ? '; Secure' : ''}`;
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(new URLSearchParams(body)));
    req.on('error', reject);
  });
}

// On Render every request arrives via Cloudflare, which overwrites True-Client-IP with the real visitor
// address. Elsewhere the header could be forged, so only the socket address is trusted.
function clientIp(req) {
  return (RENDER && req.headers['true-client-ip']) || req.socket.remoteAddress;
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  let form;
  try {
    form = await readForm(req);
  } catch {
    res.writeHead(413);
    res.end();
    return;
  }

  const next = PROTECTED_PAGES.has(form.get('next')) ? form.get('next') : '/portal.html';
  const retry = error => redirect(res, `/login.html?error=${error}&next=${encodeURIComponent(next)}`);

  if (auth.isLockedOut(ip)) return retry('locked');

  // Hash the password even when the username is wrong so response timing doesn't reveal valid usernames.
  const passwordOk = auth.verifyPassword(form.get('password') || '', SITE_PASSWORD_HASH);
  if (!passwordOk || !SITE_USERNAME || form.get('username') !== SITE_USERNAME) {
    auth.recordFailure(ip);
    return retry(auth.isLockedOut(ip) ? 'locked' : 'invalid');
  }

  auth.clearFailures(ip);
  const token = auth.createSession(SITE_USERNAME);
  redirect(res, next, sessionCookie(token, auth.SESSION_TTL_MS / 1000));
}

async function handleApi(url, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (url.pathname === '/api/courses') {
      sendJson(res, 200, await getCourses());
    } else if (['/api/accounts', '/api/contacts', '/api/surveys'].includes(url.pathname)) {
      sendJson(res, 200, await fetchTable(url.pathname.replace('/api/', '')));
    } else {
      sendJson(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    sendJson(res, 502, { error: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = getCookie(req, SESSION_COOKIE);
  const session = token ? auth.getSession(token) : null;

  if (req.method === 'POST' && url.pathname === '/login') {
    return handleLogin(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/logout') {
    if (token) auth.destroySession(token);
    return redirect(res, '/login.html', sessionCookie('', 0));
  }

  if (url.pathname.startsWith('/api/')) {
    if (!session) return sendJson(res, 401, { error: 'Not logged in' });
    return handleApi(url, res);
  }

  const route = url.pathname === '/' ? '/index.html' : url.pathname;

  if (PROTECTED_FILES[route]) {
    if (!session) return redirect(res, `/login.html?next=${encodeURIComponent(route)}`);
    res.setHeader('Cache-Control', 'no-store');
    return sendFile(res, route, PROTECTED_FILES[route]);
  }

  if (PUBLIC_FILES[route]) {
    return sendFile(res, route, PUBLIC_FILES[route]);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!SITE_USERNAME || !SITE_PASSWORD_HASH) {
    console.warn('No login is configured, so nobody can sign in. Run: node set-password.js');
  }
});
