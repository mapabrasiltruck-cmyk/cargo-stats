const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.CARGOSTATS_DB_PATH || path.join(__dirname, 'data.db');

if (process.env.CARGOSTATS_DB_PATH) {
    const oldPath = path.join(__dirname, 'data.db');
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
    `);

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
    } catch (e) {
    }

    try {
        const empCols = db.prepare(`PRAGMA table_info(empresas)`).all();
        if (!empCols.some(c => c.name === 'logo')) db.exec(`ALTER TABLE empresas ADD COLUMN logo TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'banner')) db.exec(`ALTER TABLE empresas ADD COLUMN banner TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'descricao')) db.exec(`ALTER TABLE empresas ADD COLUMN descricao TEXT DEFAULT ''`);
        if (!empCols.some(c => c.name === 'status')) db.exec(`ALTER TABLE empresas ADD COLUMN status TEXT DEFAULT 'aprovada'`);
        if (!empCols.some(c => c.name === 'criada_por')) db.exec(`ALTER TABLE empresas ADD COLUMN criada_por INTEGER`);
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

    limparSessoesExpiradas(db);

    return db;
}

function recalcEmpresas() {
    const db = getDB();

    const empresasComViagens = db.prepare(`
        SELECT
            v.empresa,
            (SELECT COUNT(DISTINCT m.nome) FROM motoristas m WHERE m.empresa = v.empresa) AS motoristas,
            COUNT(*) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM viagens v
        WHERE v.empresa != 'Lobo Solitário'
        GROUP BY v.empresa
    `).all();

    const empresasExistentes = db.prepare(`SELECT nome FROM empresas`).all().map(e => e.nome);
    const inserir = db.prepare(`INSERT INTO empresas (nome, logo, banner, descricao, status, criada_por, motoristas, viagens, km, pontuacao) VALUES (?, '', '', '', 'aprovada', NULL, ?, ?, ?, ?)`);
    const atualizar = db.prepare(`UPDATE empresas SET motoristas = ?, viagens = ?, km = ?, pontuacao = ? WHERE nome = ?`);

    const tx = db.transaction(() => {
        for (const ev of empresasComViagens) {
            if (empresasExistentes.includes(ev.empresa)) {
                atualizar.run(ev.motoristas, ev.viagens, ev.km, ev.pontuacao, ev.empresa);
            } else {
                inserir.run(ev.empresa, ev.motoristas, ev.viagens, ev.km, ev.pontuacao);
            }
        }
        for (const nome of empresasExistentes) {
            if (!empresasComViagens.find(e => e.empresa === nome)) {
                const motCount = db.prepare(`SELECT COUNT(*) AS c FROM motoristas WHERE empresa = ?`).get(nome);
                atualizar.run(motCount.c, 0, 0, 0, nome);
            }
        }
    });
    tx();
}

function getEmpresas(mes, ano) {
    const db = getDB();

    if (mes && ano) {
        return db.prepare(`
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
            WHERE CAST(strftime('%m', v.data) AS INTEGER) = ?
              AND CAST(strftime('%Y', v.data) AS INTEGER) = ?
              AND v.empresa != 'Lobo Solitário'
            GROUP BY v.empresa
            ORDER BY pontuacao DESC
        `).all(mes, ano);
    }

    return db.prepare(`
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
            COUNT(v.id) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM motoristas m
        LEFT JOIN viagens v ON v.motorista = m.nome${joinExtra}
        ${whereExtra}
        GROUP BY m.nome
        ORDER BY pontuacao DESC
    `).all(...joinParams, ...params);
}

function getViagens(filtros) {
    const db = getDB();
    let sql = `SELECT * FROM viagens WHERE 1=1`;
    const params = [];

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
    const viagens = db.prepare(`SELECT COUNT(*) AS total FROM viagens`).get();
    const km = db.prepare(`SELECT COALESCE(SUM(km), 0) AS total FROM viagens`).get();

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
        WHERE CAST(strftime('%m', data) AS INTEGER) = ?
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
            COUNT(v.id) AS viagens,
            COALESCE(SUM(v.km), 0) AS km,
            COALESCE(SUM(v.pontuacao), 0) AS pontuacao
        FROM motoristas m
        LEFT JOIN viagens v ON v.motorista = m.nome
        WHERE m.nome = ?
        GROUP BY m.nome
    `).get(nome);
    return m || { nome, empresa: '', status: 'Ativo', cargo: 'Motorista', funcao: 'motorista', foto: '', viagens: 0, km: 0, pontuacao: 0 };
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
        WHERE motorista = ? AND data >= ? AND data <= ?
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
                    meta = 10001;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 10001;
                    break;
                case 'nivel_ouro':
                    meta = 50001;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 50001;
                    break;
                case 'nivel_diamante':
                    meta = 100001;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 100001;
                    break;
                case 'nivel_elite':
                    meta = 200001;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 200001;
                    break;
                case 'nivel_lendario':
                    meta = 500001;
                    progresso = Math.min(stats.pontuacao, meta);
                    desbloqueada = stats.pontuacao >= 500001;
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

    if (motoristas.length === 0) return null;

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
            const tiers = ['—', 'Bronze', 'Prata', 'Ouro', 'Lendário'];
            const cores = ['#555', '#cd7f32', '#c0c0c0', '#ffd700', '#ff0000'];
            for (let i = thresholds.length - 1; i >= 0; i--) {
                if (valor >= thresholds[i]) return { nome: tiers[i+1], cor: cores[i+1], nivel: i+1 };
            }
            return { nome: tiers[0], cor: cores[0], nivel: 0 };
        }

        const kmTier = getTier(maisKm.km, [10000, 50000, 150000, 500000]);
        medalhas.push({ id: 'rei_km', icone: '🏆', titulo: 'Rei da Estrada', motorista: kmTier.nivel > 0 ? maisKm.nome : null, valor: maisKm.km.toLocaleString() + ' km', cor: kmTier.cor, tier: kmTier.nome, categoria: 'distancia', progressoAtual: maisKm.km, metaProximo: kmTier.nivel < 4 ? [10000, 50000, 150000, 500000][kmTier.nivel] : null });

        const viaTier = getTier(maisViagens.viagens, [50, 200, 500, 1000]);
        medalhas.push({ id: 'mais_viagens', icone: '📦', titulo: 'Máquina de Entregas', motorista: viaTier.nivel > 0 ? maisViagens.nome : null, valor: maisViagens.viagens + ' viagens', cor: viaTier.cor, tier: viaTier.nome, categoria: 'produtividade', progressoAtual: maisViagens.viagens, metaProximo: viaTier.nivel < 4 ? [50, 200, 500, 1000][viaTier.nivel] : null });

        const ptsTier = getTier(maisPontos.pontuacao, [10000, 50000, 150000, 500000]);
        medalhas.push({ id: 'mais_pontos', icone: '⭐', titulo: 'Lenda dos Pontos', motorista: ptsTier.nivel > 0 ? maisPontos.nome : null, valor: maisPontos.pontuacao.toLocaleString() + ' pts', cor: ptsTier.cor, tier: ptsTier.nome, categoria: 'pontuacao', progressoAtual: maisPontos.pontuacao, metaProximo: ptsTier.nivel < 4 ? [10000, 50000, 150000, 500000][ptsTier.nivel] : null });

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
        const diamante = motoristas.find(m => m.pontuacao >= 200000);
        const imperador = motoristas.find(m => m.viagens >= 750 && m.km >= 300000);
        const elite = motoristas.filter(m => m.pontuacao >= 150000);
        const velocista = motoristas.find(m => m.viagens >= 250 && m.km >= 200000);

        trofeus.push(
            { icone: '🏆', titulo: 'Lenda da Empresa', motorista: top1.pontuacao >= 100000 ? top1.nome : null, cor: '#ffd700', requisitos: '100.000+ pontos · Ser o #1 da empresa' },
            { icone: '💎', titulo: 'Diamante Absoluto', motorista: diamante ? diamante.nome : null, cor: '#00e5ff', requisitos: '200.000+ pontos · Nível Elite+' },
            { icone: '👑', titulo: 'Imperador da Estrada', motorista: imperador ? imperador.nome : null, cor: '#9C27B0', requisitos: '750+ viagens · 300.000+ km' },
            { icone: '🔥', titulo: 'Troféu Elite', motorista: elite.length > 0 ? elite[0].nome : null, cor: '#ff6b35', requisitos: '150.000+ pontos · Nível Diamante+' },
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
                    else if (c.criterio === 'nivel_prata') { progressoAtual = melhor.pontuacao; meta = 10001; }
                    else if (c.criterio === 'nivel_ouro') { progressoAtual = melhor.pontuacao; meta = 50001; }
                    else if (c.criterio === 'nivel_diamante') { progressoAtual = melhor.pontuacao; meta = 100001; }
                    else if (c.criterio === 'nivel_elite') { progressoAtual = melhor.pontuacao; meta = 200001; }
                    else if (c.criterio === 'nivel_lendario') { progressoAtual = melhor.pontuacao; meta = 500001; }
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

    return {
        empresa,
        podio,
        medalhas,
        trofeus,
        todasMedalhas,
        hallOfFame
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

function criarEmpresa(nome, logo, banner, descricao, criadaPor) {
    const db = getDB();
    const existing = db.prepare(`SELECT nome, logo, banner FROM empresas WHERE nome = ?`).get(nome);
    if (existing) {
        if (existing.logo || existing.banner) return { error: 'Empresa ja existe' };
        db.prepare(`UPDATE empresas SET logo = ?, banner = ?, descricao = ?, status = 'aprovada', criada_por = ? WHERE nome = ?`).run(logo || '', banner || '', descricao || '', criadaPor || null, nome);
        return { ok: true };
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

function criarMotorista(nome, empresa, usuarioId, cargo, funcao) {
    const db = getDB();
    const existing = db.prepare(`SELECT nome, empresa FROM motoristas WHERE nome = ? AND empresa = ?`).get(nome, empresa);
    if (existing) return { ok: true, duplicate: true };
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
    params.push(nome);
    return db.prepare(`UPDATE motoristas SET ${sets.join(', ')} WHERE nome = ?`).run(...params);
}

function deletarMotorista(nome) {
    const db = getDB();
    db.prepare(`DELETE FROM viagens WHERE motorista = ?`).run(nome);
    return db.prepare(`DELETE FROM motoristas WHERE nome = ?`).run(nome);
}

function limparDadosAntigos() {
    const db = getDB();
    db.exec(`DELETE FROM viagens`);
    db.exec(`DELETE FROM motoristas`);
    db.exec(`DELETE FROM empresas`);
    db.exec(`DELETE FROM ranking_cargas`);
}

function adicionarViagemComCategoria(motorista, empresa, data, origem, destino, km, pontuacao, categoriaCarga) {
    const db = getDB();
    const cat = categoriaCarga || 'geral';
    const result = db.prepare(`INSERT INTO viagens (motorista, empresa, data, origem, destino, km, pontuacao, categoria_carga) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(motorista, empresa, data, origem, destino, km || 0, pontuacao || 0, cat);
    recalcEmpresas();
    return result;
}

function getEstatisticasCargas(motorista, empresa) {
    const db = getDB();
    let sql = `SELECT categoria_carga, COUNT(*) AS total, COALESCE(SUM(km), 0) AS km, COALESCE(SUM(pontuacao), 0) AS pontuacao FROM viagens`;
    const params = [];
    const conditions = [];
    if (motorista) { conditions.push(`motorista = ?`); params.push(motorista); }
    if (empresa) { conditions.push(`empresa = ?`); params.push(empresa); }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
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
            WHERE v.categoria_carga = ?
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
        WHERE v.categoria_carga = ?
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
        WHERE v.categoria_carga = ?`;
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

function salvarNaoClassificada(nomeOriginal, cargoId) {
    const filePath = path.join(__dirname, 'cargas', 'nao_classificadas.json');
    let data = { _info: 'Cargas que chegaram como Não Classificadas - mova para mapping_cargas.json quando identificar o cargo_id', _ultima_atualizacao: new Date().toISOString(), nao_classificadas: {} };
    try {
        if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!data.nao_classificadas) data.nao_classificadas = {};
        }
    } catch (e) {
        console.error('Erro ao ler nao_classificadas.json, criando novo:', e.message);
        data.nao_classificadas = {};
    }
    const chave = (cargoId || nomeOriginal || 'unknown').trim();
    if (data.nao_classificadas[chave]) {
        data.nao_classificadas[chave].ultima_vez = new Date().toISOString();
        data.nao_classificadas[chave].vezes++;
        if (nomeOriginal && !data.nao_classificadas[chave].nome_original) data.nao_classificadas[chave].nome_original = nomeOriginal;
    } else {
        data.nao_classificadas[chave] = { nome_original: nomeOriginal || chave, primeira_vez: new Date().toISOString(), ultima_vez: new Date().toISOString(), vezes: 1 };
    }
    data._ultima_atualizacao = new Date().toISOString();
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.error('Erro ao salvar nao_classificadas.json:', e.message); }
}

function adicionarCargaPendente(nomeOriginal, cargoId, categoriaSugerida) {
    const db = getDB();
    const cat = categoriaSugerida || 'a_classificar';
    const existing = db.prepare(`SELECT id, ocorrencias FROM cargas_pendentes WHERE nome_original = ?`).get(nomeOriginal);
    if (existing) {
        db.prepare(`UPDATE cargas_pendentes SET ocorrencias = ocorrencias + 1 WHERE id = ?`).run(existing.id);
        return existing.id;
    }
    const result = db.prepare(`INSERT INTO cargas_pendentes (nome_original, cargo_id, categoria_sugerida) VALUES (?, ?, ?)`).run(nomeOriginal, cargoId || '', cat);
    if (cat === 'a_classificar') salvarNaoClassificada(nomeOriginal, cargoId);
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

    const mappingPath = path.join(__dirname, 'cargas', 'mapping_cargas.json');
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

// ========== EVENTOS ==========

const TIPOS_EVENTO = [
    {
        tipo: 'maratona_viagens',
        titulos: ['Maratona de Entregas', 'Corrida de Cargas', 'Desafio Expresso', 'Operação Velocidade'],
        descricoes: [
            'Cada motorista que fizer %META% viagens em 24h ganha %BONUS% pontos extras!',
            'Complete %META% entregas em 24h e receba %BONUS% pontos de bônus!'
        ],
        gerarParams: () => {
            const meta = 3 + Math.floor(Math.random() * 5);
            const bonus = 1000 + Math.floor(Math.random() * 3000);
            const bonusKm = 200 + Math.floor(Math.random() * 800);
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
        gerarParams: () => {
            const meta = 1500 + Math.floor(Math.random() * 2000);
            const bonus = 2000 + Math.floor(Math.random() * 4000);
            return { tipo_meta: 'km', meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'foco_carga',
        titulos: ['Foco em Carga', 'Especialista em Cargas', 'Transporte Selecionado', 'Carga Prioritária'],
        descricoes: [
            'Transporte %META% cargas de %CATEGORIA% em 24h e ganhe %BONUS% pontos!'
        ],
        gerarParams: () => {
            const cats = ['combustiveis', 'construcao', 'granel', 'maquinas', 'veiculos', 'carga_viva'];
            const categoria = cats[Math.floor(Math.random() * cats.length)];
            const nomesCats = { combustiveis: 'Combustíveis', construcao: 'Construção Civil', granel: 'Granel', maquinas: 'Máquinas', veiculos: 'Veículos', carga_viva: 'Carga Viva' };
            const meta = 2 + Math.floor(Math.random() * 4);
            const bonus = 1500 + Math.floor(Math.random() * 2000);
            return { tipo_meta: 'carga', categoria, categoria_nome: nomesCats[categoria] || categoria, meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'caixa_pontos',
        titulos: ['Caça aos Pontos', 'Pontos Máximos', 'Desafio de Pontuação', 'Corrida Estelar'],
        descricoes: [
            'Acumule %META% pontos em 24h e ganhe %BONUS% pontos extras!'
        ],
        gerarParams: () => {
            const meta = 5000 + Math.floor(Math.random() * 15000);
            const bonus = 2000 + Math.floor(Math.random() * 5000);
            return { tipo_meta: 'pontos', meta, bonus_pontos: bonus };
        }
    },
    {
        tipo: 'explorador_cidades',
        titulos: ['Explorador de Rotas', 'Novos Horizontes', 'Mapa Vivo', 'Roteiro Aberto'],
        descricoes: [
            'Entregue em %META% cidades DIFERENTES em 24h e ganhe %BONUS% pontos!'
        ],
        gerarParams: () => {
            const meta = 3 + Math.floor(Math.random() * 4);
            const bonus = 1500 + Math.floor(Math.random() * 2500);
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
    if (Math.random() > 0.15) return null;

    const tipoDef = TIPOS_EVENTO[Math.floor(Math.random() * TIPOS_EVENTO.length)];
    const params = tipoDef.gerarParams();
    const titulo = tipoDef.titulos[Math.floor(Math.random() * tipoDef.titulos.length)];
    const descricaoRaw = tipoDef.descricoes[Math.floor(Math.random() * tipoDef.descricoes.length)];

    let descricao = descricaoRaw
        .replace('%META%', params.meta)
        .replace('%BONUS%', params.bonus_pontos)
        .replace('%CATEGORIA%', params.categoria_nome || params.categoria || '');

    if (params.bonus_km) {
        descricao += ` +${params.bonus_km} km extras!`;
    }

    return criarEvento(tipoDef.tipo, titulo, descricao, params);
}

function adicionarBonusViagem(tripId, bonusPontos) {
    const db = getDB();
    db.prepare(`UPDATE viagens SET pontuacao = pontuacao + ? WHERE id = ?`).run(bonusPontos, tripId);
}

module.exports = {
    initDB,
    getDB,
    recalcEmpresas,
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
    criarSessao,
    buscarSessao,
    deletarSessao,
    limparSessoesExpiradas,
    listarUsuarios,
    deletarUsuario,
    atualizarUsuario,
    criarEmpresa,
    atualizarEmpresa,
    deletarEmpresa,
    getTodasEmpresasAdmin,
    getEmpresasPendentes,
    criarMotorista,
    atualizarMotorista,
    deletarMotorista,
    adicionarViagemComCategoria,
    limparDadosAntigos,
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
    criarSolicitacao,
    getSolicitacoesPorEmpresa,
    getSolicitacoesPendentesCount,
    responderSolicitacao,
    getSolicitacaoPendente,
    getEventoAtivo,
    getEventoPorId,
    criarEvento,
    encerrarEvento,
    atualizarProgressoEvento,
    getProgressoEmpresa,
    getProgressoMotorista,
    getHistoricoEventos,
    gerarEventoAleatorio,
    adicionarBonusViagem,
    deletarEvento
};