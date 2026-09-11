const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { hashPassword } = require('./auth');

const ENV_PATH = path.join(__dirname, '.env');
const MIN_LENGTH = 12;

function askHidden(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal: node set-password.js');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const username = (await rl.question('Username: ')).trim();
  rl.close();
  if (!/^[A-Za-z0-9._@-]+$/.test(username)) {
    console.error('Username may only contain letters, numbers, and . _ @ -');
    process.exit(1);
  }

  const password = await askHidden('Password: ');
  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  if (password !== await askHidden('Confirm password: ')) {
    console.error('Passwords did not match.');
    process.exit(1);
  }

  const kept = fs.readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter(line => !/^SITE_(USERNAME|PASSWORD_HASH)=/.test(line))
    .join('\n')
    .trimEnd();
  fs.writeFileSync(ENV_PATH, `${kept}\n\nSITE_USERNAME=${username}\nSITE_PASSWORD_HASH=${hashPassword(password)}\n`);
  console.log(`Login saved for "${username}". Restart the server to apply it.`);
}

main();
