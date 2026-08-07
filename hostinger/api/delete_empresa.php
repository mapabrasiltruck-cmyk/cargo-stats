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

    $nome = trim($input['nome'] ?? '');
    if ($nome === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Nome da empresa obrigatorio']);
        exit;
    }

    $db = getDB();
    $pcId = trim($input['pc_id'] ?? '');

    $db->exec('BEGIN TRANSACTION');
    try {
        if ($pcId !== '') {
            $stmt = $db->prepare("DELETE FROM ranking_empresas WHERE nome = ? AND pc_id = ?");
            $stmt->execute([$nome, $pcId]);
            $stmt = $db->prepare("DELETE FROM ranking_motoristas WHERE empresa = ? AND pc_id = ?");
            $stmt->execute([$nome, $pcId]);
            // Also clean up orphan trips for this company
            $stmt = $db->prepare("DELETE FROM ranking_viagens WHERE empresa = ? AND pc_id = ?");
            $stmt->execute([$nome, $pcId]);
        } else {
            $stmt = $db->prepare("DELETE FROM ranking_empresas WHERE nome = ?");
            $stmt->execute([$nome]);
            $stmt = $db->prepare("DELETE FROM ranking_motoristas WHERE empresa = ?");
            $stmt->execute([$nome]);
            // Also clean up orphan trips
            $stmt = $db->prepare("DELETE FROM ranking_viagens WHERE empresa = ?");
            $stmt->execute([$nome]);
        }
        $db->exec('COMMIT');
    } catch (\Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }

    echo json_encode([
        'ok' => true,
        'message' => "Empresa '{$nome}' removida"
    ]);

} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] delete_empresa: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
?>
