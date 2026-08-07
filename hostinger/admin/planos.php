<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

session_start();
require_once __DIR__ . '/../api/config.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// ========== GET - list solicitations (usado pelo app com secret) ==========
if ($method === 'GET') {
    $secret = $_GET['secret'] ?? '';
    $status = $_GET['status'] ?? 'pendente';

    if ($secret === SYNC_SECRET) {
        // App polling: retorna solicitacoes pendentes
        $stmt = $db->prepare("SELECT * FROM planos_solicitacoes WHERE status = ? ORDER BY criado_em ASC");
        $stmt->execute([$status]);
        echo json_encode(['ok' => true, 'solicitacoes' => $stmt->fetchAll()]);
        exit;
    }

    // Admin auth
    if (empty($_SESSION['admin'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Nao autorizado']);
        exit;
    }

    $stmt = $db->query("SELECT * FROM planos_solicitacoes ORDER BY criado_em DESC LIMIT 100");
    echo json_encode(['ok' => true, 'solicitacoes' => $stmt->fetchAll()]);
    exit;
}

// ========== POST ==========
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Body invalido']);
    exit;
}

$action = $body['action'] ?? '';
$secret = $body['secret'] ?? '';

// --- Action: criar (admin) ---
if ($action === 'criar') {
    if (empty($_SESSION['admin']) || $_SESSION['admin_token'] !== $secret) {
        http_response_code(401);
        echo json_encode(['error' => 'Sessao invalida']);
        exit;
    }

    $motorista = trim($body['motorista'] ?? '');
    $plano = trim($body['plano'] ?? '');
    $dias = (int)($body['dias'] ?? 30);

    if (!$motorista || !$plano || !in_array($plano, ['gold', 'vip'])) {
        http_response_code(400);
        echo json_encode(['error' => 'motorista e plano (gold/vip) obrigatorios']);
        exit;
    }

    $stmt = $db->prepare("INSERT INTO planos_solicitacoes (motorista_nome, plano, dias, status) VALUES (?, ?, ?, 'pendente')");
    $stmt->execute([$motorista, $plano, $dias]);

    echo json_encode(['ok' => true, 'id' => $db->lastInsertId()]);
    exit;
}

// --- Action: confirmar (app apos aplicar) ---
if ($action === 'confirmar') {
    $id = (int)($body['id'] ?? 0);
    $status = $body['status'] ?? 'aplicado';

    if ($secret !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave invalida']);
        exit;
    }

    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'ID obrigatorio']);
        exit;
    }

    $stmt = $db->prepare("UPDATE planos_solicitacoes SET status = ?, aplicado_em = datetime('now') WHERE id = ?");
    $stmt->execute([$status, $id]);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Acao invalida']);
