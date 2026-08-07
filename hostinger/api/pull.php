<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

error_reporting(E_ALL);
ini_set('display_errors', 0);

try {
    require_once __DIR__ . '/config.php';

    $secret = $_GET['secret'] ?? '';
    if ($secret !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida']);
        exit;
    }

    $db = getDB();

    // Multi-PC filter
    $pcId = trim($_GET['pc_id'] ?? '');
    $pcFilter = '';
    $pcParams = [];
    if ($pcId !== '') {
        $pcFilter = ' WHERE pc_id = ?';
        $pcParams = [$pcId];
    }

    // ========== MAPPING DE CLASSIFICACOES ==========

    $mapping = [];
    $rows = $db->query("SELECT cargo_id, nome, categoria FROM mapping_cargas")->fetchAll();
    foreach ($rows as $row) {
        $mapping[$row['cargo_id']] = [
            'nome' => $row['nome'],
            'categoria' => $row['categoria']
        ];
    }

    // ========== EVENTO ATIVO ==========

    $evento = null;
    $evRow = $db->query("SELECT * FROM eventos WHERE ativo = 1 AND data_fim > datetime('now') ORDER BY data_inicio DESC LIMIT 1")->fetch();
    if ($evRow) {
        $evento = [
            'id' => (int)$evRow['id'],
            'tipo' => $evRow['tipo'],
            'titulo' => $evRow['titulo'],
            'descricao' => $evRow['descricao'],
            'parametros' => json_decode($evRow['parametros'] ?? '{}', true),
            'data_inicio' => $evRow['data_inicio'],
            'data_fim' => $evRow['data_fim']
        ];
    }

    // ========== PLANOS SOLICITACOES PENDENTES ==========

    $planosSolicitacoes = [];
    $rows = $db->query("SELECT * FROM planos_solicitacoes WHERE status = 'pendente' ORDER BY criado_em ASC")->fetchAll();
    foreach ($rows as $row) {
        $planosSolicitacoes[] = [
            'id' => (int)$row['id'],
            'motorista_nome' => $row['motorista_nome'],
            'plano' => $row['plano'],
            'dias' => (int)$row['dias'],
            'criado_em' => $row['criado_em']
        ];
    }

    // ========== MOTORISTAS (para autocomplete no admin e sync) ==========

    $motoristas = [];
    $rows = $db->prepare("SELECT nome, empresa, foto, cs_gold, plano FROM ranking_motoristas{$pcFilter} ORDER BY nome ASC");
    $rows->execute($pcParams);
    $rows = $rows->fetchAll();
    foreach ($rows as $row) {
        $motoristas[] = [
            'nome' => $row['nome'],
            'empresa' => $row['empresa'],
            'foto' => $row['foto'] ?? '',
            'cs_gold' => (int)($row['cs_gold'] ?? 0),
            'plano' => $row['plano'] ?? 'bronze'
        ];
    }

    // ========== EMPRESAS (para sync entre instalacoes) ==========

    $empresas = [];
    $rows = $db->prepare("SELECT nome, logo, banner, descricao, motoristas, viagens, km, pontuacao FROM ranking_empresas{$pcFilter} ORDER BY pontuacao DESC");
    $rows->execute($pcParams);
    $rows = $rows->fetchAll();
    foreach ($rows as $row) {
        $empresas[] = [
            'nome' => $row['nome'],
            'logo' => $row['logo'] ?? '',
            'banner' => $row['banner'] ?? '',
            'descricao' => $row['descricao'] ?? '',
            'motoristas' => (int)$row['motoristas'],
            'viagens' => (int)$row['viagens'],
            'km' => (float)$row['km'],
            'pontuacao' => (int)$row['pontuacao']
        ];
    }

    // ========== VIAGENS (para sync entre instalacoes) ==========

    $viagens = [];
    $rows = $db->prepare("SELECT motorista, empresa, data, origem, destino, km, pontuacao, hash FROM ranking_viagens{$pcFilter} ORDER BY criado_em ASC");
    $rows->execute($pcParams);
    $rows = $rows->fetchAll();
    foreach ($rows as $row) {
        $viagens[] = [
            'motorista' => $row['motorista'],
            'empresa' => $row['empresa'],
            'data' => $row['data'],
            'origem' => $row['origem'] ?? '',
            'destino' => $row['destino'] ?? '',
            'km' => (float)$row['km'],
            'pontuacao' => (int)$row['pontuacao'],
            'hash' => $row['hash']
        ];
    }

    // Get current reset token
    $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
    $stmt->execute(['reset_token']);
    $tokenRow = $stmt->fetch();
    $serverToken = $tokenRow ? (int)$tokenRow['valor'] : 0;

    // Get max data_version seen across all PCs
    $stmtVer = $db->prepare("SELECT valor FROM server_config WHERE chave = 'max_data_version'");
    $stmtVer->execute();
    $dataVersion = (int)($stmtVer->fetchColumn() ?: 0);

    // ========== VAGAS SYNC ==========
    $vagas = [];
    try {
        $rows = $db->query("SELECT * FROM vagas_sync WHERE status = 'aberta' ORDER BY criada_em DESC")->fetchAll();
        foreach ($rows as $row) {
            $vagas[] = [
                'id' => (int)$row['id'],
                'remote_id' => (int)($row['remote_id'] ?? 0),
                'empresa' => $row['empresa'],
                'titulo' => $row['titulo'],
                'descricao' => $row['descricao'] ?? '',
                'categoria' => $row['categoria'] ?? 'geral',
                'qtd_vagas' => (int)($row['qtd_vagas'] ?? 1),
                'status' => $row['status'] ?? 'aberta',
                'pc_id' => $row['pc_id'] ?? '',
                'criada_em' => $row['criada_em'] ?? ''
            ];
        }
    } catch (Exception $e) {}

    // ========== CANDIDATURAS SYNC ==========
    $candidaturas = [];
    try {
        $rows = $db->query("SELECT * FROM candidaturas_sync ORDER BY criada_em DESC")->fetchAll();
        foreach ($rows as $row) {
            $candidaturas[] = [
                'id' => (int)$row['id'],
                'remote_id' => (int)($row['remote_id'] ?? 0),
                'vaga_remote_id' => (int)($row['vaga_remote_id'] ?? 0),
                'vaga_titulo' => $row['vaga_titulo'] ?? '',
                'vaga_empresa' => $row['vaga_empresa'] ?? '',
                'motorista' => $row['motorista'],
                'motorista_empresa' => $row['motorista_empresa'] ?? 'Lobo Solitario',
                'mensagem' => $row['mensagem'] ?? '',
                'status' => $row['status'] ?? 'pendente',
                'pc_id' => $row['pc_id'] ?? '',
                'criada_em' => $row['criada_em'] ?? ''
            ];
        }
    } catch (Exception $e) {}

    // ========== SOLICITACOES/CONVITES SYNC ==========
    $solicitacoes = [];
    try {
        $rows = $db->query("SELECT * FROM solicitacoes_sync WHERE status = 'pendente' ORDER BY criada_em DESC")->fetchAll();
        foreach ($rows as $row) {
            $solicitacoes[] = [
                'id' => (int)$row['id'],
                'remote_id' => (int)($row['remote_id'] ?? 0),
                'motorista' => $row['motorista'],
                'empresa' => $row['empresa'],
                'status' => $row['status'] ?? 'pendente',
                'mensagem' => $row['mensagem'] ?? '',
                'tipo' => $row['tipo'] ?? 'pedido',
                'vaga_id' => (int)($row['vaga_id'] ?? 0),
                'pc_id' => $row['pc_id'] ?? '',
                'criada_em' => $row['criada_em'] ?? ''
            ];
        }
    } catch (Exception $e) {}

    echo json_encode([
        'ok' => true,
        'mapping' => $mapping,
        'evento' => $evento,
        'planos_solicitacoes' => $planosSolicitacoes,
        'motoristas' => $motoristas,
        'empresas' => $empresas,
        'viagens' => $viagens,
        'vagas' => $vagas,
        'candidaturas' => $candidaturas,
        'solicitacoes' => $solicitacoes,
        'reset_token' => $serverToken,
        'data_version' => $dataVersion,
        'pc_id' => $pcId,
        'timestamp' => date('c')
    ]);

} catch (Exception $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] pull: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
?>
