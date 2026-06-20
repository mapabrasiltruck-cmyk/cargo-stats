<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

error_reporting(E_ALL);
ini_set('display_errors', 0);

try {
    require_once __DIR__ . '/config.php';

    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Body vazio', 'step' => 'read_body']);
        exit;
    }

    $input = json_decode($raw, true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON invalido', 'step' => 'json_decode', 'raw_length' => strlen($raw)]);
        exit;
    }

    if (!isset($input['secret']) || $input['secret'] !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida', 'step' => 'secret']);
        exit;
    }

    $db = getDB();

    $empresas = $input['empresas'] ?? [];
    $motoristas = $input['motoristas'] ?? [];
    $stats = $input['stats'] ?? [];

    $db->exec('TRUNCATE TABLE ranking_empresas');
    $stmtEmp = $db->prepare('INSERT INTO ranking_empresas (nome, logo, descricao, motoristas, viagens, km, pontuacao) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach ($empresas as $e) {
        $stmtEmp->execute([
            $e['nome'] ?? '',
            $e['logo'] ?? '',
            $e['descricao'] ?? '',
            $e['motoristas'] ?? 0,
            $e['viagens'] ?? 0,
            $e['km'] ?? 0,
            $e['pontuacao'] ?? 0
        ]);
    }

    $db->exec('TRUNCATE TABLE ranking_motoristas');
    $stmtMot = $db->prepare('INSERT INTO ranking_motoristas (nome, empresa, viagens, km, pontuacao) VALUES (?, ?, ?, ?, ?)');
    foreach ($motoristas as $m) {
        $stmtMot->execute([
            $m['nome'] ?? '',
            $m['empresa'] ?? 'Lobo Solitario',
            $m['viagens'] ?? 0,
            $m['km'] ?? 0,
            $m['pontuacao'] ?? 0
        ]);
    }

    $stmtStats = $db->prepare('INSERT INTO stats_gerais (id, total_empresas, total_motoristas, total_viagens, total_km) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE total_empresas=VALUES(total_empresas), total_motoristas=VALUES(total_motoristas), total_viagens=VALUES(total_viagens), total_km=VALUES(total_km)');
    $stmtStats->execute([
        $stats['totalEmpresas'] ?? 0,
        $stats['totalMotoristas'] ?? 0,
        $stats['totalViagens'] ?? 0,
        $stats['totalKm'] ?? 0
    ]);

    $stmtLog = $db->prepare('INSERT INTO sync_log (registros_empresas, registros_motoristas, ip_origem) VALUES (?, ?, ?)');
    $stmtLog->execute([
        count($empresas),
        count($motoristas),
        $_SERVER['REMOTE_ADDR'] ?? ''
    ]);

    echo json_encode([
        'ok' => true,
        'empresas' => count($empresas),
        'motoristas' => count($motoristas),
        'timestamp' => date('c')
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erro: ' . $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
}
?>