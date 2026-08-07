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

// If specific ID requested, return full detalhes for that row
$id = $_GET['id'] ?? '';
if ($id !== '') {
    $stmt = $db->prepare("SELECT id, detalhes, criado_em FROM sync_log WHERE id = ?");
    $stmt->execute([(int)$id]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Log nao encontrado']);
        exit;
    }
    $row['detalhes'] = json_decode($row['detalhes'] ?? '{}', true);
    echo json_encode(['ok' => true, 'log' => $row]);
    exit;
}

// Return list without heavy detalhes column, with index hint
$rows = $db->query("SELECT id, registros_empresas, registros_motoristas, ip_origem, criado_em FROM sync_log ORDER BY criado_em DESC LIMIT 50")->fetchAll();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['registros_empresas'] = (int)$r['registros_empresas'];
    $r['registros_motoristas'] = (int)$r['registros_motoristas'];
}

echo json_encode(['ok' => true, 'logs' => $rows]);
