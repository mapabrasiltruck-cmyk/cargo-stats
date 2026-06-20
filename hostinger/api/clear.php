<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$secret = $_GET['secret'] ?? '';

if ($secret !== SYNC_SECRET) {
    http_response_code(401);
    echo json_encode(['error' => 'Chave invalida']);
    exit;
}

$db = getDB();

if ($action === 'clear') {
    $db->exec('TRUNCATE TABLE ranking_empresas');
    $db->exec('TRUNCATE TABLE ranking_motoristas');
    $db->exec('TRUNCATE TABLE stats_gerais');
    $db->exec('TRUNCATE TABLE sync_log');
    echo json_encode(['ok' => true, 'message' => 'Todas as tabelas foram limpas']);
} else {
    echo json_encode(['error' => 'Acao invalida. Use ?action=clear&secret=SUA_CHAVE']);
}
?>