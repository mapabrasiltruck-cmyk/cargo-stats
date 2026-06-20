const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const appDir = path.join(__dirname, '..', 'app');

// 1. Update node-abi in app
console.log('1. Atualizando node-abi...');
try {
    execSync('npm install node-abi@latest', { cwd: appDir, stdio: 'inherit' });
} catch(e) {
    console.log('   node-abi update failed:', e.message);
}

// 2. Delete old better-sqlite3 module
console.log('2. Removendo better-sqlite3 antigo...');
const bsDir = path.join(appDir, 'node_modules', 'better-sqlite3');
if (fs.existsSync(bsDir)) fs.rmSync(bsDir, { recursive: true });

// 3. Reinstall better-sqlite3 with prebuild targeting Electron
console.log('3. Reinstalando better-sqlite3 com prebuild para Electron...');
const electronVersion = '30.5.1';
const env = { ...process.env };
env.npm_config_target = electronVersion;
env.npm_config_runtime = 'electron';
env.npm_config_disturl = 'https://electronjs.org/headers/dist';

try {
    execSync(`npm install better-sqlite3@12.10.1 --build-from-source`, {
        cwd: appDir,
        stdio: 'inherit',
        env: env
    });
} catch(e) {
    console.log('   install falhou, tentando com prebuild-install...');
    try {
        execSync(`npm install better-sqlite3@12.10.1`, {
            cwd: appDir,
            stdio: 'inherit',
            env: env
        });
    } catch(e2) {
        console.log('   tentativa 2 falhou');
    }
}

// 4. Now rebuild for Electron
console.log('4. Rebuild para Electron...');
try {
    execSync(`npx @electron/rebuild -m ${appDir} -w better-sqlite3 -v ${electronVersion} --force`, {
        cwd: __dirname,
        stdio: 'inherit'
    });
} catch(e) {
    console.log('   rebuild falhou:', e.message);
}

// 5. Verify
const nativeFile = path.join(bsDir, 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(nativeFile)) {
    console.log('\n✅ Modulo nativo encontrado');
    console.log('   Tamanho:', fs.statSync(nativeFile).size, 'bytes');
} else {
    console.log('\n❌ Modulo nativo NAO encontrado');
}
