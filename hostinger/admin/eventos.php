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
$action = $body['action'] ?? '';

if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Sessao invalida']);
    exit;
}

$db = getDB();

if ($action === 'criar') {
    $tipo = $body['tipo'] ?? 'maratona_viagens';
    $titulo = $body['titulo'] ?? '';
    $descricao = $body['descricao'] ?? '';
    $meta = (int)($body['meta'] ?? 5);
    $bonus = (int)($body['bonus_pontos'] ?? 2000);
    $tipoMeta = $body['tipo_meta'] ?? 'viagens';

    if (!$titulo) { echo json_encode(['error' => 'Titulo obrigatorio']); exit; }

    $db->exec("UPDATE eventos SET ativo = 0 WHERE ativo = 1");

    $inicio = date('Y-m-d H:i:s');
    $fim = date('Y-m-d H:i:s', strtotime('+24 hours'));
    $parametros = json_encode(['tipo_meta' => $tipoMeta, 'meta' => $meta, 'bonus_pontos' => $bonus]);

    $db->prepare("INSERT INTO eventos (tipo, titulo, descricao, parametros, data_inicio, data_fim, ativo, criado_por) VALUES (?, ?, ?, ?, ?, ?, 1, 'admin')")
       ->execute([$tipo, $titulo, $descricao, $parametros, $inicio, $fim]);

    echo json_encode(['ok' => true]);

} elseif ($action === 'encerrar') {
    $db->exec("UPDATE eventos SET ativo = 0 WHERE ativo = 1");
    echo json_encode(['ok' => true]);

} elseif ($action === 'limpar') {
    $id = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'ID obrigatorio']); exit; }
    $db->prepare("DELETE FROM eventos WHERE id = ?")->execute([$id]);
    echo json_encode(['ok' => true]);

} else {
    echo json_encode(['error' => 'Acao invalida: ' . $action]);
}
?>
