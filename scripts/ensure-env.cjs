/* Creates .env from .env.example on first run so a fresh clone works without manual steps. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');
const example = path.join(root, '.env.example');

if (fs.existsSync(target)) {
  console.log('.env already exists - leaving it unchanged.');
} else if (fs.existsSync(example)) {
  fs.copyFileSync(example, target);
  console.log('Created .env from .env.example (demo mode on, demo password from the example file).');
} else {
  console.warn('.env.example not found - using built-in defaults.');
}
