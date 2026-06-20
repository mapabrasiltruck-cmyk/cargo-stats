const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NUM_USERS = 5;

function request(method, path, data, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const body = data ? JSON.stringify(data) : null;
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch(e) { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function registerUser(i) {
    const email = `tester${i}@test.com`;
    const senha = 'test1234';
    const nome = `Tester ${i}`;
    console.log(`[USER ${i}] Registrando ${email}...`);
    const res = await request('POST', '/api/auth/register', { email, senha, nome });
    if (res.status === 200 || res.status === 409) {
        const login = await request('POST', '/api/auth/login', { email, senha });
        if (login.status === 200) {
            console.log(`[USER ${i}] Login OK (token: ${login.data.token.substring(0, 8)}...)`);
            return { email, nome, token: login.data.token, user: login.data.user };
        }
    }
    console.error(`[USER ${i}] Falha:`, res.data);
    return null;
}

async function createTrip(user, i) {
    const tripData = {
        motorista: user.nome,
        empresa: user.user.empresa || 'Lobo Solitário',
        data: new Date().toISOString().split('T')[0],
        origem: `Cidade${i}-${Date.now()}`,
        destino: `Destino${i}-${Date.now()}`,
        km: 100 + Math.floor(Math.random() * 500),
        pontuacao: 50 + Math.floor(Math.random() * 200),
        carga_nome: 'Container'
    };
    const res = await request('POST', '/api/viagens', tripData, user.token);
    return { user: user.nome, status: res.status, ok: res.data.ok, duplicate: res.data.duplicate || false };
}

async function runTest() {
    console.log('=== TESTE DE CONCORRENCIA - 5 USUARIOS SIMULTANEOS ===\n');

    const users = [];
    for (let i = 0; i < NUM_USERS; i++) {
        const user = await registerUser(i);
        if (user) users.push(user);
    }

    console.log(`\n${users.length} usuarios logados. Enviando viagens simultaneas...\n`);

    const tripPromises = users.map((user, i) => createTrip(user, i));
    const results = await Promise.all(tripPromises);

    console.log('=== RESULTADOS ===');
    let ok = 0, dup = 0, err = 0;
    for (const r of results) {
        if (r.ok && !r.duplicate) {
            console.log(`  ✓ ${r.user}: Viagem criada (${r.status})`);
            ok++;
        } else if (r.duplicate) {
            console.log(`  ! ${r.user}: Duplicata detectada`);
            dup++;
        } else {
            console.log(`  ✗ ${r.user}: ERRO (${r.status}) - ${JSON.stringify(r)}`);
            err++;
        }
    }
    console.log(`\n  OK: ${ok} | Duplicatas: ${dup} | Erros: ${err}`);

    console.log('\n=== VERIFICANDO INTEGRIDADE ===');
    const stats = await request('GET', '/api/stats');
    console.log(`  Stats:`, stats.data);

    const viagens = await request('GET', '/api/viagens');
    console.log(`  Total viagens no DB: ${viagens.data.viagens ? viagens.data.viagens.length : '?'}`);

    console.log('\n=== TESTE FINALIZADO ===');
}

runTest().catch(err => {
    console.error('Erro no teste:', err);
    process.exit(1);
});
