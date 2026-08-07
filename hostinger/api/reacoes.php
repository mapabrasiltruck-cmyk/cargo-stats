<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/config.php';
$db = getDB();

try {
    $stmt = $db->query("SELECT alvo_nome, alvo_tipo, tipo_reacao, COUNT(*) as count FROM reacoes GROUP BY alvo_nome, alvo_tipo, tipo_reacao");
    $rows = $stmt->fetchAll();
    
    $reacoesFormatadas = [];
    foreach ($rows as $row) {
        $key = $row['alvo_tipo'] . '_' . $row['alvo_nome'];
        if (!isset($reacoesFormatadas[$key])) {
            $reacoesFormatadas[$key] = [];
        }
        $reacoesFormatadas[$key][$row['tipo_reacao']] = ['count' => (int)$row['count']];
    }

    echo json_encode(['ok' => true, 'reacoes' => $reacoesFormatadas], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] reacoes: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
