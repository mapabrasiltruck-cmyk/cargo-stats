<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Metodo nao permitido']); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$secret = $_GET['secret'] ?? '';
if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Sessao invalida']);
    exit;
}

$db = getDB();

// Cargas pendentes
$cargas = $db->query("SELECT * FROM cargas_pendentes ORDER BY classificada_em IS NULL DESC, ocorrencias DESC")->fetchAll();

// Mapping
$mapping = [];
$rows = $db->query("SELECT cargo_id, nome, categoria FROM mapping_cargas")->fetchAll();
foreach ($rows as $r) {
    $mapping[$r['cargo_id']] = ['nome' => $r['nome'], 'categoria' => $r['categoria']];
}

// Evento ativo
$evento = null;
    $ev = $db->query("SELECT * FROM eventos WHERE ativo = 1 AND data_fim > datetime('now') ORDER BY data_inicio DESC LIMIT 1")->fetch();
if ($ev) {
    $evento = [
        'id' => (int)$ev['id'], 'tipo' => $ev['tipo'], 'titulo' => $ev['titulo'],
        'descricao' => $ev['descricao'], 'parametros' => json_decode($ev['parametros'] ?? '{}', true),
        'data_inicio' => $ev['data_inicio'], 'data_fim' => $ev['data_fim']
    ];
}

// Historico
$historico = [];
$rows = $db->query("SELECT * FROM eventos ORDER BY data_inicio DESC LIMIT 20")->fetchAll();
foreach ($rows as $r) {
    $historico[] = [
        'id' => (int)$r['id'], 'tipo' => $r['tipo'], 'titulo' => $r['titulo'],
        'data_inicio' => $r['data_inicio'], 'data_fim' => $r['data_fim']
    ];
}

// Planos solicitacoes
$planosSolicitacoes = $db->query("SELECT * FROM planos_solicitacoes ORDER BY criado_em DESC LIMIT 50")->fetchAll();

// Motoristas (do ultimo sync)
$motoristas = $db->query("SELECT nome, empresa FROM ranking_motoristas ORDER BY nome ASC")->fetchAll();

echo json_encode([
    'ok' => true,
    'cargas_pendentes' => $cargas,
    'mapping' => $mapping,
    'evento' => $evento,
    'historico' => $historico,
    'planos_solicitacoes' => $planosSolicitacoes,
    'motoristas' => $motoristas
]);
?>
