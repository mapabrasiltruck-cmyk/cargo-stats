<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$secret = $_GET['secret'] ?? '';
if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Sessao invalida']);
    exit;
}

$db = getDB();
$tipo = $_GET['t'] ?? 'empresas';
$pcId = trim($_GET['pc_id'] ?? '');
$filter = '';
$params = [];
if ($pcId !== '') {
    $filter = ' WHERE pc_id = ?';
    $params = [$pcId];
}

if ($tipo === 'empresas') {
    $rows = $db->prepare("SELECT nome, logo, motoristas, viagens, km, pontuacao, pc_id FROM ranking_empresas{$filter} ORDER BY pontuacao DESC");
    $rows->execute($params);
    echo json_encode(['ok' => true, 'dados' => $rows->fetchAll()]);
} elseif ($tipo === 'motoristas') {
    $rows = $db->prepare("SELECT nome, empresa, viagens, km, pontuacao, foto, pc_id FROM ranking_motoristas{$filter} ORDER BY pontuacao DESC");
    $rows->execute($params);
    echo json_encode(['ok' => true, 'dados' => $rows->fetchAll()]);
} elseif ($tipo === 'viagens') {
    $rows = $db->prepare("SELECT motorista, empresa, data, km, criado_em, pc_id FROM ranking_viagens{$filter} ORDER BY criado_em DESC LIMIT 200");
    $rows->execute($params);
    echo json_encode(['ok' => true, 'dados' => $rows->fetchAll()]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo invalido. Use t=empresas, motoristas ou viagens']);
}
?>