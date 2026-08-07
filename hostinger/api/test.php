<?php
header('Content-Type: application/json; charset=utf-8');
error_reporting(0);
ini_set('display_errors', 0);

require_once __DIR__ . '/config.php';

// Apenas acessivel com SYNC_SECRET correta (protecao basica)
$secret = $_GET['secret'] ?? '';
if ($secret !== SYNC_SECRET) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

$result = [];
$result['php_version'] = PHP_VERSION;
$result['pdo_available'] = extension_loaded('pdo');
$result['pdo_sqlite'] = extension_loaded('pdo_sqlite');

try {
    $db = getDB();
    $result['db_connection'] = 'OK';
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    $result['tables'] = $tables;
} catch (PDOException $e) {
    $result['db_connection'] = 'FALHOU';
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
