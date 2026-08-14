<?php
// ============================================================
// CONFIGURACAO - Hostinger Premium
// Edite estas variaveis com seus dados reais
// ============================================================

define('DB_FILE', __DIR__ . '/cargostats.db');

// Carrega variaveis do .env se existir (fallback para ambientes sem suporte a env vars)
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val);
            $_ENV[$key] = $val;
            putenv("$key=$val");
        }
    }
}

$envSecret = getenv('SYNC_SECRET');
if ($envSecret === false || $envSecret === '') {
    http_response_code(500);
    die(json_encode(['error' => 'SYNC_SECRET nao configurado.']));
}
define('SYNC_SECRET', $envSecret);

function checkAdminSession() {
    if (empty($_SESSION['admin'])) {
        return false;
    }
    if (isset($_SESSION['admin_expires']) && time() > $_SESSION['admin_expires']) {
        session_destroy();
        return false;
    }
    // Renova por mais 1 hora a cada acesso
    $_SESSION['admin_expires'] = time() + 3600;
    return true;
}

function getDB() {
    static $pdo = null;
    static $initialized = false;
    if ($pdo === null) {
        try {
            $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
            // Enable WAL mode for better concurrency
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA busy_timeout = 5000');
            if (!$initialized) {
                initDB();
                $initialized = true;
            }
        } catch (PDOException $e) {
            http_response_code(500);
            error_log('[CARGOSTATS] Erro DB: ' . $e->getMessage());
            echo json_encode(['error' => 'Erro interno do servidor']);
            exit;
        }
    }
    return $pdo;
}

function initDB() {
    $db = getDB();
    // Enable foreign keys if needed in the future
    $db->exec("PRAGMA foreign_keys = ON;");

    $db->exec("CREATE TABLE IF NOT EXISTS ranking_empresas (
        nome VARCHAR(255) PRIMARY KEY,
        logo TEXT DEFAULT '',
        banner TEXT DEFAULT '',
        descricao TEXT DEFAULT '',
        motoristas INT DEFAULT 0,
        viagens INT DEFAULT 0,
        km INT DEFAULT 0,
        pontuacao INT DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS ranking_motoristas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome VARCHAR(255) NOT NULL,
        empresa VARCHAR(255) NOT NULL,
        viagens INT DEFAULT 0,
        km INT DEFAULT 0,
        pontuacao INT DEFAULT 0,
        cs_gold INT DEFAULT 0,
        plano TEXT DEFAULT 'bronze',
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(nome, empresa)
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS stats_gerais (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_empresas INT DEFAULT 0,
        total_motoristas INT DEFAULT 0,
        total_viagens INT DEFAULT 0,
        total_km INT DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS reacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alvo_nome VARCHAR(255) NOT NULL,
        alvo_tipo VARCHAR(50) NOT NULL,
        tipo_reacao VARCHAR(50) NOT NULL,
        usuario VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(alvo_nome, alvo_tipo, tipo_reacao, usuario)
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        registros_empresas INT DEFAULT 0,
        registros_motoristas INT DEFAULT 0,
        ip_origem VARCHAR(45) DEFAULT '',
        detalhes TEXT DEFAULT '{}',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS mapping_cargas (
        cargo_id VARCHAR(100) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        categoria VARCHAR(100) DEFAULT ''
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS cargas_pendentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_original TEXT NOT NULL,
        cargo_id TEXT DEFAULT '',
        categoria_sugerida TEXT DEFAULT 'a_classificar',
        ocorrencias INTEGER DEFAULT 1,
        pc_origem TEXT DEFAULT '',
        criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        classificada_em TIMESTAMP DEFAULT NULL,
        UNIQUE(nome_original)
    )");

    // Migration: add banner column to ranking_empresas if missing
    try {
        $db->exec("ALTER TABLE ranking_empresas ADD COLUMN banner TEXT DEFAULT ''");
    } catch (PDOException $e) {
        // Column already exists - ignore
    }

    // Migration: add detalhes column to sync_log if missing
    try {
        $db->exec("ALTER TABLE sync_log ADD COLUMN detalhes TEXT DEFAULT '{}'");
    } catch (PDOException $e) {
        // Column already exists - ignore
    }

    // Migration: add foto column to ranking_motoristas if missing
    try {
        $db->exec("ALTER TABLE ranking_motoristas ADD COLUMN foto TEXT DEFAULT ''");
    } catch (PDOException $e) {
        // Column already exists - ignore
    }

    // Migration: add cs_gold column to ranking_motoristas if missing
    try {
        $db->exec("ALTER TABLE ranking_motoristas ADD COLUMN cs_gold INT DEFAULT 0");
    } catch (PDOException $e) {}

    // Migration: add plano column to ranking_motoristas if missing
    try {
        $db->exec("ALTER TABLE ranking_motoristas ADD COLUMN plano TEXT DEFAULT 'bronze'");
    } catch (PDOException $e) {}

    $db->exec("CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo VARCHAR(50) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT DEFAULT '',
        parametros TEXT DEFAULT '{}',
        data_inicio TIMESTAMP NOT NULL,
        data_fim TIMESTAMP NOT NULL,
        ativo INTEGER DEFAULT 1
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS planos_solicitacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista_nome VARCHAR(255) NOT NULL,
        plano VARCHAR(50) NOT NULL,
        dias INT DEFAULT 30,
        status VARCHAR(20) DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        aplicado_em TIMESTAMP DEFAULT NULL
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS ranking_viagens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista TEXT NOT NULL,
        empresa TEXT NOT NULL,
        data TEXT NOT NULL,
        origem TEXT DEFAULT '',
        destino TEXT DEFAULT '',
        km REAL DEFAULT 0,
        pontuacao INTEGER DEFAULT 0,
        hash TEXT NOT NULL UNIQUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // Migration: add hash column to ranking_viagens if missing (for existing tables)
    try {
        $db->exec("ALTER TABLE ranking_viagens ADD COLUMN hash TEXT NOT NULL DEFAULT ''");
    } catch (PDOException $e) {
        // Column already exists - ignore
    }

    // ========== Multi-PC support (v2) ==========

    // Tabela de dispositivos conectados
    $db->exec("CREATE TABLE IF NOT EXISTS dispositivos (
        pc_id TEXT PRIMARY KEY,
        nome TEXT DEFAULT '',
        ultimo_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        versao_app TEXT DEFAULT '',
        reset_token INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1
    )");

    // Add data_version column if upgrading from older version
    try {
        $db->exec("ALTER TABLE dispositivos ADD COLUMN data_version INTEGER DEFAULT 0");
    } catch (Exception $e) {
        // Column already exists, ignore
    }

    // Tabela de config do servidor
    $db->exec("CREATE TABLE IF NOT EXISTS server_config (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    )");

    // Vagas - sync entre PCs
    $db->exec("CREATE TABLE IF NOT EXISTS vagas_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT DEFAULT '',
        categoria TEXT DEFAULT 'geral',
        qtd_vagas INTEGER DEFAULT 1,
        status TEXT DEFAULT 'aberta',
        pc_id TEXT DEFAULT '',
        remote_id INTEGER DEFAULT 0,
        criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(empresa, titulo, pc_id)
    )");

    // Candidaturas - sync entre PCs
    $db->exec("CREATE TABLE IF NOT EXISTS candidaturas_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vaga_remote_id INTEGER DEFAULT 0,
        vaga_titulo TEXT DEFAULT '',
        vaga_empresa TEXT DEFAULT '',
        motorista TEXT NOT NULL,
        motorista_empresa TEXT DEFAULT 'Lobo Solitario',
        mensagem TEXT DEFAULT '',
        status TEXT DEFAULT 'pendente',
        pc_id TEXT DEFAULT '',
        remote_id INTEGER DEFAULT 0,
        criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        respondida_em TIMESTAMP NULL,
        UNIQUE(vaga_remote_id, motorista, pc_id)
    )");

    // Solicitacoes - sync entre PCs (convites)
    $db->exec("CREATE TABLE IF NOT EXISTS solicitacoes_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista TEXT NOT NULL,
        empresa TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        mensagem TEXT DEFAULT '',
        tipo TEXT DEFAULT 'pedido',
        vaga_id INTEGER DEFAULT NULL,
        pc_id TEXT DEFAULT '',
        remote_id INTEGER DEFAULT 0,
        criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        respondida_em TIMESTAMP NULL,
        UNIQUE(motorista, empresa, tipo, pc_id)
    )");

    // Inicializar reset_token se nao existir
    $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
    $stmt->execute(['reset_token']);
    if (!$stmt->fetch()) {
        $db->prepare("INSERT INTO server_config (chave, valor) VALUES (?, ?)")->execute(['reset_token', '0']);
    }

    // Inicializar sync_generation se nao existir
    $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
    $stmt->execute(['sync_generation']);
    if (!$stmt->fetch()) {
        $db->prepare("INSERT INTO server_config (chave, valor) VALUES (?, ?)")->execute(['sync_generation', '0']);
    }

    // Index para sync_log (performance)
    try { $db->exec("CREATE INDEX IF NOT EXISTS idx_sync_log_criado_em ON sync_log(criado_em)"); } catch (PDOException $e) {}

    // Auto-limpeza: sync_log com mais de 30 dias
    try { $db->exec("DELETE FROM sync_log WHERE criado_em < datetime('now', '-30 days')"); } catch (PDOException $e) {}

    // Migrations: pc_id nas tabelas de ranking
    try { $db->exec("ALTER TABLE ranking_empresas ADD COLUMN pc_id TEXT DEFAULT ''"); } catch (PDOException $e) {}
    try { $db->exec("ALTER TABLE ranking_motoristas ADD COLUMN pc_id TEXT DEFAULT ''"); } catch (PDOException $e) {}
    try { $db->exec("ALTER TABLE ranking_viagens ADD COLUMN pc_id TEXT DEFAULT ''"); } catch (PDOException $e) {}

    // Auto-dedup: remove Lobo Solitário entries when motorista has a real company
    try {
        $db->exec("DELETE FROM ranking_motoristas WHERE (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario') AND nome IN (SELECT nome FROM ranking_motoristas WHERE empresa != 'Lobo Solitário' AND empresa != 'Lobo Solitario')");
    } catch (PDOException $e) {}
}

/**
 * Normaliza um nome para comparacao agnostica de caixa/espaco/acento.
 * IMPORTANTE: Esta funcao DEVE ser identica entre PHP e JS para evitar
 * duplicatas por normalizacao inconsistente.
 * Remove espacos, pontos, hifens e tudo que nao for letra/digito.
 */
function normalize_key($s) {
    $s = (string)$s;
    $s = trim($s);
    if (function_exists('mb_strtolower')) {
        $s = mb_strtolower($s, 'UTF-8');
    } else {
        $s = strtolower($s);
    }
    if (function_exists('iconv')) {
        $transl = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        if ($transl !== false && $transl !== '') $s = $transl;
    }
    // Remove tudo que nao for letra/digito: espacos, pontos, hifens, ect.
    $s = preg_replace('/[^a-z0-9]/', '', $s);
    return $s;
}

/**
 * Retorna o nome canonico (ja existente no ranking_empresas) que casa com $nome
 * ignorando caixa/espaco/acento. Se nao houver, retorna $nome.
 */
function canonicalEmpresa($nome) {
    $nome = trim((string)$nome);
    if ($nome === '') return $nome;
    static $map = null;
    if ($map === null) {
        $map = [];
        $rows = getDB()->query("SELECT nome FROM ranking_empresas")->fetchAll();
        foreach ($rows as $r) {
            $k = normalize_key($r['nome']);
            if ($k !== '' && !isset($map[$k])) $map[$k] = $r['nome'];
        }
    }
    $k = normalize_key($nome);
    return ($k !== '' && isset($map[$k])) ? $map[$k] : $nome;
}

/**
 * Retorna o nome canonico de motorista (por nome+empresa) que casa com $nome
 * dentro da $empresa. Se nao houver, retorna o proprio $nome.
 */
function canonicalMotorista($nome, $empresa) {
    $nome = trim((string)$nome);
    if ($nome === '') return '';
    static $map = null;
    if ($map === null) {
        $map = [];
        $rows = getDB()->query("SELECT DISTINCT nome, empresa FROM ranking_motoristas")->fetchAll();
        foreach ($rows as $r) {
            $k = normalize_key($r['nome']) . '|' . normalize_key($r['empresa']);
            if (!isset($map[$k])) $map[$k] = $r['nome'];
        }
    }
    $k = normalize_key($nome) . '|' . normalize_key($empresa);
    return (isset($map[$k])) ? $map[$k] : $nome;
}
?>
