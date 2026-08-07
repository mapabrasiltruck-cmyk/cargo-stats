<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Metodo nao permitido']); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$body = json_decode(file_get_contents('php://input'), true);
$secret = $body['secret'] ?? '';

if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Sessao invalida']);
    exit;
}

try {
    $db = getDB();

    $tables = [
        'ranking_empresas', 'ranking_motoristas', 'ranking_viagens',
        'eventos', 'cargas_pendentes', 'mapping_cargas',
        'planos_solicitacoes', 'reacoes', 'stats_gerais', 'sync_log',
        'dispositivos', 'server_config'
    ];

    $allowedTables = $tables;
    foreach ($tables as $table) {
        if (!in_array($table, $allowedTables, true)) {
            continue;
        }
        $db->exec("DROP TABLE IF EXISTS \"" . $table . "\"");
    }

    // Delete JSON ranking files
    $jsonFiles = [
        __DIR__ . '/../api/ranking_empresas.json',
        __DIR__ . '/../api/ranking_motoristas.json',
        __DIR__ . '/../api/stats_gerais.json'
    ];
    foreach ($jsonFiles as $f) {
        if (file_exists($f)) {
            unlink($f);
        }
    }

    echo json_encode(['ok' => true, 'message' => 'Reset completo! As tabelas serao recriadas automaticamente no proximo acesso.']);
} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] admin_reset: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
