<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Metodo nao permitido']); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$adminPassword = getenv('ADMIN_PASSWORD');
if ($adminPassword === false || $adminPassword === '') {
    http_response_code(500);
    echo json_encode(['error' => 'ADMIN_PASSWORD nao configurado. Defina a variavel de ambiente ADMIN_PASSWORD.']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$senha = $body['senha'] ?? '';

if ($senha !== $adminPassword) {
    http_response_code(401);
    echo json_encode(['error' => 'Senha incorreta']);
    exit;
}

session_regenerate_id(true);
$sessionToken = bin2hex(random_bytes(32));
$_SESSION['admin'] = true;
$_SESSION['admin_token'] = $sessionToken;
$_SESSION['admin_created'] = time();
$_SESSION['admin_expires'] = time() + 3600; // 1 hora

echo json_encode(['ok' => true, 'session' => $sessionToken]);
?>
