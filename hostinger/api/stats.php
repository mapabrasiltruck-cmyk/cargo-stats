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
$row = $db->query("SELECT total_empresas, total_motoristas, total_viagens, total_km FROM stats_gerais WHERE id = 1")->fetch();

if (!$row) {
    $row = ['total_empresas' => 0, 'total_motoristas' => 0, 'total_viagens' => 0, 'total_km' => 0];
}

echo json_encode([
    'totalEmpresas' => (int)$row['total_empresas'],
    'totalMotoristas' => (int)$row['total_motoristas'],
    'totalViagens' => (int)$row['total_viagens'],
    'totalKm' => (int)$row['total_km']
]);
?>
