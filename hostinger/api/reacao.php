<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

require_once __DIR__ . '/config.php';

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Body vazio']);
    exit;
}

$input = json_decode($raw, true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

if (!isset($input['secret']) || $input['secret'] !== SYNC_SECRET) {
    http_response_code(401);
    echo json_encode(['error' => 'Chave secreta invalida']);
    exit;
}

$alvoNome = trim($input['alvo_nome'] ?? '');
$alvoTipo = trim($input['alvo_tipo'] ?? '');
$tipoReacao = trim($input['tipo_reacao'] ?? '');
$usuario = trim($input['usuario'] ?? '');

if (!$alvoNome || !$alvoTipo || !$tipoReacao || !$usuario) {
    http_response_code(400);
    echo json_encode(['error' => 'Campos obrigatorios: alvo_nome, alvo_tipo, tipo_reacao, usuario']);
    exit;
}

if (!in_array($alvoTipo, ['empresa', 'motorista'])) {
    http_response_code(400);
    echo json_encode(['error' => 'alvo_tipo deve ser empresa ou motorista']);
    exit;
}

$emojisValidos = ['joinha', 'coracao', 'fogo', 'riso', 'alvo'];
if (!in_array($tipoReacao, $emojisValidos)) {
    http_response_code(400);
    echo json_encode(['error' => 'tipo_reacao invalido. Use: ' . implode(', ', $emojisValidos)]);
    exit;
}

$db = getDB();

try {
    // Verifica se já existe
    $stmt = $db->prepare("SELECT id FROM reacoes WHERE alvo_nome = ? AND alvo_tipo = ? AND tipo_reacao = ? AND usuario = ?");
    $stmt->execute([$alvoNome, $alvoTipo, $tipoReacao, $usuario]);
    $reacaoExistente = $stmt->fetch();

    if ($reacaoExistente) {
        // Remove
        $stmtDel = $db->prepare("DELETE FROM reacoes WHERE id = ?");
        $stmtDel->execute([$reacaoExistente['id']]);
        $acao = 'removida';
    } else {
        // Adiciona
        $stmtIns = $db->prepare("INSERT INTO reacoes (alvo_nome, alvo_tipo, tipo_reacao, usuario) VALUES (?, ?, ?, ?)");
        $stmtIns->execute([$alvoNome, $alvoTipo, $tipoReacao, $usuario]);
        $acao = 'adicionada';
    }

    echo json_encode(['ok' => true, 'acao' => $acao]);
} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] reacao: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
