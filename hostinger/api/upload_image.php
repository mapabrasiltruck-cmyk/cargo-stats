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

error_reporting(E_ALL);
ini_set('display_errors', 0);

try {
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

    $empresa = trim($input['empresa'] ?? '');
    $tipo = $input['tipo'] ?? '';
    $dataUri = $input['data'] ?? '';

    if ($empresa === '' || !in_array($tipo, ['logo', 'banner', 'foto']) || $dataUri === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Parametros invalidos: empresa, tipo (logo|banner|foto) e data sao obrigatorios']);
        exit;
    }

    $db = getDB();

    // Decode base64 data URI
    if (!preg_match('/^data:image\/(\w+);base64,(.+)$/', $dataUri, $matches)) {
        http_response_code(400);
        echo json_encode(['error' => 'Formato de imagem invalido. Use data:image/...;base64,...']);
        exit;
    }

    $ext = strtolower($matches[1]);
    if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'])) {
        http_response_code(400);
        echo json_encode(['error' => "Extensao nao suportada: {$ext}"]);
        exit;
    }

    $imageData = base64_decode($matches[2], true);
    if ($imageData === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Dados base64 invalidos']);
        exit;
    }

    // Max 5MB per image
    if (strlen($imageData) > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'Imagem muito grande. Maximo 5MB.']);
        exit;
    }

    // Validate actual image content
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_buffer($finfo, $imageData);
    finfo_close($finfo);
    $allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];
    if (!in_array($mimeType, $allowedMimes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Arquivo nao e uma imagem valida']);
        exit;
    }

    // Sanitize empresa name for filename
    $sanitized = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $empresa);
    $motorista = isset($input['motorista']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '_', $input['motorista']) : '';
    if ($tipo === 'foto' && $motorista) {
        $filename = "foto_{$sanitized}_{$motorista}.{$ext}";
    } else {
        $filename = "{$sanitized}_{$tipo}.{$ext}";
    }
    // Store at web root level: hostinger/uploads/ so URL is clean
    $uploadDir = __DIR__ . '/../uploads';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $filepath = "{$uploadDir}/{$filename}";

    file_put_contents($filepath, $imageData);

    // Build web URL
    $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
        . '://' . preg_replace('/[^a-zA-Z0-9\.\:\-]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
    $url = rtrim($baseUrl, '/') . "/uploads/{$filename}";

    // Update the ranking_empresas row with the web URL (not for foto)
    if (in_array($tipo, ['logo', 'banner'])) {
        $db->prepare("UPDATE ranking_empresas SET {$tipo} = ? WHERE nome = ?")->execute([$url, $empresa]);
    }
    // Update ranking_motoristas foto when tipo is 'foto'
    if ($tipo === 'foto' && !empty($motorista)) {
        $db->prepare("UPDATE ranking_motoristas SET foto = ? WHERE nome = ?")->execute([$url, $motorista]);
    }

    echo json_encode([
        'ok' => true,
        'url' => $url,
        'arquivo' => $filename
    ]);

} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] upload_image: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
