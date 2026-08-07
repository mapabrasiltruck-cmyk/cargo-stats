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
        echo json_encode(['error' => 'Body vazio']);
        exit;
    }

    $input = json_decode($raw, true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON invalido']);
        exit;
    }

    if (!isset($input['secret']) || $input['secret'] !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida']);
        exit;
    }

    $db = getDB();
    $pcId = trim($input['pc_id'] ?? '');

    if ($pcId !== '') {
        // Per-PC reset: delete only this PC's data
        $db->exec("DELETE FROM ranking_empresas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_motoristas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_viagens WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM dispositivos WHERE pc_id = " . $db->quote($pcId));

        echo json_encode([
            'ok' => true,
            'message' => "Dados do PC {$pcId} limpos"
        ]);
    } else {
        // Global reset: increment token FIRST to block other PCs from uploading
        // during the delete window (prevents race condition)
        $stmt = $db->prepare("UPDATE server_config SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE chave = ?");
        $stmt->execute(['reset_token']);

        $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
        $stmt->execute(['reset_token']);
        $newToken = $stmt->fetchColumn();

        // Now delete everything - any PC that syncs with old token will be rejected
        $db->exec('DELETE FROM ranking_empresas');
        $db->exec('DELETE FROM ranking_motoristas');
        $db->exec('DELETE FROM ranking_viagens');
        $db->exec('DELETE FROM stats_gerais');
        $db->exec('DELETE FROM sync_log');
        $db->exec('DELETE FROM reacoes');
        $db->exec('DELETE FROM mapping_cargas');
        $db->exec('DELETE FROM cargas_pendentes');
        $db->exec('DELETE FROM eventos');
        $db->exec('DELETE FROM planos_solicitacoes');
        $db->exec('DELETE FROM dispositivos');
        $db->exec('DELETE FROM vagas_sync');
        $db->exec('DELETE FROM candidaturas_sync');
        $db->exec('DELETE FROM solicitacoes_sync');

        // Clean up uploaded images
        $uploadDir = __DIR__ . '/../uploads';
        if (is_dir($uploadDir)) {
            $files = glob($uploadDir . '/*');
            foreach ($files as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
        }

        echo json_encode([
            'ok' => true,
            'message' => 'Todos os dados remotos foram limpos',
            'reset_token' => (int)$newToken
        ]);
    }

} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] reset: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
?>