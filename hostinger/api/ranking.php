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

$type = $_GET['t'] ?? 'empresas';
$empresa = $_GET['empresa'] ?? null;
$db = getDB();

if ($type === 'empresas') {
    $rows = $db->query("SELECT nome, logo, motoristas, viagens, km, pontuacao FROM ranking_empresas ORDER BY pontuacao DESC")->fetchAll();
    echo json_encode(['ranking' => $rows]);
} elseif ($type === 'motoristas') {
    if ($empresa) {
        $stmt = $db->prepare("SELECT nome, empresa, viagens, km, pontuacao FROM ranking_motoristas WHERE empresa = ? ORDER BY pontuacao DESC");
        $stmt->execute([$empresa]);
    } else {
        $stmt = $db->query("SELECT nome, COALESCE(MAX(CASE WHEN empresa != 'Lobo Solitário' AND empresa != 'Lobo Solitario' THEN empresa END), MAX(empresa)) AS empresa, SUM(viagens) AS viagens, SUM(km) AS km, SUM(pontuacao) AS pontuacao FROM ranking_motoristas GROUP BY nome ORDER BY pontuacao DESC");
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['ranking' => $rows]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo invalido. Use t=empresas ou t=motoristas']);
}
?>
