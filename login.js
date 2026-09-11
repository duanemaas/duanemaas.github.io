const params = new URLSearchParams(location.search);
document.getElementById('next').value = params.get('next') || '';

const messages = {
  invalid: 'Incorrect username or password.',
  locked: 'Too many failed attempts. Try again in 15 minutes.',
};

const message = messages[params.get('error')];
if (message) {
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = message;
  errorEl.hidden = false;
}
