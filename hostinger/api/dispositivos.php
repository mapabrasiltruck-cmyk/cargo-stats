<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

error_reporting(E_ALL);
ini_set('display_errors', 0);

try {
    require_once __DIR__ . '/config.php';

    $secret = $_GET['secret'] ?? ($_POST['secret'] ?? '');
    if ($secret !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida']);
        exit;
    }

    $db = getDB();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // List all devices
        $dispositivos = $db->query("SELECT pc_id, nome, ultimo_sync, versao_app, reset_token, ativo FROM dispositivos ORDER BY ultimo_sync DESC")->fetchAll();

        // Count data per PC
        $stmtEmp = $db->prepare("SELECT COUNT(*) FROM ranking_empresas WHERE pc_id = ?");
        $stmtMot = $db->prepare("SELECT COUNT(*) FROM ranking_motoristas WHERE pc_id = ?");
        $stmtVia = $db->prepare("SELECT COUNT(*) FROM ranking_viagens WHERE pc_id = ?");

        foreach ($dispositivos as &$d) {
            $stmtEmp->execute([$d['pc_id']]);
            $d['empresas'] = (int)$stmtEmp->fetchColumn();

            $stmtMot->execute([$d['pc_id']]);
            $d['motoristas'] = (int)$stmtMot->fetchColumn();

            $stmtVia->execute([$d['pc_id']]);
            $d['viagens'] = (int)$stmtVia->fetchColumn();
        }

        // Also count orphan data (pc_id = '' or NULL)
        $orfEmp = $db->query("SELECT COUNT(*) FROM ranking_empresas WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();
        $orfMot = $db->query("SELECT COUNT(*) FROM ranking_motoristas WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();
        $orfVia = $db->query("SELECT COUNT(*) FROM ranking_viagens WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();

        echo json_encode([
            'ok' => true,
            'dispositivos' => $dispositivos,
            'orfãos' => [
                'empresas' => (int)$orfEmp,
                'motoristas' => (int)$orfMot,
                'viagens' => (int)$orfVia
            ]
        ]);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Metodo nao permitido']);
    }

} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] dispositivos: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
?>