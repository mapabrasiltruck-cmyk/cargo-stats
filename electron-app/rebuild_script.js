const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rebuildDir = path.join(__dirname, '..', 'app', 'node_modules', 'better-sqlite3', 'build', 'Release');
const nativeFile = path.join(rebuildDir, 'better_sqlite3.node');

console.log('Verificando modulo nativo...');
if (fs.existsSync(nativeFile)) {
    const buf = fs.readFileSync(nativeFile);
    console.log('Tamanho:', buf.length, 'bytes');
    console.log('Header:', buf.slice(0, 4).toString('hex'));
}

console.log('\nDeletando build antigo...');
try { fs.rmSync(path.join(__dirname, '..', 'app', 'node_modules', 'better-sqlite3', 'build'), { recursive: true }); } catch(e) {}
try { fs.rmSync(path.join(__dirname, '..', 'app', 'node_modules', 'better-sqlite3', 'prebuilds'), { recursive: true }); } catch(e) {}

console.log('Rebuild forçado...');
const electronVersion = '30.5.1';
try {
    execSync(`npx @electron/rebuild -m ../app -f -v ${electronVersion}`, { 
        cwd: __dirname, 
        stdio: 'inherit' 
    });
} catch(e) {
    console.log('Tentando com npm rebuild...');
    execSync('npm rebuild better-sqlite3 --build-from-source', {
        cwd: path.join(__dirname, '..', 'app'),
        stdio: 'inherit'
    });
}

if (fs.existsSync(nativeFile)) {
    const buf = fs.readFileSync(nativeFile);
    console.log('\nModulo rebuilt:');
    console.log('Tamanho:', buf.length, 'bytes');
    console.log('Header:', buf.slice(0, 4).toString('hex'));
}
