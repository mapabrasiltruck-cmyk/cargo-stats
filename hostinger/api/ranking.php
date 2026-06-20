<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=300');

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
        $stmt = $db->query("SELECT nome, empresa, viagens, km, pontuacao FROM ranking_motoristas ORDER BY pontuacao DESC");
    }
    $rows = $stmt->fetchAll();
    echo json_encode(['ranking' => $rows]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo invalido. Use t=empresas ou t=motoristas']);
}
?>
