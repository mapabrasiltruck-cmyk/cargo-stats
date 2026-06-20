const fs = require('fs');
const path = require('path');

const bsDir = path.join(__dirname, '..', 'app', 'node_modules', 'better-sqlite3');

// Check for prebuilds
const prebuildsDir = path.join(bsDir, 'prebuilds');
console.log('Prebuilds exists:', fs.existsSync(prebuildsDir));
if (fs.existsSync(prebuildsDir)) {
    const entries = fs.readdirSync(prebuildsDir, { recursive: true });
    entries.forEach(e => console.log(' ', e));
}

// Check binding.gyp
const bindingPath = path.join(bsDir, 'binding.gyp');
console.log('binding.gyp exists:', fs.existsSync(bindingPath));

// Check package.json for install script
const pkgPath = path.join(bsDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
console.log('better-sqlite3 version:', pkg.version);
console.log('Install script:', pkg.scripts?.install || 'none');
console.log('Preinstall:', pkg.scripts?.preinstall || 'none');
