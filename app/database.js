const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const DB_PATH = process.env.CARGOSTATS_DB_PATH || path.join(APP_DIR, 'data.db');

if (process.env.CARGOSTATS_DB_PATH) {
    const oldPath = path.join(APP_DIR, 'data.db');
    if (!fs.existsSync(process.env.CARGOSTATS_DB_PATH) && fs.existsSync(oldPath)) {
        try {
            fs.copyFileSync(oldPath, process.env.CARGOSTATS_DB_PATH);
            console.log('[DB] Migrado dados existentes para:', process.env.CARGOSTATS_DB_PATH);
        } catch (e) {
            console.error('[DB] Erro ao migrar dados:', e.message);
        }
    }
}

let db;

function getDB() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function initDB() {
    const db = getDB();

    db.exec(`
        CREATE TABLE IF NOT EXISTS empresas (
            nome TEXT PRIMARY KEY,
            logo TEXT DEFAULT '',
            banner TEXT DEFAULT '',
            descricao TEXT DEFAULT '',
            status TEXT DEFAULT 'aprovada',
            criada_por INTEGER,
            motoristas INTEGER DEFAULT 0,
            viagens INTEGER DEFAULT 0,
            km INTEGER DEFAULT 0,
            pontuacao INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS viagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            motorista TEXT NOT NULL,
            empresa TEXT NOT NULL,
            data TEXT NOT NULL,
            origem TEXT,
            destino TEXT,
            km INTEGER DEFAULT 0,
            pontuacao INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL,
            nome TEXT NOT NULL,
            tipo TEXT DEFAULT 'motorista',
            empresa TEXT,
            criado_em TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessoes (
            token TEXT PRIMARY KEY,
            usuario_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );

        CREATE TABLE IF NOT EXISTS ranking_cargas (
            empresa TEXT,
            motorista TEXT,
            categoria TEXT,
            total_viagens INTEGER DEFAULT 0,
            total_km INTEGER DEFAULT 0,
            total_pontos INTEGER DEFAULT 0,
            atualizado_em TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (empresa, motorista, categoria)
        );

        CREATE TABLE IF NOT EXISTS solicitacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            motorista TEXT NOT NULL,
            empresa TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            mensagem TEXT DEFAULT '',
            criada_em TEXT DEFAULT (datetime('now')),
            respondida_em TEXT
        );

        CREATE TABLE IF NOT EXISTS vagas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa TEXT NOT NULL,
            criada_por INTEGER NOT NULL,
            titulo TEXT NOT NULL,
            descricao TEXT DEFAULT '',
            categoria TEXT DEFAULT 'geral',
            qtd_vagas INTEGER DEFAULT 1,
            status TEXT DEFAULT 'aberta',
            criada_em TEXT DEFAULT (datetime('now')),
            atualizada_em TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS candidaturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vaga_id INTEGER NOT NULL,
            motorista TEXT NOT NULL,
            motorista_empresa TEXT DEFAULT 'Lobo Solitário',
            mensagem TEXT DEFAULT '',
            status TEXT DEFAULT 'pendente',
            criada_em TEXT DEFAULT (datetime('now')),
            respondida_em TEXT,
            FOREIGN KEY (vaga_id) REFERENCES vagas(id)
        );
    `);

    // ALTER TABLE: add new columns if missing
    try {
        const solCols = db.prepare(`PRAGMA table_info(solicitacoes)`).all();
        if (!solCols.some(c => c.name === 'tipo')) {
            db.exec(`ALTER TABLE solicitacoes ADD COLUMN tipo TEXT DEFAULT 'pedido'`);
        }
        if (!solCols.some(c => c.name === 'vaga_id')) {
            db.exec(`ALTER TABLE solicitacoes ADD COLUMN vaga_id INTEGER DEFAULT NULL`);
        }
    } catch (e) {}

    // Recreate motoristas table with proper PRIMARY KEY
    try {
        const cols = db.prepare(`PRAGMA table_info(motoristas)`).all();
        const hasPK = cols.some(c => c.pk > 0);
        if (!hasPK && cols.length > 0) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS motoristas_new (
                    nome TEXT NOT NULL,
                    empresa TEXT NOT NULL,
                    status TEXT DEFAULT 'Ativo',
                    cargo TEXT DEFAULT 'Motorista',
                    usuario_id INTEGER,
                    foto TEXT DEFAULT '',
                    PRIMARY KEY (nome, empresa)
                );
                INSERT OR IGNORE INTO motoristas_new (nome, empresa, status, cargo, usuario_id, foto)
                SELECT nome, empresa, status, cargo, usuario_id, foto FROM motoristas;
                DROP TABLE motoristas;
                ALTER TABLE motoristas_new RENAME TO motoristas;
            `);
        } else if (cols.length === 0) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS motoristas (
                    nome TEXT NOT NULL,
                    empresa TEXT NOT NULL,
                    status TEXT DEFAULT 'Ativo',
                    cargo TEXT DEFAULT 'Motorista',
                    funcao TEXT DEFAULT 'motorista',
                    usuario_id INTEGER,
                    foto TEXT DEFAULT '',
                    PRIMARY KEY (nome, empresa)
                );
            `);
        }
    } catch (e) {
    }

    try {
        const cols = db.prepare(`PRAGMA table_info(viagens)`).all();
        if (!cols.some(c => c.name === 'categoria_carga')) {
            db.exec(`ALTER TABLE viagens ADD COLUMN categoria_carga TEXT DEFAULT 'geral'`);
        }
        if (!cols.some(c => c.name === 'status')) {
            db.exec(`ALTER TABLE viagens ADD COLUMN status TEXT DEFAULT 'completa'`);
        }
        if (!cols.some(c => c.name === 'job_type')) {
            db.exec(`ALTER TABLE viagens ADD COLUMN job_type TEXT DEFAULT ''`);
        }
    } catch (e) {
    }

    try {
        const empCols = db.prepare(`PRAGMA table_info(empresas)`).all();
        if (!empCols.some(c => c.name === 'logo')) db.exec(`ALTER TABLE empresas ADD COLUMN logo TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'banner')) db.exec(`ALTER TABLE empresas ADD COLUMN banner TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'descricao')) db.exec(`ALTER TABLE empresas ADD COLUMN descricao TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'status')) db.exec(`ALTER TABLE empresas ADD COLUMN status TEXT DEFAULT 'aprovada'`);
        if (!empCols.some(c => c.name === 'criada_por')) db.exec(`ALTER TABLE empresas ADD COLUMN criada_por INTEGER`);
        if (!empCols.some(c => c.name === 'webhook_url')) db.exec(`ALTER TABLE empresas ADD COLUMN webhook_url TEXT DEFAULT ''`);
    } catch (e) {
    }

    try {
        const motCols = db.prepare(`PRAGMA table_info(motoristas)`).all();
        if (!motCols.some(c => c.name === 'cargo')) db.exec(`ALTER TABLE motoristas ADD COLUMN cargo TEXT DEFAULT 'Motorista'`);
        if (!motCols.some(c => c.name === 'usuario_id')) db.exec(`ALTER TABLE motoristas ADD COLUMN usuario_id INTEGER`);
        if (!motCols.some(c => c.name === 'foto')) db.exec(`ALTER TABLE motoristas ADD COLUMN foto TEXT DEFAULT ''`);
        if (!motCols.some(c => c.name === 'funcao')) db.exec(`ALTER TABLE motoristas ADD COLUMN funcao TEXT DEFAULT 'motorista'`);
    } catch (e) {
    }

    try {
        db.prepare(`
            UPDATE motoristas SET funcao = 'dono'
            WHERE usuario_id IN (
                SELECT e.criada_por FROM empresas e WHERE e.nome = motoristas.empresa AND e.criada_por IS NOT NULL
            ) AND funcao = 'motorista'
        `).run();
    } catch (e) {
    }

    try {
        db.prepare(`UPDATE motoristas SET funcao = 'chefe_rh' WHERE funcao = 'admin'`).run();
    } catch (e) {
    }

    try {
        const userCols = db.prepare(`PRAGMA table_info(usuarios)`).all();
        if (!userCols.some(c => c.name === 'discord_webhook')) {
            db.exec(`ALTER TABLE usuarios ADD COLUMN discord_webhook TEXT DEFAULT ''`);
        }
        if (!userCols.some(c => c.name === 'steam_id')) {
            db.exec(`ALTER TABLE usuarios ADD COLUMN steam_id TEXT DEFAULT ''`);
        }
        if (!userCols.some(c => c.name === 'avatar')) {
            db.exec(`ALTER TABLE usuarios ADD COLUMN avatar TEXT DEFAULT ''`);
        }
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS cargas_pendentes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_original TEXT NOT NULL,
                cargo_id TEXT DEFAULT '',
                categoria_sugerida TEXT DEFAULT 'a_classificar',
                ocorrencias INTEGER DEFAULT 1,
                criada_em TEXT DEFAULT (datetime('now')),
                classificada_em TEXT,
                UNIQUE(nome_original)
            );
        `);
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                titulo TEXT NOT NULL,
                descricao TEXT NOT NULL,
                parametros TEXT DEFAULT '{}',
                data_inicio TEXT NOT NULL,
                data_fim TEXT NOT NULL,
                ativo INTEGER DEFAULT 1,
                criado_por TEXT DEFAULT 'sistema'
            );

            CREATE TABLE IF NOT EXISTS progresso_evento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                evento_id INTEGER NOT NULL,
                empresa TEXT NOT NULL,
                motorista TEXT NOT NULL,
                progresso INTEGER DEFAULT 0,
                meta_atingida INTEGER DEFAULT 0,
                bonus_recebido INTEGER DEFAULT 0,
                cidades_visitadas TEXT DEFAULT '[]',
                atualizado_em TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (evento_id) REFERENCES eventos(id),
                UNIQUE(evento_id, motorista)
            );
        `);
    } catch (e) {
    }

    try {
        db.prepare(`ALTER TABLE progresso_evento ADD COLUMN cidades_visitadas TEXT DEFAULT '[]'`).run();
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS conquistas_empresa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                empresa TEXT NOT NULL,
                conquista_id TEXT NOT NULL,
                desbloqueada_em TEXT DEFAULT (datetime('now')),
                UNIQUE(empresa, conquista_id)
            );
        `);
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS loja_titulos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                icone TEXT DEFAULT '🏅',
                descricao TEXT DEFAULT '',
                preco_pontos INTEGER DEFAULT 0,
                tipo TEXT DEFAULT 'titulo',
                ativo INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS loja_inventario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                motorista TEXT NOT NULL,
                titulo_id INTEGER NOT NULL,
                equipado INTEGER DEFAULT 0,
                comprado_em TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (titulo_id) REFERENCES loja_titulos(id)
            );
        `);
    } catch (e) {
    }

    try {
        const lojaCols = db.prepare(`PRAGMA table_info(loja_titulos)`).all();
        if (!lojaCols.some(c => c.name === 'requer_plano')) {
            db.exec(`ALTER TABLE loja_titulos ADD COLUMN requer_plano TEXT DEFAULT NULL`);
        }
    } catch (e) {}

    try {
        const lojaCols2 = db.prepare(`PRAGMA table_info(loja_titulos)`).all();
        if (!lojaCols2.some(c => c.name === 'imagem_url')) {
            db.exec(`ALTER TABLE loja_titulos ADD COLUMN imagem_url TEXT DEFAULT NULL`);
        }
    } catch (e) {}

    // Deduplicate loja_titulos by nome (keep lowest id)
    db.exec(`DELETE FROM loja_titulos WHERE id NOT IN (SELECT MIN(id) FROM loja_titulos GROUP BY nome)`);
    // Create unique index to prevent future duplicates
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_titulos_nome ON loja_titulos(nome)`); } catch(e) {}

    // Seed map items (only if none exist)
    const mapCount = db.prepare(`SELECT COUNT(*) AS c FROM loja_titulos WHERE tipo = 'mapa'`).get();
    if (mapCount.c === 0) {
        const seedMap = db.prepare(`INSERT OR IGNORE INTO loja_titulos (nome, icone, descricao, preco_pontos, tipo, requer_plano, imagem_url) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        seedMap.run('Mapa Brasilsão', '🗺️', 'Mapa exclusivo da rota Brasilsão', 1000000, 'mapa', null, 'images/brasilsao.png');
        seedMap.run('Mapa Brasil Gigante', '🗺️', 'Mapa exclusivo do Brasil Gigante', 1000000, 'mapa', null, 'images/brasil_gigante.png');
        seedMap.run('Mapa Brasil Truck', '🗺️', 'Mapa exclusivo do Brasil Truck', 1000000, 'mapa', null, 'images/brasil_truck.png');
        seedMap.run('Mapa Rotas Urbanas', '🗺️', 'Mapa exclusivo das Rotas Urbanas', 1000000, 'mapa', null, 'images/rotas_urbanas.png');
    }

    try {
        const motCols2 = db.prepare(`PRAGMA table_info(motoristas)`).all();
        if (!motCols2.some(c => c.name === 'cs_gold')) {
            db.exec(`ALTER TABLE motoristas ADD COLUMN cs_gold INTEGER DEFAULT 0`);
        }
        if (!motCols2.some(c => c.name === 'plano')) {
            db.exec(`ALTER TABLE motoristas ADD COLUMN plano TEXT DEFAULT 'bronze'`);
        }
        if (!motCols2.some(c => c.name === 'plano_expira')) {
            db.exec(`ALTER TABLE motoristas ADD COLUMN plano_expira TEXT`);
        }
        if (!motCols2.some(c => c.name === 'abandonos')) {
            db.exec(`ALTER TABLE motoristas ADD COLUMN abandonos INTEGER DEFAULT 0`);
        }
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS penalidades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                viagem_id INTEGER NOT NULL,
                motorista TEXT NOT NULL,
                empresa TEXT NOT NULL,
                valor INTEGER NOT NULL,
                tipo TEXT DEFAULT 'abandono',
                processada INTEGER DEFAULT 0,
                criada_em TEXT DEFAULT (datetime('now')),
                processada_em TEXT,
                FOREIGN KEY (viagem_id) REFERENCES viagens(id)
            );
        `);
    } catch (e) {
    }

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS evolucao_motorista (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                motorista TEXT NOT NULL,
                empresa TEXT NOT NULL,
                cargo_anterior TEXT NOT NULL,
                cargo_novo TEXT NOT NULL,
                km_na_evolucao INTEGER DEFAULT 0,
                bonus_cs_gold INTEGER DEFAULT 0,
                criada_em TEXT DEFAULT (datetime('now'))
            );
        `);
    } catch (e) {
    }

    // Seed initial shop titles if none exist
    const tituloCount = db.prepare(`SELECT COUNT(*) AS c FROM loja_titulos`).get();
    if (tituloCount.c === 0) {
        const seed = db.prepare(`INSERT INTO loja_titulos (nome, icone, descricao, preco_pontos, tipo, requer_plano) VALUES (?, ?, ?, ?, ?, ?)`);
        seed.run('Troféu Doador', '🏆', 'Apoiador oficial do Cargo Stats', 0, 'titulo', null);
        seed.run('Membro Gold', '🥇', 'Plano Gold — destaque no ranking e 3 slots de título', 0, 'plano', null);
        seed.run('Membro VIP', '💎', 'Plano VIP — destaque, 5 slots e títulos exclusivos', 0, 'plano', null);
        seed.run('Caminhoneiro Premium', '🏅', 'Título exclusivo do plano Gold', 0, 'plano', null);
        seed.run('Lenda do Asfalto', '🔥', 'Título exclusivo do plano VIP', 0, 'plano', null);
        seed.run('Rei da Estrada', '👑', 'Domine as estradas com este título real', 250000, 'titulo', null);
        seed.run('Motorista Lendário', '🌟', 'Apenas os melhores motoristas merecem', 500000, 'titulo', null);
        seed.run('Explorador', '🗺️', 'Para quem já visitou cada canto do mapa', 150000, 'titulo', null);
        seed.run('Velocista', '⚡', 'Velocidade é sua marca registrada', 200000, 'titulo', null);
        seed.run('Carga Pesada', '💪', 'Especialista em cargas de grande porte', 300000, 'titulo', null);
        seed.run('Colecionador', '📦', 'Mestre das entregas e coleções', 100000, 'titulo', null);
        seed.run('Lobo Solitário', '🐺', 'Honrando a tradição dos lobos solitários', 50000, 'titulo', null);
        seed.run('Diamante Negro', '💎', 'Raro como um diamante negro', 1000000, 'titulo', null);
        seed.run('Frota Poderosa', '🚚', 'Líder de uma frota imbatível', 750000, 'titulo', null);
        seed.run('Mestre das Cargas', '📦', 'Domine todos os tipos de carga', 250000, 'titulo', 'gold');
        seed.run('Transportador Elite', '⭐', 'Excelência em cada entrega', 400000, 'titulo', 'gold');
        seed.run('Imperador das Estradas', '👑', 'Reine absoluto sobre as rodovias', 800000, 'titulo', 'vip');
        seed.run('Milionário do Volante', '💰', 'Acumule riquezas nas estradas', 1500000, 'titulo', 'vip');
        seed.run('Rei do Cargo Stats', '🏆', 'O título mais raro de todos', 3000000, 'titulo', 'vip');
    }

    limparSessoesExpiradas(db);

    return db;
}

function recalcularEmpresa(nomeEmpresa) {
    if (!nomeEmpresa) return;
    nomeEmpresa = nomeEmpresa.trim();
    if (nomeEmpresa === '' || nomeEmpresa === 'Lobo Solitário') return;
    const db = getDB();
    const row = db.prepare(`
        SELECT
            (SELECT COUNT(DISTINCT m.nome) FROM motoristas m WHERE m.empresa = ?) AS motoristas,
            COUNT(*) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM viagens v
        WHERE v.empresa = ? AND v.status = 'completa'
    `).get(nomeEmpresa, nomeEmpresa);
    const m = row.motoristas || 0, v = row.viagens || 0, k = row.km || 0, p = row.pontuacao || 0;
    const exists = db.prepare(`SELECT nome FROM empresas WHERE nome = ?`).get(nomeEmpresa);
    if (exists) {
        db.prepare(`UPDATE empresas SET motoristas = ?, viagens = ?, km = ?, pontuacao = ? WHERE nome = ?`).run(m, v, k, p, nomeEmpresa);
    } else {
        db.prepare(`INSERT INTO empresas (nome, logo, banner, descricao, status, criada_por, motoristas, viagens, km, pontuacao) VALUES (?, '', '', '', 'aprovada', NULL, ?, ?, ?, ?)`).run(nomeEmpresa, m, v, k, p);
    }
}

function recalcEmpresas() {
    const db = getDB();
    const empresasComViagens = db.prepare(`SELECT DISTINCT v.empresa FROM viagens v WHERE v.empresa != 'Lobo Solitário'`).all();
    const empresasExistentes = db.prepare(`SELECT nome FROM empresas`).all().map(e => e.nome);
    const tx = db.transaction(() => {
        for (const ev of empresasComViagens) {
            recalcularEmpresa(ev.empresa);
        }
        for (const nome of empresasExistentes) {
            if (!empresasComViagens.find(e => e.empresa === nome)) {
                const motCount = db.prepare(`SELECT COUNT(*) AS c FROM motoristas WHERE empresa = ?`).get(nome);
                db.prepare(`UPDATE empresas SET motoristas = ?, viagens = 0, km = 0, pontuacao = 0 WHERE nome = ?`).run(motCount.c, nome);
            }
        }
    });
    tx();
}

function getEmpresas(mes, ano) {
    const db = getDB();

    if (mes && ano) {
        const rows = db.prepare(`
            SELECT
                v.empresa AS nome,
                (SELECT e.logo FROM empresas e WHERE e.nome = v.empresa) AS logo,
                (SELECT e.banner FROM empresas e WHERE e.nome = v.empresa) AS banner,
                (SELECT e.descricao FROM empresas e WHERE e.nome = v.empresa) AS descricao,
                (SELECT e.status FROM empresas e WHERE e.nome = v.empresa) AS status,
                COUNT(DISTINCT m.nome) AS motoristas,
                COUNT(*) AS viagens,
                COALESCE(SUM(v.km), 0) AS km,
                COALESCE(SUM(v.pontuacao), 0) AS pontuacao
            FROM viagens v
            LEFT JOIN motoristas m ON m.empresa = v.empresa
            WHERE v.status = 'completa'
              AND CAST(strftime('%m', v.data) AS INTEGER) = ?
              AND CAST(strftime('%Y', v.data) AS INTEGER) = ?
              AND v.empresa != 'Lobo Solitário'
            GROUP BY v.empresa
            ORDER BY pontuacao DESC
        `).all(mes, ano);
        return rows.map((r, i) => ({ ...r, rankingPos: i + 1 }));
    }

    const rows = db.prepare(`
        SELECT
            e.nome,
            e.logo,
            e.banner,
            e.descricao,
            e.status,
            e.motoristas,
            e.viagens,
            e.km,
            e.pontuacao,
            e.criada_por
        FROM empresas e
        WHERE e.status = 'aprovada' AND e.nome != 'Lobo Solitário'
        ORDER BY e.pontuacao DESC
    `).all();
    return rows.map((r, i) => ({ ...r, rankingPos: i + 1 }));
}

// ========== NORMALIZACAO / REPARO DE DUPLICATAS ==========
// Empresas e motoristas sao comparados por nome exato (case-sensitive) em todo
// o app. Depois de formatar o PC + re-sync, variacoes de caixa/espaco criam
// registros "duplicados" de uma mesma empresa/motorista, dividindo os dados e
// fazendo o app pedir vaga na propria empresa. Este helper normaliza nomes
// para casamento agnóstico de caixa e espaco.
function normKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function repararDuplicatas() {
    const db = getDB();
    const report = { empresas: [], motoristas: [] };
    const tx = db.transaction(() => {
        // ---------- EMPRESAS ----------
        const setEmp = new Set();
        const pushEmp = (n) => { n = (n === undefined || n === null) ? '' : n; if (n && n !== 'Lobo Solitário' && n !== 'Lobo Solitario') setEmp.add(n); };
        db.prepare(`SELECT nome FROM empresas`).all().forEach(r => pushEmp(r.nome));
        db.prepare(`SELECT DISTINCT empresa FROM viagens`).all().forEach(r => pushEmp(r.empresa));
        db.prepare(`SELECT DISTINCT empresa FROM motoristas`).all().forEach(r => pushEmp(r.empresa));
        db.prepare(`SELECT DISTINCT empresa FROM vagas`).all().forEach(r => pushEmp(r.empresa));
        db.prepare(`SELECT DISTINCT empresa FROM solicitacoes`).all().forEach(r => pushEmp(r.empresa));
        db.prepare(`SELECT DISTINCT motorista_empresa AS empresa FROM candidaturas`).all().forEach(r => pushEmp(r.empresa));

        const empGroups = new Map();
        for (const n of setEmp) {
            const k = normKey(n);
            if (!k) continue;
            if (!empGroups.has(k)) empGroups.set(k, []);
            empGroups.get(k).push(n);
        }
        for (const group of empGroups.values()) {
            if (group.length < 2) continue;
            const scored = group.map(n => ({
                n,
                s: db.prepare(`SELECT COUNT(*) c FROM viagens WHERE empresa = ?`).get(n).c * 10
                    + db.prepare(`SELECT COUNT(*) c FROM motoristas WHERE empresa = ?`).get(n).c
                    + db.prepare(`SELECT COUNT(*) c FROM vagas WHERE empresa = ?`).get(n).c
                    + db.prepare(`SELECT COUNT(*) c FROM solicitacoes WHERE empresa = ?`).get(n).c
            }));
            scored.sort((a, b) => b.s - a.s || a.n.length - b.n.length);
            const canonical = scored[0].n;
            for (const other of group) {
                if (other === canonical) continue;
                db.prepare(`UPDATE viagens SET empresa = ? WHERE empresa = ?`).run(canonical, other);
                // motoristas: mescla evitando violar PK (nome, empresa)
                const motOther = db.prepare(`SELECT nome, empresa, usuario_id, cargo, funcao, status, foto FROM motoristas WHERE empresa = ?`).all(other);
                for (const m of motOther) {
                    const ex = db.prepare(`SELECT usuario_id, foto FROM motoristas WHERE nome = ? AND empresa = ?`).get(m.nome, canonical);
                    if (ex) {
                        if (m.usuario_id && !ex.usuario_id) db.prepare(`UPDATE motoristas SET usuario_id = ? WHERE nome = ? AND empresa = ?`).run(m.usuario_id, m.nome, canonical);
                        if (m.foto && !ex.foto) db.prepare(`UPDATE motoristas SET foto = ? WHERE nome = ? AND empresa = ?`).run(m.foto, m.nome, canonical);
                        db.prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = ?`).run(m.nome, other);
                    } else {
                        db.prepare(`UPDATE motoristas SET empresa = ? WHERE nome = ? AND empresa = ?`).run(canonical, m.nome, other);
                    }
                }
                db.prepare(`UPDATE vagas SET empresa = ? WHERE empresa = ?`).run(canonical, other);
                db.prepare(`UPDATE solicitacoes SET empresa = ? WHERE empresa = ?`).run(canonical, other);
                db.prepare(`UPDATE candidaturas SET motorista_empresa = ? WHERE motorista_empresa = ?`).run(canonical, other);
                db.prepare(`DELETE FROM ranking_cargas WHERE empresa = ?`).run(other);
                db.prepare(`UPDATE usuarios SET empresa = ? WHERE empresa = ?`).run(canonical, other);
                db.prepare(`DELETE FROM empresas WHERE nome = ?`).run(other);
                report.empresas.push(other + ' -> ' + canonical);
            }
            try { recalcularEmpresa(canonical); } catch (e) {}
        }

        // ---------- MOTORISTAS ----------
        const motNames = new Set();
        db.prepare(`SELECT DISTINCT nome FROM motoristas`).all().forEach(r => motNames.add(r.nome));
        db.prepare(`SELECT DISTINCT motorista FROM viagens`).all().forEach(r => { if (r.motorista) motNames.add(r.motorista); });
        const motGroups = new Map();
        for (const n of motNames) {
            const k = normKey(n);
            if (!k) continue;
            if (!motGroups.has(k)) motGroups.set(k, []);
            motGroups.get(k).push(n);
        }
        for (const group of motGroups.values()) {
            if (group.length < 2) continue;
            const canonical = group.slice().sort((a, b) => a.length - b.length)[0];
            for (const other of group) {
                if (other === canonical) continue;
                db.prepare(`UPDATE viagens SET motorista = ? WHERE motorista = ?`).run(canonical, other);
                db.prepare(`UPDATE solicitacoes SET motorista = ? WHERE motorista = ?`).run(canonical, other);
                db.prepare(`UPDATE candidaturas SET motorista = ? WHERE motorista = ?`).run(canonical, other);
                db.prepare(`DELETE FROM ranking_cargas WHERE motorista = ?`).run(other);
                db.prepare(`UPDATE usuarios SET nome = ? WHERE nome = ?`).run(canonical, other);
                const others = db.prepare(`SELECT * FROM motoristas WHERE nome = ?`).all(other);
                for (const o of others) {
                    const ex = db.prepare(`SELECT nome FROM motoristas WHERE nome = ? AND empresa = ?`).get(canonical, o.empresa);
                    if (!ex) {
                        db.prepare(`UPDATE motoristas SET nome = ? WHERE nome = ? AND empresa = ?`).run(canonical, o.nome, o.empresa);
                    } else {
                        if (o.usuario_id) {
                            db.prepare(`UPDATE motoristas SET usuario_id = ? WHERE nome = ? AND empresa = ? AND (usuario_id IS NULL OR usuario_id = 0)`).run(o.usuario_id, canonical, o.empresa);
                        }
                        if (o.foto && !ex.foto) {
                            db.prepare(`UPDATE motoristas SET foto = ? WHERE nome = ? AND empresa = ?`).run(o.foto, canonical, o.empresa);
                        }
                        db.prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = ?`).run(o.nome, o.empresa);
                    }
                }
                report.motoristas.push(other + ' -> ' + canonical);
            }
        }
    });
    tx();
    return report;
}

function getTodasEmpresasAdmin() {
    const db = getDB();
    return db.prepare(`SELECT * FROM empresas ORDER BY status ASC, nome ASC`).all();
}

function getEmpresasPendentes() {
    const db = getDB();
    return db.prepare(`SELECT * FROM empresas WHERE status = 'pendente' ORDER BY nome ASC`).all();
}

function getMotoristas(empresa, mes, ano) {
    const db = getDB();
    const params = [];
    const joinParams = [];
    let joinExtra = '';
    let whereExtra = '';

    if (mes && ano) {
        joinExtra += ` AND CAST(strftime('%m', v.data) AS INTEGER) = ? AND CAST(strftime('%Y', v.data) AS INTEGER) = ?`;
        joinParams.push(mes, ano);
    }
    if (empresa) {
        whereExtra = ` WHERE m.empresa = ?`;
        params.push(empresa);
    }

    return db.prepare(`
        SELECT
            m.nome,
            m.empresa,
            m.status,
            m.cargo,
            m.funcao,
            m.plano,
            m.plano_expira,
            COUNT(v.id) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM motoristas m
        LEFT JOIN viagens v ON v.motorista = m.nome AND v.status = 'completa'${joinExtra}
        ${whereExtra}
        GROUP BY m.nome
        ORDER BY pontuacao DESC
    `).all(...joinParams, ...params);
}

function getViagens(filtros) {
    const db = getDB();
    let sql = `SELECT * FROM viagens WHERE 1=1`;
    const params = [];

    if (filtros.status) {
        sql += ` AND status = ?`;
        params.push(filtros.status);
    }

    if (filtros.mes && filtros.ano) {
        sql += ` AND CAST(strftime('%m', data) AS INTEGER) = ? AND CAST(strftime('%Y', data) AS INTEGER) = ?`;
        params.push(filtros.mes, filtros.ano);
    }

    if (filtros.empresa) {
        sql += ` AND empresa = ?`;
        params.push(filtros.empresa);
    }

    if (filtros.motorista) {
        sql += ` AND motorista = ?`;
        params.push(filtros.motorista);
    }

    if (filtros.dataInicio) {
        sql += ` AND data >= ?`;
        params.push(filtros.dataInicio);
    }

    if (filtros.dataFim) {
        sql += ` AND data <= ?`;
        params.push(filtros.dataFim);
    }

    sql += ` ORDER BY data DESC, id DESC`;

    return db.prepare(sql).all(...params);
}

function getRankingEmpresas(periodo, mes, ano) {
    if (periodo === 'mes' && mes && ano) {
        return getEmpresas(mes, ano);
    }
    return getEmpresas();
}

function getRankingMotoristas(periodo, mes, ano, empresa) {
    if (periodo === 'mes' && mes && ano) {
        return getMotoristas(empresa, mes, ano);
    }
    return getMotoristas(empresa);
}

function getStatsGerais() {
    const db = getDB();
    const empresas = db.prepare(`SELECT COUNT(*) AS total FROM empresas`).get();
    const motoristas = db.prepare(`SELECT COUNT(*) AS total FROM motoristas`).get();
    const viagens = db.prepare(`SELECT COUNT(*) AS total FROM viagens WHERE status = 'completa'`).get();
    const km = db.prepare(`SELECT COALESCE(SUM(km), 0) AS total FROM viagens WHERE status = 'completa'`).get();

    return {
        totalEmpresas: empresas.total,
        totalMotoristas: motoristas.total,
        totalViagens: viagens.total,
        totalKm: km.total
    };
}

function getStatsGeraisMes(mes, ano) {
    const db = getDB();
    const row = db.prepare(`
        SELECT
            COUNT(*) AS totalViagens,
            COALESCE(SUM(km), 0) AS totalKm,
            COUNT(DISTINCT empresa) AS totalEmpresas,
            COUNT(DISTINCT motorista) AS totalMotoristas
        FROM viagens
        WHERE status = 'completa'
          AND CAST(strftime('%m', data) AS INTEGER) = ?
          AND CAST(strftime('%Y', data) AS INTEGER) = ?
    `).get(mes, ano);

    return {
        totalEmpresas: row.totalEmpresas,
        totalMotoristas: row.totalMotoristas,
        totalViagens: row.totalViagens,
        totalKm: row.totalKm
    };
}

const CIDADES_LITORAL = [
    'São Paulo', 'Rio de Janeiro', 'Vitória', 'Salvador', 'Aracaju',
    'Recife', 'João Pessoa', 'Natal', 'Fortaleza', 'São Luís',
    'Belém', 'Macapá', 'Santos', 'Florianópolis', 'Porto Alegre',
    'Curitiba'
];

function getStatsMotorista(nome) {
    const db = getDB();
    const m = db.prepare(`
        SELECT
            m.nome,
            m.empresa,
            m.status,
            m.cargo,
            m.funcao,
            m.foto,
            m.plano,
            m.plano_expira,
            COUNT(v.id) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM motoristas m
        LEFT JOIN viagens v ON v.motorista = m.nome AND v.status = 'completa'
        WHERE m.nome = ?
        GROUP BY m.nome
    `).get(nome);
    return m || { nome, empresa: '', status: 'Ativo', cargo: 'Motorista', funcao: 'motorista', foto: '', plano: 'bronze', plano_expira: null, viagens: 0, km: 0, pontuacao: 0 };
}

function getCidadesVisitadas(motorista) {
    const db = getDB();
    const rows = db.prepare(`
        SELECT DISTINCT destino AS cidade FROM viagens WHERE motorista = ?
        UNION
        SELECT DISTINCT origem AS cidade FROM viagens WHERE motorista = ?
    `).all(motorista, motorista);
    return rows.map(r => r.cidade);
}

function getCidadesLitoral(motorista) {
    const cidades = getCidadesVisitadas(motorista);
    return cidades.filter(c => CIDADES_LITORAL.includes(c));
}

function getViagensSemanaMotorista(motorista) {
    const db = getDB();
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const inicio = monday.toISOString().split('T')[0];
    const fim = sunday.toISOString().split('T')[0];

    const row = db.prepare(`
        SELECT COUNT(*) AS total FROM viagens
        WHERE motorista = ? AND status = 'completa' AND data >= ? AND data <= ?
    `).get(motorista, inicio, fim);
    return row.total;
}

function getTop1Empresa() {
    const db = getDB();
    const row = db.prepare(`SELECT nome FROM empresas ORDER BY pontuacao DESC LIMIT 1`).get();
    return row ? row.nome : null;
}

function calcularConquistas(motorista, conquistas) {
    const stats = getStatsMotorista(motorista);
    const cidades = getCidadesVisitadas(motorista);
    const cidadesLitoral = getCidadesLitoral(motorista);
    const viagensSemana = getViagensSemanaMotorista(motorista);
    const top1 = getTop1Empresa();

    return conquistas.map(c => {
        let desbloqueada = false;
        let progresso = 0;
        let meta = 0;

        if (c.tipo === 'motorista') {
            switch(c.criterio) {
                case 'viagens':
                    meta = c.meta;
                    progresso = Math.min(stats.viagens, meta);
                    desbloqueada = stats.viagens >= meta;
                    break;
                case 'km':
                    meta = c.meta;
                    progresso = Math.min(stats.km, meta);
                    desbloqueada = stats.km >= meta;
                    break;
                case 'pontuacao':
                    meta = c.meta;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= meta;
                    break;
                case 'nivel_prata':
                    meta = 100000;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 100000;
                    break;
                case 'nivel_ouro':
                    meta = 500000;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 500000;
                    break;
                case 'nivel_diamante':
                    meta = 1000000;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 1000000;
                    break;
                case 'nivel_elite':
                    meta = 2000000;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 2000000;
                    break;
                case 'nivel_lendario':
                    meta = 5000000;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 5000000;
                    break;
                case 'cidades':
                    meta = c.meta;
                    progresso = Math.min(cidades.length, meta);
                    desbloqueada = cidades.length >= meta;
                    break;
                case 'cidade_especifica':
                    meta = 1;
                    desbloqueada = cidades.includes(c.meta);
                    progresso = desbloqueada ? 1 : 0;
                    break;
                case 'cidades_litoral':
                    meta = c.meta;
                    progresso = Math.min(cidadesLitoral.length, meta);
                    desbloqueada = cidadesLitoral.length >= meta;
                    break;
                case 'viagens_semana':
                    meta = c.meta;
                    progresso = Math.min(viagensSemana, meta);
                    desbloqueada = viagensSemana >= meta;
                    break;
            }
        } else if (c.tipo === 'empresa') {
            if (c.criterio === 'top1_ranking') {
                meta = 1;
                desbloqueada = top1 === motorista;
                progresso = desbloqueada ? 1 : 0;
            }
        }

        return {
            ...c,
            desbloqueada,
            progresso,
            meta
        };
    });
}

function getConquistasMotorista(motorista, conquistas) {
    return calcularConquistas(motorista, conquistas);
}

function getRankingConquistas(conquistas) {
    const db = getDB();
    const motoristas = db.prepare(`SELECT nome FROM motoristas`).all();

    return motoristas.map(m => {
        const result = calcularConquistas(m.nome, conquistas);
        const desbloqueadas = result.filter(c => c.desbloqueada).length;
        return {
            nome: m.nome,
            empresa: (getStatsMotorista(m.nome)).empresa,
            desbloqueadas,
            total: conquistas.length
        };
    }).sort((a, b) => b.desbloqueadas - a.desbloqueadas);
}

function getPremiacaoEmpresa(empresa) {
    const db = getDB();
    const conquistasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'conquistas_config.json'), 'utf8'));
    const conquistasDef = conquistasConfig.conquistas || [];

    const motoristas = db.prepare(`
        SELECT m.nome, m.empresa, m.cargo, m.funcao,
            COUNT(v.id) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM motoristas m
        LEFT JOIN viagens v ON v.motorista = m.nome
        WHERE m.empresa = ?
        GROUP BY m.nome
        ORDER BY pontuacao DESC
    `).all(empresa);

    if (motoristas.length === 0) {
        return {
            empresa,
            podio: [],
            medalhas: [],
            trofeus: [],
            todasMedalhas: [],
            hallOfFame: [],
            categoriasEmpresa: [],
            empresaStats: { viagens: 0, km: 0, pontuacao: 0 }
        };
    }

    const podio = motoristas.slice(0, 3).map(m => ({
        nome: m.nome,
        pontos: m.pontuacao,
        viagens: m.viagens,
        km: m.km,
        cargo: m.cargo
    }));

    const medalhas = [];
    if (motoristas.length > 0) {
        const top = motoristas[0];
        const maisKm = [...motoristas].sort((a, b) => b.km - a.km)[0];
        const maisViagens = [...motoristas].sort((a, b) => b.viagens - a.viagens)[0];
        const maisPontos = [...motoristas].sort((a, b) => b.pontuacao - a.pontuacao)[0];

        const cidadesMap = {};
        const litoralMap = {};
        motoristas.forEach(m => {
            const cidades = getCidadesVisitadas(m.nome);
            cidadesMap[m.nome] = cidades;
            litoralMap[m.nome] = cidades.filter(c => CIDADES_LITORAL.includes(c));
        });

        const explorador = [...motoristas].sort((a, b) => (cidadesMap[b.nome]?.length || 0) - (cidadesMap[a.nome]?.length || 0))[0];
        const litoral = [...motoristas].sort((a, b) => (litoralMap[b.nome]?.length || 0) - (litoralMap[a.nome]?.length || 0))[0];

        function getTier( valor, thresholds ) {
            const tiers = ['—', 'Calouro', 'Bronze', 'Prata', 'Ouro', 'Diamante', 'Elite', 'Lendário'];
            const cores = ['#555', '#4CAF50', '#cd7f32', '#c0c0c0', '#ffd700', '#00e5ff', '#ff6b35', '#ff0000'];
            for (let i = thresholds.length - 1; i >= 0; i--) {
                if (valor >= thresholds[i]) return { nome: tiers[i+1], cor: cores[i+1], nivel: i+1 };
            }
            return { nome: tiers[0], cor: cores[0], nivel: 0 };
        }

        const kmTier = getTier(maisKm.km, [100000, 500000, 1500000, 5000000]);
        medalhas.push({ id: 'rei_km', icone: '🏆', titulo: 'Rei da Estrada', motorista: kmTier.nivel > 0 ? maisKm.nome : null, valor: maisKm.km.toLocaleString() + ' km', cor: kmTier.cor, tier: kmTier.nome, categoria: 'distancia', progressoAtual: maisKm.km, metaProximo: kmTier.nivel < 7 ? [100000, 500000, 1500000, 5000000][kmTier.nivel] : null });

        const viaTier = getTier(maisViagens.viagens, [50, 200, 500, 1000]);
        medalhas.push({ id: 'mais_viagens', icone: '📦', titulo: 'Máquina de Entregas', motorista: viaTier.nivel > 0 ? maisViagens.nome : null, valor: maisViagens.viagens + ' viagens', cor: viaTier.cor, tier: viaTier.nome, categoria: 'produtividade', progressoAtual: maisViagens.viagens, metaProximo: viaTier.nivel < 4 ? [50, 200, 500, 1000][viaTier.nivel] : null });

        const ptsTier = getTier(maisPontos.pontuacao, [100000, 500000, 1500000, 5000000]);
        medalhas.push({ id: 'mais_pontos', icone: '⭐', titulo: 'Lenda dos Pontos', motorista: ptsTier.nivel > 0 ? maisPontos.nome : null, valor: maisPontos.pontuacao.toLocaleString() + ' pts', cor: ptsTier.cor, tier: ptsTier.nome, categoria: 'pontuacao', progressoAtual: maisPontos.pontuacao, metaProximo: ptsTier.nivel < 7 ? [100000, 500000, 1500000, 5000000][ptsTier.nivel] : null });

        const cidTier = getTier(cidadesMap[explorador.nome]?.length || 0, [15, 30, 60, 100]);
        medalhas.push({ id: 'explorador', icone: '🗺️', titulo: 'Explorador Supremo', motorista: cidTier.nivel > 0 ? explorador.nome : null, valor: (cidadesMap[explorador.nome]?.length || 0) + ' cidades', cor: cidTier.cor, tier: cidTier.nome, categoria: 'exploracao', progressoAtual: cidadesMap[explorador.nome]?.length || 0, metaProximo: cidTier.nivel < 4 ? [15, 30, 60, 100][cidTier.nivel] : null });

        const litTier = getTier(litoralMap[litoral.nome]?.length || 0, [8, 15, 25, 40]);
        medalhas.push({ id: 'litoral_king', icone: '🏖️', titulo: 'Rei do Litoral', motorista: litTier.nivel > 0 ? litoral.nome : null, valor: (litoralMap[litoral.nome]?.length || 0) + ' praias', cor: litTier.cor, tier: litTier.nome, categoria: 'exploracao', progressoAtual: litoralMap[litoral.nome]?.length || 0, metaProximo: litTier.nivel < 4 ? [8, 15, 25, 40][litTier.nivel] : null });

        const velTier = getTier(maisViagens.viagens, [50, 200, 500, 1000]);
        medalhas.push({ id: 'centenario', icone: '🌟', titulo: 'Centenário', motorista: velTier.nivel > 0 ? maisViagens.nome : null, valor: maisViagens.viagens + ' viagens', cor: velTier.cor, tier: velTier.nome, categoria: 'marcos', progressoAtual: maisViagens.viagens, metaProximo: velTier.nivel < 4 ? [50, 200, 500, 1000][velTier.nivel] : null });
    }

    const trofeus = [];
    if (motoristas.length > 0) {
        const top1 = motoristas[0];
        const diamante = motoristas.find(m => m.pontuacao >= 2000000);
        const imperador = motoristas.find(m => m.viagens >= 750 && m.km >= 300000);
        const elite = motoristas.filter(m => m.pontuacao >= 1500000);
        const velocista = motoristas.find(m => m.viagens >= 250 && m.km >= 200000);

        trofeus.push(
            { icone: '🏆', titulo: 'Lenda da Empresa', motorista: top1.pontuacao >= 1000000 ? top1.nome : null, cor: '#ffd700', requisitos: '1.000.000+ pontos · Ser o #1 da empresa' },
            { icone: '💎', titulo: 'Diamante Absoluto', motorista: diamante ? diamante.nome : null, cor: '#00e5ff', requisitos: '2.000.000+ pontos · Nível Elite+' },
            { icone: '👑', titulo: 'Imperador da Estrada', motorista: imperador ? imperador.nome : null, cor: '#9C27B0', requisitos: '750+ viagens · 300.000+ km' },
            { icone: '🔥', titulo: 'Troféu Elite', motorista: elite.length > 0 ? elite[0].nome : null, cor: '#ff6b35', requisitos: '1.500.000+ pontos · Nível Diamante+' },
            { icone: '⚡', titulo: 'Velocista Supremo', motorista: velocista ? velocista.nome : null, cor: '#ffd700', requisitos: '250+ viagens · 200.000+ km' }
        );
    }

    const conquistasCategorias = [
        { id: 'viagens', nome: 'Viagens', icone: '📦', criterios: ['viagens'] },
        { id: 'distancia', nome: 'Distância', icone: '🛣️', criterios: ['km'] },
        { id: 'pontos', nome: 'Pontuação', icone: '⭐', criterios: ['pontuacao'] },
        { id: 'nivel', nome: 'Nível', icone: '🎯', criterios: ['nivel_prata', 'nivel_ouro', 'nivel_diamante', 'nivel_elite', 'nivel_lendario'] },
        { id: 'exploracao', nome: 'Exploração', icone: '🗺️', criterios: ['cidades', 'cidade_especifica', 'cidades_litoral'] },
        { id: 'especial', nome: 'Especiais', icone: '⚡', criterios: ['viagens_semana'] }
    ];

    const todasMedalhas = conquistasCategorias.map(cat => {
        const conquistas = conquistasDef
            .filter(c => cat.criterios.includes(c.criterio) && c.tipo === 'motorista')
            .map(c => {
                let desbloqueada = false;
                let progressoAtual = 0;
                let meta = c.meta;
                let progressoPercent = 0;

                const statsMotoristas = motoristas.map(m => ({
                    nome: m.nome,
                    ...getStatsMotorista(m.nome)
                }));

                const melhor = statsMotoristas.sort((a, b) => {
                    if (c.criterio === 'viagens') return b.viagens - a.viagens;
                    if (c.criterio === 'km') return b.km - a.km;
                    if (c.criterio === 'pontuacao') return b.pontuacao - a.pontuacao;
                    return 0;
                })[0];

                if (melhor) {
                    if (c.criterio === 'viagens') { progressoAtual = melhor.viagens; }
                    else if (c.criterio === 'km') { progressoAtual = melhor.km; }
                    else if (c.criterio === 'pontuacao') { progressoAtual = melhor.pontuacao; }
                    else if (c.criterio === 'nivel_prata') { progressoAtual = melhor.pontuacao; meta = 100000; }
                    else if (c.criterio === 'nivel_ouro') { progressoAtual = melhor.pontuacao; meta = 500000; }
                    else if (c.criterio === 'nivel_diamante') { progressoAtual = melhor.pontuacao; meta = 1000000; }
                    else if (c.criterio === 'nivel_elite') { progressoAtual = melhor.pontuacao; meta = 2000000; }
                    else if (c.criterio === 'nivel_lendario') { progressoAtual = melhor.pontuacao; meta = 5000000; }
                    else if (c.criterio === 'cidades') {
                        const maxCidades = Math.max(...motoristas.map(m => getCidadesVisitadas(m.nome).length));
                        progressoAtual = maxCidades;
                    }
                    else if (c.criterio === 'cidades_litoral') {
                        const maxLitoral = Math.max(...motoristas.map(m => getCidadesLitoral(m.nome).length));
                        progressoAtual = maxLitoral;
                    }
                    else if (c.criterio === 'viagens_semana') {
                        const maxSemana = Math.max(...motoristas.map(m => getViagensSemanaMotorista(m.nome)));
                        progressoAtual = maxSemana;
                    }
                    else if (c.criterio === 'cidade_especifica') {
                        const temCidade = motoristas.some(m => getCidadesVisitadas(m.nome).includes(c.meta));
                        progressoAtual = temCidade ? 1 : 0;
                        meta = 1;
                    }
                    desbloqueada = progressoAtual >= meta;
                    progressoPercent = Math.min(Math.round((progressoAtual / meta) * 100), 100);
                }

                let metaFormatada = meta;
                if (c.criterio === 'km') metaFormatada = meta.toLocaleString() + ' km';
                else if (c.criterio === 'pontuacao' || c.criterio === 'nivel_prata' || c.criterio === 'nivel_ouro' || c.criterio === 'nivel_diamante' || c.criterio === 'nivel_elite' || c.criterio === 'nivel_lendario') metaFormatada = meta.toLocaleString() + ' pts';
                else if (c.criterio === 'cidades' || c.criterio === 'cidades_litoral') metaFormatada = meta + ' cidades';
                else if (c.criterio === 'cidade_especifica') metaFormatada = c.meta;

                return {
                    ...c,
                    desbloqueada,
                    progressoAtual,
                    meta,
                    metaFormatada,
                    progressoPercent
                };
            });

        return { ...cat, conquistas };
    });

    const hallOfFame = motoristas.map(m => ({
        nome: m.nome,
        pontos: m.pontuacao,
        viagens: m.viagens,
        km: m.km,
        conquistas: calcularConquistas(m.nome, conquistasDef).filter(c => c.desbloqueada).length,
        totalConquistas: conquistasDef.length
    }));

    // Company tier categories (expanded)
    const nomesTierE = ['Calouro', 'Bronze', 'Prata', 'Ouro', 'Diamante', 'Elite', 'Lendário'];
    const coresTierE = ['#4CAF50', '#cd7f32', '#c0c0c0', '#ffd700', '#00e5ff', '#ff6b35', '#ff0000'];
    const iconsTierE = ['🔰', '🥉', '🥈', '🥇', '💎', '🌟', '👑'];

    const empresaStats = motoristas.reduce((acc, m) => {
        acc.viagens += m.viagens;
        acc.km += m.km;
        acc.pontuacao += m.pontuacao;
        return acc;
    }, { viagens: 0, km: 0, pontuacao: 0 });

    const ranking = getRankingEmpresas();
    const posicao = ranking.findIndex(e => e.nome === empresa) + 1;
    const posicaoData = ranking.find(e => e.nome === empresa);
    const rankingPos = posicaoData ? posicaoData.rankingPos || posicao : posicao;

    const categoriasEmpresa = [
        makeCategoriaPrem('imperio_estrada', '🏢', 'Império da Estrada', 'KM total da empresa', 'km', empresaStats.km, [2000000, 10000000, 30000000, 50000000, 100000000], nomesTierE, coresTierE, iconsTierE),
        makeCategoriaPrem('frota_poderosa', '🚚', 'Frota Poderosa', 'Motoristas na empresa', 'motoristas', motoristas.length, [10, 20, 40, 80, 150], nomesTierE, coresTierE, iconsTierE),
        makeCategoriaPrem('produtividade', '📋', 'Produtividade Máxima', 'Viagens da empresa', 'viagens', empresaStats.viagens, [200, 1000, 2500, 5000, 10000], nomesTierE, coresTierE, iconsTierE),
        makeCategoriaPrem('potencia', '💰', 'Potência Financeira', 'Pontos da empresa', 'pontos', empresaStats.pontuacao, [2000000, 10000000, 30000000, 50000000, 100000000], nomesTierE, coresTierE, iconsTierE),
        makeCategoriaPrem('topo_ranking', '🏆', 'Topo do Ranking', 'Posição no ranking', 'posição',
            (rankingPos > 0 && empresaStats.viagens >= 10 && empresaStats.pontuacao >= 500000) ? rankingPos : 999,
            [10, 5, 3, 2, 1], nomesTierE, coresTierE, iconsTierE, true),
        makeCategoriaPrem('sinergia', '🤝', 'Sinergia', 'Média de pontos por motorista', 'pts', motoristas.length > 0 ? Math.round(empresaStats.pontuacao / motoristas.length) : 0, [100000, 500000, 1000000, 2000000, 5000000], nomesTierE, coresTierE, iconsTierE),
    ];

    return {
        empresa,
        podio,
        medalhas,
        trofeus,
        todasMedalhas,
        hallOfFame,
        categoriasEmpresa,
        empresaStats
    };
}

function makeCategoriaPrem(id, icone, titulo, descricao, unidade, progresso, thresholds, nomes, cores, icons, reversed) {
    const tiers = thresholds.map((t, i) => ({
        nome: nomes[i],
        cor: cores[i],
        icone: icons[i],
        meta: t,
        desbloqueado: reversed ? progresso <= t : progresso >= t
    }));
    let tierAtual = -1;
    if (reversed) {
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (progresso <= thresholds[i]) { tierAtual = i; break; }
        }
    } else {
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (progresso >= thresholds[i]) { tierAtual = i; break; }
        }
    }
    const proximo = tierAtual < thresholds.length - 1 ? thresholds[tierAtual + 1] : null;
    let pct = 100;
    if (proximo !== null) {
        if (reversed) {
            const atual = tierAtual >= 0 ? thresholds[tierAtual] : Math.max(progresso, thresholds[0] * 2);
            const diff = Math.abs(proximo - atual);
            const prog = Math.abs(progresso - atual);
            pct = diff > 0 ? Math.min(Math.round((prog / diff) * 100), 100) : 0;
        } else {
            pct = Math.min(Math.round(((progresso - (tierAtual >= 0 ? thresholds[tierAtual] : 0)) / (proximo - (tierAtual >= 0 ? thresholds[tierAtual] : 0))) * 100), 100);
        }
    }
    return {
        id, icone, titulo, descricao, unidade, progresso,
        tiers,
        tierAtual: tierAtual >= 0 ? tierAtual : -1,
        tierNome: tierAtual >= 0 ? nomes[tierAtual] : '—',
        tierCor: tierAtual >= 0 ? cores[tierAtual] : '#555',
        progressoProximo: pct,
        proximaMeta: proximo
    };
}

function getPremiacaoMotorista(nome) {
    const db = getDB();
    const conquistasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'conquistas_config.json'), 'utf8'));
    const conquistasDef = conquistasConfig.conquistas || [];

    const stats = getStatsMotorista(nome);
    if (!stats || !stats.nome) return null;

    const cidades = getCidadesVisitadas(nome);
    const cidadesLitoral = getCidadesLitoral(nome);
    const viagensSemana = getViagensSemanaMotorista(nome);
    const conquistas = calcularConquistas(nome, conquistasDef);
    const desbloqueadas = conquistas.filter(c => c.desbloqueada).length;
    const totalConquistas = conquistas.length;
    const pctConquistas = totalConquistas > 0 ? Math.round((desbloqueadas / totalConquistas) * 100) : 0;
    const kmMedio = stats.viagens > 0 ? Math.round(stats.km / stats.viagens) : 0;

    const kmMesRow = db.prepare(`
        SELECT strftime('%Y-%m', v.data) AS mes, SUM(v.km) AS km
        FROM viagens v WHERE v.motorista = ? AND v.status = 'completa'
        GROUP BY mes ORDER BY km DESC LIMIT 1
    `).get(nome);
    const kmMes = kmMesRow ? kmMesRow.km : 0;

    const CIDADES_DESAFIO = [
        'Manaus', 'Porto Alegre', 'Fortaleza', 'Belém', 'Macapá',
        'Rio Branco', 'Porto Velho', 'Boa Vista', 'Palmas', 'São Luís',
        'Aracaju', 'Maceió', 'Teresina', 'Natal', 'João Pessoa',
        'Cuiabá', 'Campo Grande', 'Goiânia', 'Brasília', 'Vitória'
    ];
    const cidadesDesafio = cidades.filter(c => CIDADES_DESAFIO.includes(c));

    const nomesTier = ['Calouro', 'Bronze', 'Prata', 'Ouro', 'Diamante', 'Elite', 'Lendário'];
    const coresTier = ['#4CAF50', '#cd7f32', '#c0c0c0', '#ffd700', '#00e5ff', '#ff6b35', '#ff0000'];
    const iconsTier = ['🔰', '🥉', '🥈', '🥇', '💎', '🌟', '👑'];

    const categorias = [
        makeCategoriaPrem('rei_estrada', '🚛', 'Rei da Estrada', 'KM rodados', 'km', stats.km, [250000, 1000000, 3000000, 5000000, 10000000], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('maquina_entregas', '📦', 'Máquina de Entregas', 'Viagens realizadas', 'viagens', stats.viagens, [50, 200, 500, 800, 1500], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('mestre_pontos', '⭐', 'Mestre dos Pontos', 'Pontuação total', 'pontos', stats.pontuacao, [250000, 1000000, 2500000, 5000000, 10000000], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('explorador', '🗺️', 'Explorador', 'Cidades visitadas', 'cidades', cidades.length, [15, 35, 60, 85, 120], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('rei_litoral', '🏖️', 'Rei do Litoral', 'Cidades litorâneas', 'cidades', cidadesLitoral.length, [8, 20, 30, 45, 60], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('velocista', '⚡', 'Velocista', 'Viagens em 1 semana', 'viagens', viagensSemana, [8, 20, 30, 45, 60], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('maratonista', '🛣️', 'Maratonista', 'KM em 1 mês (recorde)', 'km', kmMes, [100000, 400000, 800000, 1500000, 3000000], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('carga_pesada', '💪', 'Carga Pesada', 'KM médio por viagem', 'km', kmMedio, [600, 1200, 1800, 2200, 3000], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('desbravador', '🏔️', 'Desbravador', 'Cidades-desafio visitadas', 'cidades', cidadesDesafio.length, [3, 8, 12, 18, 25], nomesTier, coresTier, iconsTier),
        makeCategoriaPrem('complecionista', '🌟', 'Complecionista', '% de conquistas', '%', pctConquistas, [25, 50, 70, 90, 100], nomesTier, coresTier, iconsTier)
    ];

    return {
        motorista: nome,
        stats: {
            viagens: stats.viagens,
            km: stats.km,
            pontuacao: stats.pontuacao,
            cidades: cidades.length,
            cidadesLitoral: cidadesLitoral.length,
            viagensSemana,
            kmMes,
            kmMedio,
            cidadesDesafio: cidadesDesafio.length,
            conquistas: desbloqueadas,
            totalConquistas,
            pctConquistas,
            empresa: stats.empresa,
            cargo: stats.cargo,
            funcao: stats.funcao,
            foto: stats.foto
        },
        categorias
    };
}

function criarUsuario(email, senhaHash, nome, tipo, empresa) {
    const db = getDB();
    const stmt = db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo, empresa) VALUES (?, ?, ?, ?, ?)`);
    return stmt.run(email, senhaHash, nome, tipo || 'motorista', empresa || null);
}

function buscarUsuarioPorEmail(email) {
    const db = getDB();
    return db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email);
}

function buscarUsuarioPorId(id) {
    const db = getDB();
    return db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(id);
}

function buscarUsuarioPorSteamId(steamId) {
    const db = getDB();
    return db.prepare(`SELECT * FROM usuarios WHERE steam_id = ?`).get(steamId);
}

function criarUsuarioSteam(steamId, nome, avatar, empresa) {
    const db = getDB();
    const email = `steam_${steamId}@cargostats.local`;
    const hash = 'steam_auth_no_password';
    const emp = empresa || 'Lobo Solitário';
    const stmt = db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo, empresa, steam_id, avatar) VALUES (?, ?, ?, 'motorista', ?, ?, ?)`);
    return stmt.run(email, hash, nome, emp, steamId, avatar || '');
}

function atualizarAvatar(usuarioId, avatar) {
    const db = getDB();
    return db.prepare(`UPDATE usuarios SET avatar = ? WHERE id = ?`).run(avatar, usuarioId);
}

function criarSessao(token, usuarioId, expiresAt) {
    const db = getDB();
    return db.prepare(`INSERT INTO sessoes (token, usuario_id, expires_at) VALUES (?, ?, ?)`).run(token, usuarioId, expiresAt);
}

function buscarSessao(token) {
    const db = getDB();
    return db.prepare(`
        SELECT s.*, u.email, u.nome, u.tipo, u.empresa, u.id AS user_id
        FROM sessoes s
        JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
}

function deletarSessao(token) {
    const db = getDB();
    return db.prepare(`DELETE FROM sessoes WHERE token = ?`).run(token);
}

function limparSessoesExpiradas(dbInstance) {
    const db = dbInstance || getDB();
    try {
        const result = db.prepare(`DELETE FROM sessoes WHERE expires_at <= datetime('now')`).run();
        if (result.changes > 0) {
            console.log(`[SESSOES] ${result.changes} sessoes expiradas removidas`);
        }
    } catch (e) {
    }
}

function listarUsuarios() {
    const db = getDB();
    return db.prepare(`SELECT id, email, nome, tipo, empresa, criado_em FROM usuarios`).all();
}

function deletarUsuario(id) {
    const db = getDB();
    const user = db.prepare(`SELECT nome FROM usuarios WHERE id = ?`).get(id);
    if (user) {
        db.prepare(`DELETE FROM solicitacoes WHERE motorista = ?`).run(user.nome);
    }
    db.prepare(`DELETE FROM sessoes WHERE usuario_id = ?`).run(id);
    return db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(id);
}

function atualizarUsuario(id, nome, tipo, empresa, discordWebhook) {
    const db = getDB();
    const sets = [];
    const params = [];
    if (nome !== undefined) { sets.push('nome = ?'); params.push(nome); }
    if (tipo !== undefined) { sets.push('tipo = ?'); params.push(tipo); }
    if (empresa !== undefined) { sets.push('empresa = ?'); params.push(empresa); }
    if (discordWebhook !== undefined) { sets.push('discord_webhook = ?'); params.push(discordWebhook); }
    if (sets.length === 0) return null;
    params.push(id);
    return db.prepare(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function criarEmpresaRemota(data) {
    const db = getDB();
    const existing = db.prepare(`SELECT nome FROM empresas WHERE nome = ?`).get(data.nome);
    if (existing) return { ok: true, existing: true };
    db.prepare(`INSERT INTO empresas (nome, logo, descricao, status, motoristas, viagens, km, pontuacao) VALUES (?, ?, ?, 'aprovada', ?, ?, ?, ?)`).run(
        data.nome, data.logo || '', data.descricao || '',
        data.motoristas || 0, data.viagens || 0, data.km || 0, data.pontuacao || 0
    );
    return { ok: true };
}

function criarEmpresa(nome, logo, banner, descricao, criadaPor) {
    const db = getDB();
    const existing = db.prepare(`SELECT nome, logo, banner FROM empresas WHERE nome = ?`).get(nome);
    if (existing) {
        if (existing.logo || existing.banner) return { error: 'Empresa ja existe' };
        db.prepare(`UPDATE empresas SET logo = ?, banner = ?, descricao = ?, status = 'aprovada', criada_por = ? WHERE nome = ?`).run(logo || '', banner || '', descricao || '', criadaPor || null, nome);
        return { ok: true };
    }
    // Reusar variante ja existente ignorando caixa/espaco (evita empresa duplicada)
    const k = normKey(nome);
    let canon = null;
    if (k) {
        canon = db.prepare(`SELECT nome FROM empresas`).all().find(e => normKey(e.nome) === k);
        if (!canon) {
            canon = db.prepare(`SELECT DISTINCT empresa AS nome FROM viagens`).all().find(e => normKey(e.empresa) === k);
        }
    }
    if (canon) {
        if (!logo && !banner && !descricao) return { ok: true, existing: true, nome: canon.nome };
        db.prepare(`UPDATE empresas SET logo = COALESCE(NULLIF(logo, ''), ?), banner = COALESCE(NULLIF(banner, ''), ?), descricao = COALESCE(NULLIF(descricao, ''), ?), status = 'aprovada' WHERE nome = ?`).run(logo || '', banner || '', descricao || '', canon.nome);
        return { ok: true, existing: true, nome: canon.nome };
    }
    return db.prepare(`INSERT INTO empresas (nome, logo, banner, descricao, status, criada_por, motoristas, viagens, km, pontuacao) VALUES (?, ?, ?, ?, 'aprovada', ?, 0, 0, 0, 0)`).run(nome, logo || '', banner || '', descricao || '', criadaPor || null);
}

function atualizarEmpresa(nome, novosDados) {
    const db = getDB();
    const sets = [];
    const params = [];
    if (novosDados.logo !== undefined) { sets.push('logo = ?'); params.push(novosDados.logo); }
    if (novosDados.banner !== undefined) { sets.push('banner = ?'); params.push(novosDados.banner); }
    if (novosDados.descricao !== undefined) { sets.push('descricao = ?'); params.push(novosDados.descricao); }
    if (novosDados.status !== undefined) { sets.push('status = ?'); params.push(novosDados.status); }
    if (novosDados.motoristas !== undefined) { sets.push('motoristas = ?'); params.push(novosDados.motoristas); }
    if (novosDados.viagens !== undefined) { sets.push('viagens = ?'); params.push(novosDados.viagens); }
    if (novosDados.km !== undefined) { sets.push('km = ?'); params.push(novosDados.km); }
    if (novosDados.pontuacao !== undefined) { sets.push('pontuacao = ?'); params.push(novosDados.pontuacao); }
    if (sets.length === 0) return null;
    params.push(nome);
    return db.prepare(`UPDATE empresas SET ${sets.join(', ')} WHERE nome = ?`).run(...params);
}

function deletarEmpresa(nome) {
    const db = getDB();
    db.prepare(`DELETE FROM viagens WHERE empresa = ?`).run(nome);
    db.prepare(`DELETE FROM motoristas WHERE empresa = ?`).run(nome);
    return db.prepare(`DELETE FROM empresas WHERE nome = ?`).run(nome);
}

function getEmpresaWebhook(nome) {
    const db = getDB();
    if (!nome) return '';
    const row = db.prepare(`SELECT webhook_url FROM empresas WHERE nome = ?`).get(nome);
    return row ? (row.webhook_url || '') : '';
}

function setEmpresaWebhook(nome, webhookUrl) {
    const db = getDB();
    if (!nome) return null;
    const result = db.prepare(`UPDATE empresas SET webhook_url = ? WHERE nome = ?`).run(webhookUrl, nome);
    if (result.changes === 0) {
        db.prepare(`INSERT OR IGNORE INTO empresas (nome, webhook_url, motoristas, viagens, km, pontuacao) VALUES (?, ?, 0, 0, 0, 0)`).run(nome, webhookUrl);
    }
    return result;
}

function criarMotorista(nome, empresa, usuarioId, cargo, funcao) {
    const db = getDB();
    // Check if motorista already exists with exact nome+empresa
    const existing = db.prepare(`SELECT nome, empresa FROM motoristas WHERE nome = ? AND empresa = ?`).get(nome, empresa);
    if (existing) {
        db.prepare(`UPDATE motoristas SET cargo = ?, funcao = ?, usuario_id = ? WHERE nome = ? AND empresa = ?`).run(cargo || 'Motorista', funcao || 'motorista', usuarioId || null, nome, empresa);
        return { ok: true, updated: true };
    }
    // Check variante ignorando caixa/espaco (evita duplicatas apos re-sync)
if (normKey(nome)) {
        const canon = db.prepare(`SELECT nome, empresa FROM motoristas`).all()
            .find(m => normKey(m.nome) === normKey(nome) && normKey(m.empresa) === normKey(empresa));
        if (canon) {
            db.prepare(`UPDATE motoristas SET cargo = ?, funcao = ?, usuario_id = ? WHERE nome = ? AND empresa = ?`)
                .run(cargo || 'Motorista', funcao || 'motorista', usuarioId || null, canon.nome, canon.empresa);
            return { ok: true, updated: true };
        }
    }
    // Check if this nome exists under Lobo Solitário — transfer instead of duplicate
    const lobo = db.prepare(`SELECT nome FROM motoristas WHERE nome = ? AND (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario')`).get(nome);
    if (lobo) {
        db.prepare(`UPDATE motoristas SET empresa = ?, cargo = ?, funcao = ?, usuario_id = ? WHERE nome = ? AND (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario')`).run(empresa, cargo || 'Motorista', funcao || 'motorista', usuarioId || null, nome);
        return { ok: true, updated: true, transferido: true };
    }
    // Fallback: check by usuario_id if nome-based lookup failed
    if (usuarioId) {
        const loboUser = db.prepare(`SELECT nome, empresa FROM motoristas WHERE usuario_id = ? AND (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario')`).get(usuarioId);
        if (loboUser) {
            db.prepare(`UPDATE motoristas SET empresa = ?, cargo = ?, funcao = ?, usuario_id = ? WHERE nome = ? AND (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario')`).run(empresa, cargo || 'Motorista', funcao || 'motorista', usuarioId || null, loboUser.nome);
            return { ok: true, updated: true, transferido: true };
        }
    }
    return db.prepare(`INSERT INTO motoristas (nome, empresa, status, cargo, funcao, usuario_id) VALUES (?, ?, 'Ativo', ?, ?, ?)`).run(nome, empresa, cargo || 'Motorista', funcao || 'motorista', usuarioId || null);
}

function atualizarMotorista(nome, empresa, novosDados) {
    const db = getDB();
    const sets = [];
    const params = [];
    if (novosDados.status !== undefined) { sets.push('status = ?'); params.push(novosDados.status); }
    if (novosDados.empresa !== undefined) { sets.push('empresa = ?'); params.push(novosDados.empresa); }
    if (novosDados.cargo !== undefined) { sets.push('cargo = ?'); params.push(novosDados.cargo); }
    if (novosDados.funcao !== undefined) { sets.push('funcao = ?'); params.push(novosDados.funcao); }
    if (novosDados.usuario_id !== undefined) { sets.push('usuario_id = ?'); params.push(novosDados.usuario_id); }
    if (novosDados.foto !== undefined) { sets.push('foto = ?'); params.push(novosDados.foto); }
    if (sets.length === 0) return null;
    params.push(nome, empresa);
    return db.prepare(`UPDATE motoristas SET ${sets.join(', ')} WHERE nome = ? AND empresa = ?`).run(...params);
}

function deletarMotorista(nome, empresa) {
    const db = getDB();
    db.prepare(`DELETE FROM viagens WHERE motorista = ? AND empresa = ?`).run(nome, empresa || '');
    return db.prepare(`DELETE FROM motoristas WHERE nome = ? AND empresa = ?`).run(nome, empresa || '');
}

function limparDadosAntigos() {
    const db = getDB();
    db.exec(`DELETE FROM viagens`);
    db.exec(`DELETE FROM motoristas`);
    db.exec(`DELETE FROM empresas`);
    db.exec(`DELETE FROM ranking_cargas`);
}

function dropAllTables() {
    const db = getDB();
    db.exec(`
        DROP TABLE IF EXISTS progresso_evento;
        DROP TABLE IF EXISTS eventos;
        DROP TABLE IF EXISTS loja_inventario;
        DROP TABLE IF EXISTS loja_titulos;
        DROP TABLE IF EXISTS cargas_pendentes;
        DROP TABLE IF EXISTS sessoes;
        DROP TABLE IF EXISTS usuarios;
        DROP TABLE IF EXISTS ranking_cargas;
        DROP TABLE IF EXISTS solicitacoes;
        DROP TABLE IF EXISTS candidaturas;
        DROP TABLE IF EXISTS vagas;
        DROP TABLE IF EXISTS viagens;
        DROP TABLE IF EXISTS motoristas_new;
        DROP TABLE IF EXISTS motoristas;
        DROP TABLE IF EXISTS empresas;
        DROP TABLE IF EXISTS conquistas_empresa;
        DROP TABLE IF EXISTS penalidades;
        DROP TABLE IF EXISTS evolucao_motorista;
    `);
}

function resetDatabase() {
    initDB();
    const db = getDB();
    // Re-create default admin user
    const existing = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get('admin@cargostats.com');
    if (!existing) {
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('admin123', 10);
        db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo) VALUES (?, ?, ?, ?)`).run('admin@cargostats.com', hash, 'Administrador', 'admin');
    }
}

function criarViagemCompleta(motorista, empresa, data, origem, destino, km, pontuacao, categoriaCarga, eventoInfo, status, jobType) {
    const db = getDB();
    const cat = categoriaCarga || 'geral';
    const viagemStatus = status || 'completa';
    const jt = jobType || '';
    const tx = db.transaction(() => {
        const existing = db.prepare(`
            SELECT id FROM viagens
            WHERE motorista = ? AND data = ? AND origem = ? AND destino = ? AND km = ?
            LIMIT 1
        `).get(motorista, data, origem || '', destino || '', km || 0);
        if (existing) {
            return { duplicate: true, lastInsertRowid: existing.id, bonusInfo: null };
        }
        const recente = db.prepare(`
            SELECT id FROM viagens
            WHERE motorista = ? AND origem = ? AND destino = ?
              AND ABS(km - ?) <= 10
              AND data = ?
            LIMIT 1
        `).get(motorista, origem || '', destino || '', km || 0, data);
        if (recente) {
            return { duplicate: true, lastInsertRowid: recente.id, bonusInfo: null };
        }
        const mesmaRota = db.prepare(`
            SELECT id FROM viagens
            WHERE motorista = ? AND data = ? AND origem = ? AND destino = ?
              AND status = 'completa' AND ABS(km - ?) <= 5
            LIMIT 1
        `).get(motorista, data, origem || '', destino || '', km || 0);
        if (mesmaRota) {
            return { duplicate: true, lastInsertRowid: mesmaRota.id, bonusInfo: null };
        }
        const result = db.prepare(`INSERT INTO viagens (motorista, empresa, data, origem, destino, km, pontuacao, categoria_carga, status, job_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(motorista, empresa, data, origem, destino, km || 0, pontuacao || 0, cat, viagemStatus, jt);
        if (viagemStatus === 'completa') {
            db.prepare(`UPDATE motoristas SET cs_gold = cs_gold + ? WHERE nome = ?`).run(Math.floor((pontuacao || 0) / 5), motorista);
        }
        let bonusInfo = null;
        if (eventoInfo && viagemStatus === 'completa') {
            const progResult = atualizarProgressoEvento(eventoInfo.id, motorista, empresa, { km: km || 0, pontuacao: pontuacao || 0, categoria_carga: cat, destino: destino || '' });
            if (progResult && progResult.metaAtingida && progResult.bonus_pontos > 0) {
                db.prepare(`UPDATE viagens SET pontuacao = pontuacao + ? WHERE id = ?`).run(progResult.bonus_pontos, result.lastInsertRowid);
                bonusInfo = { bonus_pontos: progResult.bonus_pontos, bonus_km: progResult.bonus_km || 0 };
            }
        }
        recalcularEmpresa(empresa);
        return { ...result, bonusInfo, status: viagemStatus };
    });
    return tx();
}

function getEstatisticasCargas(motorista, empresa) {
    const db = getDB();
    let sql = `SELECT categoria_carga, COUNT(*) AS total, COALESCE(SUM(km), 0) AS km, COALESCE(SUM(pontuacao), 0) AS pontuacao FROM viagens WHERE status = 'completa'`;
    const params = [];
    const conditions = [];
    if (motorista) { conditions.push(`motorista = ?`); params.push(motorista); }
    if (empresa) { conditions.push(`empresa = ?`); params.push(empresa); }
    if (conditions.length) sql += ` AND ${conditions.join(' AND ')}`;
    sql += ` GROUP BY categoria_carga ORDER BY total DESC`;
    return db.prepare(sql).all(...params);
}

function getEstatisticasCargasEmpresa(empresa) {
    return getEstatisticasCargas(null, empresa);
}

function getEmpresasPorCategoria(categoria, mes, ano) {
    const db = getDB();
    if (mes && ano) {
        return db.prepare(`
            SELECT v.empresa AS nome,
                COUNT(*) AS viagens,
                COALESCE(SUM(v.km), 0) AS km,
                COALESCE(SUM(v.pontuacao), 0) AS pontuacao
            FROM viagens v
            WHERE v.status = 'completa' AND v.categoria_carga = ?
              AND CAST(strftime('%m', v.data) AS INTEGER) = ?
              AND CAST(strftime('%Y', v.data) AS INTEGER) = ?
            GROUP BY v.empresa ORDER BY pontuacao DESC
        `).all(categoria, mes, ano);
    }
    return db.prepare(`
        SELECT v.empresa AS nome,
            COUNT(*) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM viagens v
        WHERE v.status = 'completa' AND v.categoria_carga = ?
        GROUP BY v.empresa ORDER BY pontuacao DESC
    `).all(categoria);
}

function getMotoristasPorCategoria(categoria, empresa, mes, ano) {
    const db = getDB();
    let sql = `SELECT v.motorista AS nome, v.empresa,
        COUNT(*) AS viagens,
        COALESCE(SUM(v.km), 0) AS km,
        COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM viagens v
        WHERE v.status = 'completa' AND v.categoria_carga = ?`;
    const params = [categoria];

    if (empresa) {
        sql += ` AND v.empresa = ?`;
        params.push(empresa);
    }
    if (mes && ano) {
        sql += ` AND CAST(strftime('%m', v.data) AS INTEGER) = ? AND CAST(strftime('%Y', v.data) AS INTEGER) = ?`;
        params.push(mes, ano);
    }
    sql += ` GROUP BY v.motorista ORDER BY pontuacao DESC`;
    return db.prepare(sql).all(...params);
}

function sincronizarRankingCargas(dados) {
    const db = getDB();
    const stmt = db.prepare(`
        INSERT INTO ranking_cargas (empresa, motorista, categoria, total_viagens, total_km, total_pontos, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(empresa, motorista, categoria) DO UPDATE SET
            total_viagens = total_viagens + excluded.total_viagens,
            total_km = total_km + excluded.total_km,
            total_pontos = total_pontos + excluded.total_pontos,
            atualizado_em = datetime('now')
    `);
    const tx = db.transaction((itens) => {
        for (const item of itens) {
            stmt.run(item.empresa, item.motorista, item.categoria, item.total_viagens || 0, item.total_km || 0, item.total_pontos || 0);
        }
    });
    tx(dados);
}

function getRankingCargasWeb(categoria, mes, ano) {
    const db = getDB();
    if (categoria) {
        return db.prepare(`
            SELECT empresa AS nome, SUM(total_viagens) AS viagens, SUM(total_km) AS km, SUM(total_pontos) AS pontuacao
            FROM ranking_cargas WHERE categoria = ?
            GROUP BY empresa ORDER BY pontuacao DESC
        `).all(categoria);
    }
    return db.prepare(`
        SELECT empresa AS nome, SUM(total_viagens) AS viagens, SUM(total_km) AS km, SUM(total_pontos) AS pontuacao
        FROM ranking_cargas
        GROUP BY empresa ORDER BY pontuacao DESC
    `).all();
}

function getCargasPendentes() {
    const db = getDB();
    return db.prepare(`SELECT * FROM cargas_pendentes WHERE classificada_em IS NULL ORDER BY ocorrencias DESC`).all();
}

function adicionarCargaPendente(nomeOriginal, cargoId, categoriaSugerida) {
    const db = getDB();
    const cat = categoriaSugerida || 'a_classificar';
    let existing = db.prepare(`SELECT id, ocorrencias FROM cargas_pendentes WHERE nome_original = ? AND cargo_id = ?`).get(nomeOriginal, cargoId || '');
    if (existing) {
        db.prepare(`UPDATE cargas_pendentes SET ocorrencias = ocorrencias + 1 WHERE id = ?`).run(existing.id);
        return existing.id;
    }
    existing = db.prepare(`SELECT id, ocorrencias FROM cargas_pendentes WHERE nome_original = ?`).get(nomeOriginal);
    if (existing) {
        db.prepare(`UPDATE cargas_pendentes SET ocorrencias = ocorrencias + 1 WHERE id = ?`).run(existing.id);
        return existing.id;
    }
    const result = db.prepare(`INSERT INTO cargas_pendentes (nome_original, cargo_id, categoria_sugerida) VALUES (?, ?, ?)`).run(nomeOriginal, cargoId || '', cat);
    return result.lastInsertRowid;
}

function classificarCargaPendente(id, novaCategoria) {
    const db = getDB();
    return db.prepare(`UPDATE cargas_pendentes SET categoria_sugerida = ?, classificada_em = datetime('now') WHERE id = ?`).run(novaCategoria, id);
}

function deletarCargaPendente(id) {
    const db = getDB();
    return db.prepare(`DELETE FROM cargas_pendentes WHERE id = ?`).run(id);
}

function migrarClassificacoesParaMapping() {
    const db = getDB();
    const classificadas = db.prepare(`SELECT * FROM cargas_pendentes WHERE classificada_em IS NOT NULL`).all();
    if (classificadas.length === 0) return 0;

    const mappingPath = path.join(APP_DIR, 'cargas', 'mapping_cargas.json');
    let mapping = { cargas: {} };
    try {
        mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    } catch (e) {
    }

    let count = 0;
    for (const carga of classificadas) {
        const id = carga.cargo_id || carga.nome_original.toLowerCase().replace(/\s+/g, '_');
        mapping.cargas[id] = {
            nome: carga.nome_original,
            categoria: carga.categoria_sugerida
        };
        count++;
    }

    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    db.prepare(`DELETE FROM cargas_pendentes WHERE classificada_em IS NOT NULL`).run();
    return count;
}

// ========== SOLICITACOES ==========

function criarSolicitacao(motorista, empresa, mensagem) {
    const dbConn = getDB();
    const existing = dbConn.prepare(`SELECT id FROM solicitacoes WHERE motorista = ? AND empresa = ? AND status = 'pendente'`).get(motorista, empresa);
    if (existing) return { duplicate: true };
    dbConn.prepare(`INSERT INTO solicitacoes (motorista, empresa, mensagem) VALUES (?, ?, ?)`).run(motorista, empresa, mensagem || '');
    return { ok: true };
}

function getSolicitacoesPorEmpresa(empresa) {
    const dbConn = getDB();
    return dbConn.prepare(`SELECT * FROM solicitacoes WHERE empresa = ? ORDER BY criada_em DESC`).all(empresa);
}

function getSolicitacoesPendentesCount(empresa) {
    const dbConn = getDB();
    const row = dbConn.prepare(`SELECT COUNT(*) as total FROM solicitacoes WHERE empresa = ? AND status = 'pendente'`).get(empresa);
    return row ? row.total : 0;
}

function responderSolicitacao(id, status) {
    const dbConn = getDB();
    dbConn.prepare(`UPDATE solicitacoes SET status = ?, respondida_em = datetime('now') WHERE id = ?`).run(status, id);
    return { ok: true };
}

function getSolicitacaoPendente(motorista, empresa) {
    const dbConn = getDB();
    return dbConn.prepare(`SELECT * FROM solicitacoes WHERE motorista = ? AND empresa = ? AND status = 'pendente'`).get(motorista, empresa);
}

// ========== VAGAS ==========

function criarVaga(empresa, criadaPor, titulo, descricao, categoria, qtdVagas) {
    const db = getDB();
    const result = db.prepare(`INSERT INTO vagas (empresa, criada_por, titulo, descricao, categoria, qtd_vagas) VALUES (?, ?, ?, ?, ?, ?)`).run(empresa, criadaPor, titulo, descricao || '', categoria || 'geral', qtdVagas || 1);
    return { ok: true, id: result.lastInsertRowid };
}

function getVagas(filtros) {
    const db = getDB();
    let sql = `SELECT v.*, (SELECT COUNT(*) FROM candidaturas WHERE vaga_id = v.id AND status = 'pendente') as candidaturas_pendentes FROM vagas v WHERE v.status = 'aberta'`;
    const params = [];
    if (filtros && filtros.empresa) { sql += ` AND v.empresa = ?`; params.push(filtros.empresa); }
    if (filtros && filtros.categoria) { sql += ` AND v.categoria = ?`; params.push(filtros.categoria); }
    sql += ` ORDER BY v.criada_em DESC`;
    return db.prepare(sql).all(...params);
}

function getVagaPorId(id) {
    const db = getDB();
    return db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM candidaturas WHERE vaga_id = v.id AND status = 'pendente') as candidaturas_pendentes FROM vagas v WHERE v.id = ?`).get(id);
}

function getVagasPorEmpresa(empresa) {
    const db = getDB();
    return db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM candidaturas WHERE vaga_id = v.id AND status = 'pendente') as candidaturas_pendentes FROM vagas v WHERE v.empresa = ? ORDER BY v.criada_em DESC`).all(empresa);
}

function atualizarVaga(id, dados) {
    const db = getDB();
    const sets = [];
    const params = [];
    if (dados.status !== undefined) { sets.push(`status = ?`); params.push(dados.status); }
    if (dados.titulo !== undefined) { sets.push(`titulo = ?`); params.push(dados.titulo); }
    if (dados.descricao !== undefined) { sets.push(`descricao = ?`); params.push(dados.descricao); }
    if (dados.qtd_vagas !== undefined) { sets.push(`qtd_vagas = ?`); params.push(dados.qtd_vagas); }
    if (sets.length === 0) return { ok: false };
    sets.push(`atualizada_em = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE vagas SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return { ok: true };
}

function deletarVaga(id) {
    const db = getDB();
    db.prepare(`DELETE FROM candidaturas WHERE vaga_id = ?`).run(id);
    db.prepare(`DELETE FROM vagas WHERE id = ?`).run(id);
    return { ok: true };
}

// ========== CANDIDATURAS ==========

function criarCandidatura(vagaId, motorista, motoristaEmpresa, mensagem) {
    const db = getDB();
    const vaga = db.prepare(`SELECT * FROM vagas WHERE id = ? AND status = 'aberta'`).get(vagaId);
    if (!vaga) return { error: 'Vaga nao encontrada ou fechada' };
    const vagasOcupadas = db.prepare(`SELECT COUNT(*) as total FROM candidaturas WHERE vaga_id = ? AND status = 'aceita'`).get(vagaId);
    if (vagasOcupadas && vagasOcupadas.total >= vaga.qtd_vagas) return { error: 'Vaga lotada' };
    const existing = db.prepare(`SELECT id FROM candidaturas WHERE vaga_id = ? AND motorista = ? AND status IN ('pendente', 'aceita')`).get(vagaId, motorista);
    if (existing) return { duplicate: true };
    db.prepare(`INSERT INTO candidaturas (vaga_id, motorista, motorista_empresa, mensagem) VALUES (?, ?, ?, ?)`).run(vagaId, motorista, motoristaEmpresa || 'Lobo Solitário', mensagem || '');
    return { ok: true };
}

function getCandidaturasPorVaga(vagaId) {
    const db = getDB();
    return db.prepare(`SELECT * FROM candidaturas WHERE vaga_id = ? ORDER BY criada_em DESC`).all(vagaId);
}

function getCandidaturasPorMotorista(motorista) {
    const db = getDB();
    return db.prepare(`SELECT c.*, v.titulo as vaga_titulo, v.empresa as vaga_empresa FROM candidaturas c JOIN vagas v ON c.vaga_id = v.id WHERE c.motorista = ? ORDER BY c.criada_em DESC`).all(motorista);
}

function responderCandidatura(id, status) {
    const db = getDB();
    db.prepare(`UPDATE candidaturas SET status = ?, respondida_em = datetime('now') WHERE id = ?`).run(status, id);
    return { ok: true };
}

function getCandidaturaPorId(id) {
    const db = getDB();
    return db.prepare(`SELECT c.*, v.empresa as vaga_empresa, v.titulo as vaga_titulo FROM candidaturas c JOIN vagas v ON c.vaga_id = v.id WHERE c.id = ?`).get(id);
}

// ========== CONVITES (solicitacoes estendido) ==========

function criarConvite(empresa, motorista, motoristaEmpresa, vagaId, mensagem) {
    const db = getDB();
    const existing = db.prepare(`SELECT id FROM solicitacoes WHERE empresa = ? AND motorista = ? AND status = 'pendente' AND tipo = 'convite'`).get(empresa, motorista);
    if (existing) return { duplicate: true };
    db.prepare(`INSERT INTO solicitacoes (motorista, empresa, mensagem, tipo, vaga_id) VALUES (?, ?, ?, 'convite', ?)`).run(motorista, empresa, mensagem || '', vagaId || null);
    return { ok: true };
}

function getConvitesPorMotorista(motorista) {
    const db = getDB();
    return db.prepare(`SELECT * FROM solicitacoes WHERE motorista = ? AND tipo = 'convite' ORDER BY criada_em DESC`).all(motorista);
}

// ========== CONQUISTAS DE EMPRESA ==========

function getStatsEmpresa(empresa) {
    const db = getDB();
    const row = db.prepare(`
        SELECT
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao,
            COUNT(*) AS viagens,
            COALESCE((SELECT COUNT(*) FROM motoristas WHERE empresa = ? AND status = 'Ativo'), 0) AS motoristas,
            COALESCE(MIN(v.data), date('now')) AS primeira_viagem
        FROM viagens v WHERE v.empresa = ? AND v.status = 'completa'
    `).get(empresa, empresa);
    return row || { km: 0, pontuacao: 0, viagens: 0, motoristas: 0, primeira_viagem: new Date().toISOString().split('T')[0] };
}

function calcularConquistasEmpresa(empresa, conquistas) {
    const db = getDB();
    const stats = getStatsEmpresa(empresa);
    const ranking = getRankingEmpresas();
    const posicao = ranking.findIndex(e => e.nome === empresa) + 1;
    const diasAtiva = Math.max(0, Math.floor((Date.now() - new Date(stats.primeira_viagem).getTime()) / (1000 * 60 * 60 * 24)));

    const conquistasDesbloqueadas = db.prepare(`SELECT conquista_id FROM conquistas_empresa WHERE empresa = ?`).all(empresa).map(r => r.conquista_id);

    const resultado = conquistas.map(c => {
        if (c.tipo !== 'empresa') return null;
        let desbloqueada = false;
        let progresso = 0;
        let meta = c.meta;

        switch (c.criterio) {
            case 'km_empresa':
                progresso = Math.min(stats.km, meta);
                desbloqueada = stats.km >= meta;
                break;
            case 'viagens_empresa':
                progresso = Math.min(stats.viagens, meta);
                desbloqueada = stats.viagens >= meta;
                break;
            case 'motoristas_count':
                progresso = Math.min(stats.motoristas, meta);
                desbloqueada = stats.motoristas >= meta;
                break;
            case 'idade_empresa':
                progresso = Math.min(diasAtiva, meta);
                desbloqueada = diasAtiva >= meta;
                break;
            case 'top1_ranking':
                meta = 1;
                progresso = posicao === 1 ? 1 : 0;
                desbloqueada = posicao === 1;
                break;

        }

        return { ...c, desbloqueada, progresso, meta };
    }).filter(Boolean);

    return resultado;
}

function getConquistasEmpresa(empresa) {
    const config = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'conquistas_config.json'), 'utf8'));
    return calcularConquistasEmpresa(empresa, config.conquistas || []);
}

// ========== EVENTOS ==========

function escalaDificuldade() {
    try {
        const db = getDB();
        const row = db.prepare(`SELECT COALESCE(SUM(km), 0) AS totalKm, COALESCE(SUM(pontuacao), 0) AS totalPts FROM empresas`).get();
        const totalKm = row ? row.totalKm : 0;
        const totalPts = row ? row.totalPts : 0;
        if (totalKm > 5000000 && totalPts > 2000000) return 3;
        if (totalKm > 1000000 && totalPts > 500000) return 2;
        return 1;
    } catch (e) {
        return 1;
    }
}

const TIPOS_EVENTO = [
    {
        tipo: 'maratona_viagens',
        titulos: ['Maratona de Entregas', 'Corrida de Cargas', 'Desafio Expresso', 'Operação Velocidade'],
        descricoes: [
            'Cada motorista que fizer %META% viagens em 24h ganha %BONUS% pontos extras!',
            'Complete %META% entregas em 24h e receba %BONUS% pontos de bônus!'
        ],
        gerarParams: (escala) => {
            const metaMin = 5 + escala * 2;
            const metaMax = 10 + escala * 3;
            const meta = metaMin + Math.floor(Math.random() * (metaMax - metaMin + 1));
            const bonus = (2000 + Math.floor(Math.random() * 4000)) * escala;
            const bonusKm = (300 + Math.floor(Math.random() * 900)) * escala;
            return { tipo_meta: 'viagens', meta, bonus_pontos: bonus, bonus_km: bonusKm };
        }
    },
    {
        tipo: 'desafio_km',
        titulos: ['Desafio dos KM', 'Rota Infinita', 'Maratona de Distância', 'Caminhos sem Fim'],
        descricoes: [
            'Percorra %META% km em 24h e ganhe %BONUS% pontos extras!',
            'Acumule %META% km em entregas e receba %BONUS% pontos de bônus!'
        ],
        gerarParams: (escala) => {
            const metaMin = 2500 + escala * 1500;
            const metaMax = 5000 + escala * 2000;
            const meta = metaMin + Math.floor(Math.random() * (metaMax - metaMin + 1));
            const bonus = (4000 + Math.floor(Math.random() * 6000)) * escala;
            return { tipo_meta: 'km', meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'foco_carga',
        titulos: ['Foco em Carga', 'Especialista em Cargas', 'Transporte Selecionado', 'Carga Prioritária'],
        descricoes: [
            'Transporte %META% cargas de %CATEGORIA% em 24h e ganhe %BONUS% pontos!'
        ],
        gerarParams: (escala) => {
            const cats = ['combustiveis', 'construcao', 'granel', 'maquinas', 'veiculos', 'carga_viva'];
            const categoria = cats[Math.floor(Math.random() * cats.length)];
            const nomesCats = { combustiveis: 'Combustíveis', construcao: 'Construção Civil', granel: 'Granel', maquinas: 'Máquinas', veiculos: 'Veículos', carga_viva: 'Carga Viva' };
            const metaMin = 3 + escala;
            const metaMax = 6 + escala * 2;
            const meta = metaMin + Math.floor(Math.random() * (metaMax - metaMin + 1));
            const bonus = (2500 + Math.floor(Math.random() * 2500)) * escala;
            return { tipo_meta: 'carga', categoria, categoria_nome: nomesCats[categoria] || categoria, meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'caixa_pontos',
        titulos: ['Caça aos Pontos', 'Pontos Máximos', 'Desafio de Pontuação', 'Corrida Estelar'],
        descricoes: [
            'Acumule %META% pontos em 24h e ganhe %BONUS% pontos extras!'
        ],
        gerarParams: (escala) => {
            const metaMin = 12000 + escala * 10000;
            const metaMax = 35000 + escala * 15000;
            const meta = metaMin + Math.floor(Math.random() * (metaMax - metaMin + 1));
            const bonus = (4000 + Math.floor(Math.random() * 8000)) * escala;
            return { tipo_meta: 'pontos', meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'explorador_cidades',
        titulos: ['Explorador de Rotas', 'Novos Horizontes', 'Mapa Vivo', 'Roteiro Aberto'],
        descricoes: [
            'Entregue em %META% cidades DIFERENTES em 24h e ganhe %BONUS% pontos!'
        ],
        gerarParams: (escala) => {
            const metaMin = 4 + escala;
            const metaMax = 8 + escala * 2;
            const meta = metaMin + Math.floor(Math.random() * (metaMax - metaMin + 1));
            const bonus = (2500 + Math.floor(Math.random() * 2500)) * escala;
            return { tipo_meta: 'cidades', meta, bonus_pontos: bonus };
        }
    }
];

function getEventoAtivo() {
    const db = getDB();
    return db.prepare(`SELECT * FROM eventos WHERE ativo = 1 AND data_fim > datetime('now') ORDER BY data_inicio DESC LIMIT 1`).get();
}

function getEventoPorId(id) {
    const db = getDB();
    return db.prepare(`SELECT * FROM eventos WHERE id = ?`).get(id);
}

function criarEvento(tipo, titulo, descricao, parametros, criadoPor) {
    const db = getDB();
    const inicio = new Date().toISOString();
    const fim = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE eventos SET ativo = 0 WHERE ativo = 1`).run();
    return db.prepare(`INSERT INTO eventos (tipo, titulo, descricao, parametros, data_inicio, data_fim, ativo, criado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).run(tipo, titulo, descricao, JSON.stringify(parametros), inicio, fim, criadoPor || 'sistema');
}

function encerrarEvento(id) {
    const db = getDB();
    return db.prepare(`UPDATE eventos SET ativo = 0 WHERE id = ?`).run(id);
}

function finalizarEventosExpirados() {
    const db = getDB();
    const expirados = db.prepare(`SELECT id FROM eventos WHERE ativo = 1 AND data_fim <= datetime('now')`).all();
    for (const e of expirados) {
        db.prepare(`UPDATE eventos SET ativo = 0 WHERE id = ?`).run(e.id);
    }
    return expirados.length;
}

function deletarEvento(id) {
    const db = getDB();
    db.prepare(`DELETE FROM progresso_evento WHERE evento_id = ?`).run(id);
    return db.prepare(`DELETE FROM eventos WHERE id = ?`).run(id);
}

function atualizarProgressoEvento(eventoId, motorista, empresa, tripData) {
    const db = getDB();
    const evento = db.prepare(`SELECT * FROM eventos WHERE id = ? AND ativo = 1 AND data_fim > datetime('now')`).get(eventoId);
    if (!evento) return null;

    const params = JSON.parse(evento.parametros || '{}');
    const tipoMeta = params.tipo_meta || 'viagens';

    if (tipoMeta === 'carga' && params.categoria && tripData.categoria_carga !== params.categoria) {
        return { counted: false, motivo: 'categoria_incorreta' };
    }

    const existing = db.prepare(`SELECT * FROM progresso_evento WHERE evento_id = ? AND motorista = ?`).get(eventoId, motorista);

    let incremento = 0;
    let cidadesVisitadas = [];

    if (tipoMeta === 'km') {
        incremento = tripData.km || 0;
    } else if (tipoMeta === 'pontos') {
        incremento = tripData.pontuacao || 0;
    } else if (tipoMeta === 'cidades') {
        const destino = (tripData.destino || '').trim().toLowerCase();
        if (destino) {
            cidadesVisitadas = JSON.parse(existing ? (existing.cidades_visitadas || '[]') : '[]');
            if (!cidadesVisitadas.includes(destino)) {
                cidadesVisitadas.push(destino);
                incremento = 1;
            }
        }
    } else {
        incremento = 1;
    }

    if (tipoMeta === 'cidades' && incremento === 0) {
        return { counted: false, motivo: 'cidade_repetida' };
    }

    let progresso;
    if (existing) {
        progresso = existing.progresso + incremento;
        if (tipoMeta === 'cidades') {
            db.prepare(`UPDATE progresso_evento SET progresso = ?, cidades_visitadas = ?, atualizado_em = datetime('now') WHERE id = ?`).run(progresso, JSON.stringify(cidadesVisitadas), existing.id);
        } else {
            db.prepare(`UPDATE progresso_evento SET progresso = ?, atualizado_em = datetime('now') WHERE id = ?`).run(progresso, existing.id);
        }
    } else {
        progresso = incremento;
        if (tipoMeta === 'cidades') {
            db.prepare(`INSERT INTO progresso_evento (evento_id, empresa, motorista, progresso, cidades_visitadas) VALUES (?, ?, ?, ?, ?)`).run(eventoId, empresa, motorista, progresso, JSON.stringify(cidadesVisitadas));
        } else {
            db.prepare(`INSERT INTO progresso_evento (evento_id, empresa, motorista, progresso) VALUES (?, ?, ?, ?)`).run(eventoId, empresa, motorista, progresso);
        }
    }

    const meta = params.meta || 0;
    const metaAtingida = meta > 0 && progresso >= meta;
    const bonusJaDado = existing ? existing.bonus_recebido : 0;

    if (metaAtingida && !bonusJaDado) {
        db.prepare(`UPDATE progresso_evento SET meta_atingida = 1, bonus_recebido = 1 WHERE evento_id = ? AND motorista = ?`).run(eventoId, motorista);
        return { counted: true, metaAtingida: true, bonus_pontos: params.bonus_pontos || 0, bonus_km: params.bonus_km || 0, progresso };
    }

    return { counted: true, metaAtingida: false, progresso };
}

function getProgressoEmpresa(eventoId, empresa) {
    const db = getDB();
    const motoristas = db.prepare(`SELECT * FROM progresso_evento WHERE evento_id = ? AND empresa = ? ORDER BY progresso DESC`).all(eventoId, empresa);
    const total = motoristas.length;
    const metas = motoristas.filter(m => m.meta_atingida).length;
    return { motoristas, total, metas };
}

function getProgressoMotorista(eventoId, motorista) {
    const db = getDB();
    return db.prepare(`SELECT * FROM progresso_evento WHERE evento_id = ? AND motorista = ?`).get(eventoId, motorista);
}

function getHistoricoEventos(limit) {
    const db = getDB();
    return db.prepare(`SELECT * FROM eventos ORDER BY data_inicio DESC LIMIT ?`).all(limit || 10);
}

function gerarEventoAleatorio() {
    const ativo = getEventoAtivo();
    if (ativo) return null;
    if (Math.random() > 0.10) return null;

    const escala = escalaDificuldade();
    const tipoDef = TIPOS_EVENTO[Math.floor(Math.random() * TIPOS_EVENTO.length)];
    const params = tipoDef.gerarParams(escala);
    const titulo = tipoDef.titulos[Math.floor(Math.random() * tipoDef.titulos.length)];
    const descricaoRaw = tipoDef.descricoes[Math.floor(Math.random() * tipoDef.descricoes.length)];

    let descricao = descricaoRaw
        .replace('%META%', params.meta)
        .replace('%BONUS%', params.bonus_pontos)
        .replace('%CATEGORIA%', params.categoria_nome || params.categoria || '');

    if (params.bonus_km) {
        descricao += ` +${params.bonus_km} km extras!`;
    }
    if (escala >= 2) {
        descricao += ` [Dificuldade: ${escala === 3 ? 'Alta' : 'Média'}]`;
    }

    return criarEvento(tipoDef.tipo, titulo, descricao, params);
}

function adicionarBonusViagem(tripId, bonusPontos) {
    const db = getDB();
    db.prepare(`UPDATE viagens SET pontuacao = pontuacao + ? WHERE id = ?`).run(bonusPontos, tripId);
}

// ========== LOJA CS GOLD ==========

function getLojaTitulos() {
    const db = getDB();
    return db.prepare(`SELECT * FROM loja_titulos WHERE ativo = 1 ORDER BY preco_pontos ASC`).all();
}

function getCsGold(motorista) {
    const db = getDB();
    const row = db.prepare(`SELECT cs_gold FROM motoristas WHERE nome = ?`).get(motorista);
    return row ? row.cs_gold : 0;
}

function getLojaInventario(motorista) {
    const db = getDB();
    return db.prepare(`
        SELECT li.id, li.titulo_id, li.equipado, li.comprado_em,
               lt.nome, lt.icone, lt.descricao, lt.preco_pontos, lt.tipo
        FROM loja_inventario li
        JOIN loja_titulos lt ON lt.id = li.titulo_id
        WHERE li.motorista = ?
        ORDER BY li.comprado_em DESC
    `).all(motorista);
}

function getTituloEquipado(motorista) {
    const db = getDB();
    return db.prepare(`
        SELECT lt.id, lt.nome, lt.icone, lt.descricao, lt.tipo
        FROM loja_inventario li
        JOIN loja_titulos lt ON lt.id = li.titulo_id
        WHERE li.motorista = ? AND li.equipado = 1
        ORDER BY li.comprado_em DESC
    `).all(motorista);
}

function comprarTitulo(motorista, tituloId) {
    const db = getDB();
    const titulo = db.prepare(`SELECT * FROM loja_titulos WHERE id = ? AND ativo = 1`).get(tituloId);
    if (!titulo) return { error: 'Titulo nao encontrado' };
    if (titulo.preco_pontos <= 0) return { error: 'Este titulo nao esta a venda' };

    const gold = db.prepare(`SELECT cs_gold FROM motoristas WHERE nome = ?`).get(motorista);
    if (!gold) return { error: 'Motorista nao encontrado' };
    if (gold.cs_gold < titulo.preco_pontos) return { error: 'Saldo insuficiente' };

    const jaTem = db.prepare(`SELECT id FROM loja_inventario WHERE motorista = ? AND titulo_id = ?`).get(motorista, tituloId);
    if (jaTem) return { error: 'Voce ja possui este titulo' };

    const tx = db.transaction(() => {
        db.prepare(`UPDATE motoristas SET cs_gold = cs_gold - ? WHERE nome = ?`).run(titulo.preco_pontos, motorista);
        db.prepare(`INSERT INTO loja_inventario (motorista, titulo_id) VALUES (?, ?)`).run(motorista, tituloId);
    });
    tx();

    const saldoRestante = getCsGold(motorista);
    return { ok: true, titulo: titulo.nome, pontos_descontados: titulo.preco_pontos, saldo_restante: saldoRestante };
}

function equiparTitulo(motorista, tituloId) {
    const db = getDB();
    if (tituloId === null) {
        db.prepare(`UPDATE loja_inventario SET equipado = 0 WHERE motorista = ?`).run(motorista);
        return { ok: true };
    }
    const item = db.prepare(`SELECT id FROM loja_inventario WHERE motorista = ? AND titulo_id = ?`).get(motorista, tituloId);
    if (!item) return { error: 'Titulo nao encontrado no inventario' };

    const jaEquipado = db.prepare(`SELECT id FROM loja_inventario WHERE motorista = ? AND titulo_id = ? AND equipado = 1`).get(motorista, tituloId);
    if (jaEquipado) return { ok: true, jaEquipado: true };

    const plano = getPlanoInfo(motorista);
    const slotsMax = getSlotsPorPlano(plano.plano);
    const equipados = db.prepare(`SELECT COUNT(*) AS c FROM loja_inventario WHERE motorista = ? AND equipado = 1`).get(motorista);

    if (equipados.c >= slotsMax) {
        if (slotsMax === 1) {
            db.prepare(`UPDATE loja_inventario SET equipado = 0 WHERE motorista = ?`).run(motorista);
        } else {
            return { error: `Limite de ${slotsMax} titulos simultaneos para plano ${plano.plano}. Desequipe um antes.` };
        }
    }

    db.prepare(`UPDATE loja_inventario SET equipado = 1 WHERE id = ?`).run(item.id);
    return { ok: true };
}

function adicionarCsGold(motorista, valor) {
    const db = getDB();
    db.prepare(`UPDATE motoristas SET cs_gold = cs_gold + ? WHERE nome = ?`).run(valor, motorista);
}

function isDoador(motorista) {
    const db = getDB();
    const item = db.prepare(`
        SELECT li.id FROM loja_inventario li
        JOIN loja_titulos lt ON lt.id = li.titulo_id
        WHERE li.motorista = ? AND lt.preco_pontos = 0 AND lt.tipo = 'titulo'
        LIMIT 1
    `).get(motorista);
    return !!item;
}

function getPlanoInfo(nome) {
    const db = getDB();
    const row = db.prepare(`SELECT plano, plano_expira FROM motoristas WHERE nome = ?`).get(nome);
    if (!row) return { plano: 'bronze', plano_expira: null, isGold: false, isVip: false };
    const expirado = row.plano_expira && new Date(row.plano_expira) < new Date();
    if (expirado) {
        db.prepare(`UPDATE motoristas SET plano = 'bronze', plano_expira = NULL WHERE nome = ?`).run(nome);
        return { plano: 'bronze', plano_expira: null, isGold: false, isVip: false };
    }
    const plano = row.plano || 'bronze';
    return { plano, plano_expira: row.plano_expira || null, isGold: plano === 'gold', isVip: plano === 'vip' };
}

function getSlotsPorPlano(plano) {
    if (plano === 'vip') return 5;
    if (plano === 'gold') return 3;
    return 0;
}

function setPlanoAdmin(nome, plano, diasValidade) {
    const db = getDB();
    const planosValidos = ['bronze', 'gold', 'vip'];
    if (!planosValidos.includes(plano)) return { error: 'Plano invalido' };

    const motorista = db.prepare(`SELECT nome FROM motoristas WHERE nome = ?`).get(nome);
    if (!motorista) return { error: 'Motorista nao encontrado' };

    const expira = diasValidade > 0
        ? new Date(Date.now() + diasValidade * 86400000).toISOString().split('T')[0]
        : null;

    const tx = db.transaction(() => {
        db.prepare(`UPDATE motoristas SET plano = ?, plano_expira = ? WHERE nome = ?`).run(plano, expira, nome);

        // Remove all plan titles from inventory
        const planoTitulos = db.prepare(`SELECT id FROM loja_titulos WHERE tipo = 'plano'`).all();
        const ids = planoTitulos.map(t => t.id);
        if (ids.length > 0) {
            db.prepare(`DELETE FROM loja_inventario WHERE motorista = ? AND titulo_id IN (${ids.map(() => '?').join(',')})`).run(nome, ...ids);
        }

        // Add plan titles for the new plan
        const novosTitulos = [];
        if (plano === 'gold') {
            novosTitulos.push('Membro Gold', 'Caminhoneiro Premium');
        } else if (plano === 'vip') {
            novosTitulos.push('Membro VIP', 'Lenda do Asfalto');
        }
        for (const nomeTitulo of novosTitulos) {
            const titulo = db.prepare(`SELECT id FROM loja_titulos WHERE nome = ?`).get(nomeTitulo);
            if (titulo) {
                db.prepare(`INSERT OR IGNORE INTO loja_inventario (motorista, titulo_id) VALUES (?, ?)`).run(nome, titulo.id);
            }
        }
    });
    tx();

    return { ok: true, plano, expira };
}

function listarPlanos() {
    const db = getDB();
    return db.prepare(`SELECT nome, empresa, plano, plano_expira FROM motoristas ORDER BY nome ASC`).all();
}

function verificarPlanosExpirados() {
    const db = getDB();
    const expirados = db.prepare(`SELECT nome FROM motoristas WHERE plano_expira IS NOT NULL AND plano_expira < date('now') AND plano != 'bronze'`).all();
    for (const m of expirados) {
        db.prepare(`UPDATE motoristas SET plano = 'bronze', plano_expira = NULL WHERE nome = ?`).run(m.nome);
        db.prepare(`
            DELETE FROM loja_inventario WHERE motorista = ? AND titulo_id IN (
                SELECT id FROM loja_titulos WHERE tipo = 'plano'
            )
        `).run(m.nome);
    }
    return expirados.length;
}

function backfillCargasPendentes() {
    const db = getDB();
    const count = { inseridas: 0, ignoradas: 0 };
    const unclassified = db.prepare(`
        SELECT DISTINCT COALESCE(NULLIF(origem,''), NULLIF(destino,''), 'carga') AS nome,
               '' AS cargo_id
        FROM viagens WHERE categoria_carga = 'a_classificar'
        UNION
        SELECT DISTINCT COALESCE(NULLIF(destino,''), NULLIF(origem,''), 'carga') AS nome,
               '' AS cargo_id
        FROM viagens WHERE categoria_carga = 'a_classificar'
    `).all();

    unclassified.forEach(row => {
        const nomeOriginal = row.nome || 'carga desconhecida';
        const existing = db.prepare(`SELECT id FROM cargas_pendentes WHERE nome_original = ?`).get(nomeOriginal);
        if (!existing) {
            db.prepare(`INSERT INTO cargas_pendentes (nome_original, cargo_id, categoria_sugerida) VALUES (?, ?, 'a_classificar')`).run(nomeOriginal, '');
            count.inseridas++;
        } else {
            count.ignoradas++;
        }
    });

    return count;
}

function registrarPenalidade(viagemId, motorista, empresa, valor, tipo) {
    const db = getDB();
    if (!viagemId || !motorista) return null;
    const tipoPenalidade = tipo || 'abandono';
    db.prepare(`INSERT INTO penalidades (viagem_id, motorista, empresa, valor, tipo) VALUES (?, ?, ?, ?, ?)`).run(viagemId, motorista, empresa, valor, tipoPenalidade);
    db.prepare(`UPDATE motoristas SET abandonos = abandonos + 1 WHERE nome = ?`).run(motorista);
    return { viagemId, valor, tipo: tipoPenalidade };
}

function processarPenalidadesPendentes() {
    const db = getDB();
    const pendentes = db.prepare(`SELECT * FROM penalidades WHERE processada = 0`).all();
    if (pendentes.length === 0) return 0;
    const tx = db.transaction(() => {
        let count = 0;
        for (const p of pendentes) {
            db.prepare(`UPDATE motoristas SET cs_gold = MAX(0, cs_gold + ?) WHERE nome = ?`).run(p.valor, p.motorista);
            db.prepare(`UPDATE penalidades SET processada = 1, processada_em = datetime('now') WHERE id = ?`).run(p.id);
            recalcularEmpresa(p.empresa);
            count++;
        }
        return count;
    });
    return tx();
}

const EVOLUCAO_CARGOS = [
    { cargo: 'Motorista', kmMin: 0, bonus: 0 },
    { cargo: 'Aprendiz', kmMin: 0, bonus: 0 },
    { cargo: 'Em treinamento', kmMin: 1000, bonus: 0 },
    { cargo: 'Trainee', kmMin: 5000, bonus: 50 },
    { cargo: 'Pleno', kmMin: 20000, bonus: 150 },
    { cargo: 'Senior', kmMin: 50000, bonus: 500 },
    { cargo: 'Master', kmMin: 150000, bonus: 1500 },
    { cargo: 'Elite', kmMin: 400000, bonus: 5000 }
];

function processarAutoEvolucaoMotoristas() {
    const db = getDB();
    const motoristas = db.prepare(`SELECT nome, empresa, cargo FROM motoristas WHERE status = 'Ativo'`).all();
    if (motoristas.length === 0) {
        console.log('[EVOLUCAO] Nenhum motorista ativo para processar');
        return 0;
    }

    let verificados = 0;
    const tx = db.transaction(() => {
        let promocoes = 0;
        for (const m of motoristas) {
            const idxAtual = EVOLUCAO_CARGOS.findIndex(e => e.cargo === m.cargo);
            if (idxAtual < 0) {
                console.log(`[EVOLUCAO] Cargo "${m.cargo}" do motorista "${m.nome}" nao reconhecido, ignorando`);
                continue;
            }
            if (idxAtual >= EVOLUCAO_CARGOS.length - 1) continue;

            const totalKm = db.prepare(`
                SELECT COALESCE(SUM(km), 0) AS km FROM viagens
                WHERE motorista = ? AND empresa = ? AND status = 'completa'
            `).get(m.nome, m.empresa);

            const totalKmNum = totalKm.km;
            verificados++;

            let nivelAlcancado = null;
            for (let i = idxAtual + 1; i < EVOLUCAO_CARGOS.length; i++) {
                if (totalKmNum >= EVOLUCAO_CARGOS[i].kmMin) {
                    nivelAlcancado = i;
                } else {
                    break;
                }
            }

            if (nivelAlcancado !== null) {
                const novo = EVOLUCAO_CARGOS[nivelAlcancado];
                const bonusAcumulado = EVOLUCAO_CARGOS.slice(idxAtual + 1, nivelAlcancado + 1)
                    .reduce((acc, e) => acc + e.bonus, 0);

                db.prepare(`UPDATE motoristas SET cargo = ? WHERE nome = ? AND empresa = ?`).run(novo.cargo, m.nome, m.empresa);
                if (bonusAcumulado > 0) {
                    db.prepare(`UPDATE motoristas SET cs_gold = cs_gold + ? WHERE nome = ? AND empresa = ?`).run(bonusAcumulado, m.nome, m.empresa);
                }
                db.prepare(`INSERT INTO evolucao_motorista (motorista, empresa, cargo_anterior, cargo_novo, km_na_evolucao, bonus_cs_gold) VALUES (?, ?, ?, ?, ?, ?)`).run(m.nome, m.empresa, m.cargo, novo.cargo, totalKmNum, bonusAcumulado);
                console.log(`[EVOLUCAO] "${m.nome}" promovido de "${m.cargo}" para "${novo.cargo}" (${totalKmNum}km, bonus ${bonusAcumulado} gold)`);
                promocoes++;
            }
        }
        console.log(`[EVOLUCAO] Verificados ${verificados} motorista(s), ${promocoes} promocao(oes)`);
        return promocoes;
    });
    return tx();
}

module.exports = {
    initDB,
    getDB,
    recalcEmpresas,
    recalcularEmpresa,
    getEmpresas,
    getMotoristas,
    getViagens,
    getRankingEmpresas,
    getRankingMotoristas,
    getStatsGerais,
    getStatsGeraisMes,
    getStatsMotorista,
    getConquistasMotorista,
    getRankingConquistas,
    criarUsuario,
    buscarUsuarioPorEmail,
    buscarUsuarioPorId,
    buscarUsuarioPorSteamId,
    criarUsuarioSteam,
    atualizarAvatar,
    criarSessao,
    buscarSessao,
    deletarSessao,
    limparSessoesExpiradas,
    listarUsuarios,
    deletarUsuario,
    atualizarUsuario,
    criarEmpresa,
    criarEmpresaRemota,
    atualizarEmpresa,
    deletarEmpresa,
    getEmpresaWebhook,
    setEmpresaWebhook,
    getTodasEmpresasAdmin,
    getEmpresasPendentes,
    criarMotorista,
    atualizarMotorista,
    deletarMotorista,
    criarViagemCompleta,
    limparDadosAntigos,
    dropAllTables,
    resetDatabase,
    getEstatisticasCargas,
    getEstatisticasCargasEmpresa,
    getEmpresasPorCategoria,
    getMotoristasPorCategoria,
    sincronizarRankingCargas,
    getRankingCargasWeb,
    getCargasPendentes,
    adicionarCargaPendente,
    classificarCargaPendente,
    deletarCargaPendente,
    migrarClassificacoesParaMapping,
    getPremiacaoEmpresa,
    getPremiacaoMotorista,
    criarSolicitacao,
    getSolicitacoesPorEmpresa,
    getSolicitacoesPendentesCount,
    responderSolicitacao,
    getSolicitacaoPendente,
    getEventoAtivo,
    getEventoPorId,
    criarEvento,
    encerrarEvento,
    finalizarEventosExpirados,
    atualizarProgressoEvento,
    getProgressoEmpresa,
    getProgressoMotorista,
    getHistoricoEventos,
    gerarEventoAleatorio,
    adicionarBonusViagem,
    deletarEvento,
    getLojaTitulos,
    getCsGold,
    getLojaInventario,
    getTituloEquipado,
    comprarTitulo,
    equiparTitulo,
    adicionarCsGold,
    isDoador,
    getPlanoInfo,
    getSlotsPorPlano,
    setPlanoAdmin,
    listarPlanos,
    verificarPlanosExpirados,
    backfillCargasPendentes,
    registrarPenalidade,
    processarPenalidadesPendentes,
    processarAutoEvolucaoMotoristas,
    getStatsEmpresa,
    getConquistasEmpresa,
    criarVaga,
    getVagas,
    getVagaPorId,
    getVagasPorEmpresa,
    atualizarVaga,
    deletarVaga,
    criarCandidatura,
    getCandidaturasPorVaga,
    getCandidaturasPorMotorista,
    responderCandidatura,
    getCandidaturaPorId,
    criarConvite,
    getConvitesPorMotorista,
    normKey,
    repararDuplicatas
};