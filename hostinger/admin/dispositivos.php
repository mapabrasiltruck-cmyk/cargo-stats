<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$secret = $_GET['secret'] ?? ($_POST['secret'] ?? '');
if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Sessao invalida']);
    exit;
}

$db = getDB();

$dispositivos = $db->query("SELECT pc_id, nome, ultimo_sync, versao_app, reset_token, ativo FROM dispositivos ORDER BY ultimo_sync DESC")->fetchAll();

$stmtEmp = $db->prepare("SELECT COUNT(*) FROM ranking_empresas WHERE pc_id = ?");
$stmtMot = $db->prepare("SELECT COUNT(*) FROM ranking_motoristas WHERE pc_id = ?");
$stmtVia = $db->prepare("SELECT COUNT(*) FROM ranking_viagens WHERE pc_id = ?");

foreach ($dispositivos as &$d) {
    $stmtEmp->execute([$d['pc_id']]); $d['empresas'] = (int)$stmtEmp->fetchColumn();
    $stmtMot->execute([$d['pc_id']]); $d['motoristas'] = (int)$stmtMot->fetchColumn();
    $stmtVia->execute([$d['pc_id']]); $d['viagens'] = (int)$stmtVia->fetchColumn();
}

$orfEmp = $db->query("SELECT COUNT(*) FROM ranking_empresas WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();
$orfMot = $db->query("SELECT COUNT(*) FROM ranking_motoristas WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();
$orfVia = $db->query("SELECT COUNT(*) FROM ranking_viagens WHERE pc_id = '' OR pc_id IS NULL")->fetchColumn();

$stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
$stmt->execute(['reset_token']);
$resetToken = $stmt->fetchColumn();

echo json_encode([
    'ok' => true,
    'dispositivos' => $dispositivos,
    'orfãos' => ['empresas' => (int)$orfEmp, 'motoristas' => (int)$orfMot, 'viagens' => (int)$orfVia],
    'reset_token' => (int)$resetToken
]);
?>