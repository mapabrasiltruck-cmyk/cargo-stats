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

$db = getDB();
$action = $body['action'] ?? '';

switch ($action) {

    case 'reset_pc':
        $pcId = trim($body['pc_id'] ?? '');
        if ($pcId === '') { http_response_code(400); echo json_encode(['error' => 'pc_id obrigatorio']); exit; }
        $db->exec("DELETE FROM ranking_empresas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_motoristas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_viagens WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM dispositivos WHERE pc_id = " . $db->quote($pcId));
        echo json_encode(['ok' => true, 'message' => "PC {$pcId} resetado"]);
        break;

    case 'delete_empresa':
        $nome = trim($body['nome'] ?? '');
        if ($nome === '') { http_response_code(400); echo json_encode(['error' => 'Nome obrigatorio']); exit; }
        $pcId = trim($body['pc_id'] ?? '');
        if ($pcId !== '') {
            $db->prepare("DELETE FROM ranking_empresas WHERE nome = ? AND pc_id = ?")->execute([$nome, $pcId]);
            $db->prepare("DELETE FROM ranking_motoristas WHERE empresa = ? AND pc_id = ?")->execute([$nome, $pcId]);
        } else {
            $db->prepare("DELETE FROM ranking_empresas WHERE nome = ?")->execute([$nome]);
            $db->prepare("DELETE FROM ranking_motoristas WHERE empresa = ?")->execute([$nome]);
        }
        echo json_encode(['ok' => true, 'message' => "Empresa '{$nome}' removida"]);
        break;

    case 'limpar_orfaos':
        $db->exec("DELETE FROM ranking_empresas WHERE pc_id = '' OR pc_id IS NULL");
        $db->exec("DELETE FROM ranking_motoristas WHERE pc_id = '' OR pc_id IS NULL");
        $db->exec("DELETE FROM ranking_viagens WHERE pc_id = '' OR pc_id IS NULL");
        echo json_encode(['ok' => true, 'message' => 'Dados orfaos limpos']);
        break;

    case 'reset_global':
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
        $db->prepare("UPDATE server_config SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE chave = ?")->execute(['reset_token']);
        $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
        $stmt->execute(['reset_token']);
        $newToken = $stmt->fetchColumn();
        echo json_encode(['ok' => true, 'message' => 'Reset global concluido', 'reset_token' => (int)$newToken]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acao invalida: ' . $action]);
}
?>