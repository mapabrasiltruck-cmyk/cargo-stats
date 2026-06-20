const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const appDir = path.join(__dirname, '..', 'app');
const bsDir = path.join(appDir, 'node_modules', 'better-sqlite3');

// 1. Delete old build
console.log('1. Limpando build antigo...');
const buildDir = path.join(bsDir, 'build');
if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true });

// 2. Get Electron version
const electronPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'electron', 'package.json'), 'utf8'));
const electronVersion = electronPkg.version;
console.log('2. Electron version:', electronVersion);

// 3. Get Electron ABI
const electronAbi = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', 'electron', 'package.json'), 'utf8'));
console.log('3. Electron package version:', electronAbi.version);

// 4. Set environment for Electron rebuild
const env = { ...process.env };
env.npm_config_disturl = 'https://electronjs.org/headers/dist';
env.npm_config_target = electronVersion;
env.npm_config_arch = 'x64';
env.npm_config_target_arch = 'x64';
env.npm_config_disturl_electron = 'https://electronjs.org/headers/dist';

// 5. Run node-gyp rebuild
console.log('4. Rodando node-gyp rebuild...');
try {
    execSync(`npx node-gyp rebuild --release --arch=x64 --target=${electronVersion}`, {
        cwd: bsDir,
        stdio: 'inherit',
        env: env
    });
} catch(e) {
    console.log('5. node-gyp falhou, tentando npm rebuild...');
    try {
        execSync(`npm rebuild better-sqlite3 --build-from-source`, {
            cwd: appDir,
            stdio: 'inherit',
            env: env
        });
    } catch(e2) {
        console.log('5b. npm rebuild falhou, tentando com @electron/rebuild --force...');
        execSync(`npx @electron/rebuild --force -m ${appDir} -w better-sqlite3 -v ${electronVersion}`, {
            cwd: __dirname,
            stdio: 'inherit'
        });
    }
}

// 6. Verify
const nativeFile = path.join(buildDir, 'Release', 'better_sqlite3.node');
if (fs.existsSync(nativeFile)) {
    console.log('\n✅ Modulo nativo:', nativeFile);
    console.log('   Tamanho:', fs.statSync(nativeFile).size, 'bytes');
} else {
    console.log('\n❌ Modulo nao encontrado:', nativeFile);
}
