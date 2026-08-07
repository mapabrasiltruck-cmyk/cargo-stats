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

if ($action === 'classificar') {
    $id = (int)($body['id'] ?? 0);
    $categoria = $body['categoria'] ?? 'a_classificar';
    if (!$id) { echo json_encode(['error' => 'ID obrigatorio']); exit; }

    $db->prepare("UPDATE cargas_pendentes SET categoria_sugerida = ?, classificada_em = datetime('now') WHERE id = ?")->execute([$categoria, $id]);
    echo json_encode(['ok' => true]);

} elseif ($action === 'excluir') {
    $id = (int)($body['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'ID obrigatorio']); exit; }

    $db->prepare("DELETE FROM cargas_pendentes WHERE id = ?")->execute([$id]);
    echo json_encode(['ok' => true]);

} elseif ($action === 'backfill') {
    // Busca registros que estao em cargas_pendentes mas com cargo_id vazio
    // para tentar preencher a partir do mapping_cargas
    $pendentes = $db->query("SELECT id, nome_original, cargo_id FROM cargas_pendentes WHERE classificada_em IS NULL AND (cargo_id IS NULL OR cargo_id = '')")->fetchAll();
    $atualizadas = 0;

    foreach ($pendentes as $c) {
        $stmtMapping = $db->prepare("SELECT cargo_id, categoria FROM mapping_cargas WHERE nome = ?");
        $stmtMapping->execute([$c['nome_original']]);
        $mapping = $stmtMapping->fetch();
        if ($mapping) {
            $db->prepare("UPDATE cargas_pendentes SET cargo_id = ?, categoria_sugerida = ? WHERE id = ?")->execute([$mapping['cargo_id'], $mapping['categoria'], $c['id']]);
            $atualizadas++;
        }
    }

    echo json_encode(['ok' => true, 'atualizadas' => $atualizadas, 'pendentes' => count($pendentes)]);

} elseif ($action === 'sincronizar') {
    $classificadas = $db->query("SELECT nome_original, cargo_id, categoria_sugerida FROM cargas_pendentes WHERE classificada_em IS NOT NULL")->fetchAll();
    $count = 0;

    $stmt = $db->prepare("INSERT INTO mapping_cargas (cargo_id, nome, categoria) VALUES (?, ?, ?) ON CONFLICT(cargo_id) DO UPDATE SET nome=excluded.nome, categoria=excluded.categoria");
    foreach ($classificadas as $c) {
        $cargoId = $c['cargo_id'] ?: strtolower(preg_replace('/\s+/', '_', $c['nome_original']));
        $stmt->execute([$cargoId, $c['nome_original'], $c['categoria_sugerida']]);
        $count++;
    }

    echo json_encode(['ok' => true, 'sincronizadas' => $count]);

} else {
    echo json_encode(['error' => 'Acao invalida: ' . $action]);
}
?>
