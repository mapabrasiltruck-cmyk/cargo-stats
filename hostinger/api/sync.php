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
        echo json_encode(['error' => 'Body vazio', 'step' => 'read_body']);
        exit;
    }

    $input = json_decode($raw, true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON invalido', 'step' => 'json_decode', 'raw_length' => strlen($raw)]);
        exit;
    }

    if (!isset($input['secret']) || $input['secret'] !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida', 'step' => 'secret']);
        exit;
    }

    $db = getDB();

    // ========== MULTI-PC CONTROL ==========
    $pcId = trim($input['pc_id'] ?? '');
    if ($pcId !== '' && !preg_match('/^[a-zA-Z0-9\-_]{1,64}$/', $pcId)) {
        http_response_code(400);
        echo json_encode(['error' => 'pc_id invalido', 'step' => 'pc_id']);
        exit;
    }
    $pcToken = (int)($input['reset_token'] ?? 0);
    $pcGeneration = (int)($input['sync_generation'] ?? 0);
    $pcNome = trim($input['pc_nome'] ?? '');
    $pcVersao = trim($input['pc_versao'] ?? '');
    $dataVersion = (int)($input['data_version'] ?? 0);

    // Get current server reset token
    $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
    $stmt->execute(['reset_token']);
    $row = $stmt->fetch();
    $serverToken = $row ? (int)$row['valor'] : 0;

    // Get current server sync generation
    $stmt = $db->prepare("SELECT valor FROM server_config WHERE chave = ?");
    $stmt->execute(['sync_generation']);
    $rowGen = $stmt->fetch();
    $serverGeneration = $rowGen ? (int)$rowGen['valor'] : 0;

    // Detect first sync after reset: PC's generation is older than server's
    $isFirstSyncAfterReset = ($pcGeneration > 0 && $pcGeneration < $serverGeneration);

    // If PC has pcId and is stale, reject upload and tell it to reset
    if ($pcId !== '' && $serverToken > $pcToken) {
        echo json_encode([
            'ok' => true,
            'need_reset' => true,
            'new_reset_token' => $serverToken,
            'message' => 'Reset global detectado. Limpe seus dados locais.'
        ]);
        exit;
    }

    // Delete only THIS PC's old data before inserting fresh
    // Do NOT delete orphan data here to avoid deleting other PCs' data
    if ($pcId !== '') {
        $db->exec("DELETE FROM ranking_empresas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_motoristas WHERE pc_id = " . $db->quote($pcId));
        $db->exec("DELETE FROM ranking_viagens WHERE pc_id = " . $db->quote($pcId));
    }

    $empresas = $input['empresas'] ?? [];
    $motoristas = $input['motoristas'] ?? [];

    $validEmpresas = [];
    $validMotoristas = [];
    $warnings = [];

    foreach ($empresas as $i => $e) {
        $nome = trim($e['nome'] ?? '');
        if ($nome === '') {
            $warnings[] = "Empresa #{$i} ignorada: nome vazio";
            continue;
        }
        $nomeCanon = canonicalEmpresa($nome);
        $validEmpresas[] = [
            'nome' => $nome,
            'nome_canon' => $nomeCanon,
            'logo' => $e['logo'] ?? '',
            'banner' => $e['banner'] ?? '',
            'descricao' => $e['descricao'] ?? '',
            'motoristas' => (int)($e['motoristas'] ?? 0),
            'viagens' => (int)($e['viagens'] ?? 0),
            'km' => (int)($e['km'] ?? 0),
            'pontuacao' => (int)($e['pontuacao'] ?? 0)
        ];
    }

    foreach ($motoristas as $i => $m) {
        $nomeMot = trim($m['nome'] ?? '');
        if ($nomeMot === '') {
            $warnings[] = "Motorista #{$i} ignorado: nome vazio";
            continue;
        }
        $empresaMot = canonicalEmpresa(trim($m['empresa'] ?? 'Lobo Solitario'));
        $nomeMotCanon = canonicalMotorista($nomeMot, $empresaMot !== '' ? $empresaMot : 'Lobo Solitario');
        $validMotoristas[] = [
            'nome' => $nomeMotCanon,
            'empresa' => $empresaMot,
            'foto' => $m['foto'] ?? '',
            'viagens' => (int)($m['viagens'] ?? 0),
            'km' => (int)($m['km'] ?? 0),
            'pontuacao' => (int)($m['pontuacao'] ?? 0),
            'cs_gold' => (int)($m['cs_gold'] ?? 0),
            'plano' => $m['plano'] ?? 'bronze'
        ];
    }

    // PC novo ou apos reset global o payload vem vazio - isso e normal e NAO
    // pode virar erro 400, senao o PC fica travado (sem poder sincronizar nem
    // puxar dados). Apenas registra um aviso e segue.
    if (empty($validEmpresas) && empty($validMotoristas) && empty($input['viagens'])) {
        $warnings[] = 'Payload vazio (PC novo ou apos reset): aceito, sem dados para gravar.';
    }

    $db->exec('BEGIN TRANSACTION');
    try {
        // ========== MERGE INTELIGENTE DE EMPRESAS ==========
        // Em vez de INSERT OR REPLACE (que sobrescreve dados), usamos
        // INSERT OR IGNORE + UPDATE para fazer merge dos campos numericos.
        $stmtCheckEmp = $db->prepare('SELECT logo, banner, motoristas, viagens, km, pontuacao FROM ranking_empresas WHERE nome = ?');
        $stmtInsertEmp = $db->prepare('INSERT OR IGNORE INTO ranking_empresas (nome, logo, banner, descricao, motoristas, viagens, km, pontuacao, pc_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmtUpdateEmp = $db->prepare('UPDATE ranking_empresas SET logo = ?, banner = ?, motoristas = ?, viagens = ?, km = ?, pontuacao = ? WHERE nome = ?');
        $nomesInseridos = [];

        foreach ($validEmpresas as $e) {
            $logoFinal = $e['logo'];
            $bannerFinal = $e['banner'];

            // Preserve remote URLs if incoming has local paths
            $stmtCheckEmp->execute([$e['nome_canon']]);
            $existing = $stmtCheckEmp->fetch();
            if ($existing) {
                if ($existing['logo'] && (strpos($existing['logo'], 'http://') === 0 || strpos($existing['logo'], 'https://') === 0)) {
                    if ($logoFinal === '' || strpos($logoFinal, '/uploads/') === 0) {
                        $logoFinal = $existing['logo'];
                    }
                }
                if ($existing['banner'] && (strpos($existing['banner'], 'http://') === 0 || strpos($existing['banner'], 'https://') === 0)) {
                    if ($bannerFinal === '' || strpos($bannerFinal, '/uploads/') === 0) {
                        $bannerFinal = $existing['banner'];
                    }
                }

                if ($isFirstSyncAfterReset) {
                    // FIRST SYNC AFTER RESET: use incoming values directly (REPLACE)
                    // Don't use MAX() - the PC has fresh data after reset
                    $mergedMotoristas = $e['motoristas'];
                    $mergedViagens = $e['viagens'];
                    $mergedKm = $e['km'];
                    $mergedPontuacao = $e['pontuacao'];
                } else {
                    // NORMAL SYNC: merge using MAX to preserve best values across PCs
                    $mergedMotoristas = max((int)$existing['motoristas'], $e['motoristas']);
                    $mergedViagens = max((int)$existing['viagens'], $e['viagens']);
                    $mergedKm = max((int)$existing['km'], $e['km']);
                    $mergedPontuacao = max((int)$existing['pontuacao'], $e['pontuacao']);
                }
                $stmtUpdateEmp->execute([
                    $logoFinal,
                    $bannerFinal,
                    $mergedMotoristas,
                    $mergedViagens,
                    $mergedKm,
                    $mergedPontuacao,
                    $e['nome_canon']
                ]);
            } else {
                $stmtInsertEmp->execute([
                    $e['nome_canon'],
                    $logoFinal,
                    $bannerFinal,
                    $e['descricao'],
                    $e['motoristas'],
                    $e['viagens'],
                    $e['km'],
                    $e['pontuacao'],
                    $pcId !== '' ? $pcId : null
                ]);
            }
            $nomesInseridos[] = $e['nome_canon'];
        }

        // ========== MERGE INTELIGENTE DE MOTORISTAS ==========
        // Em vez de INSERT OR REPLACE, usamos INSERT OR IGNORE + UPDATE para
        // merge dos campos numericos (viagens, km, pontuacao, cs_gold).
        $stmtCheckMot = $db->prepare('SELECT viagens, km, pontuacao, cs_gold, plano FROM ranking_motoristas WHERE nome = ? AND empresa = ?');
        $stmtInsertMot = $db->prepare('INSERT OR IGNORE INTO ranking_motoristas (nome, empresa, foto, viagens, km, pontuacao, cs_gold, plano, pc_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmtUpdateMot = $db->prepare('UPDATE ranking_motoristas SET foto = ?, viagens = ?, km = ?, pontuacao = ?, cs_gold = ?, plano = ? WHERE nome = ? AND empresa = ?');

        foreach ($validMotoristas as $m) {
            $stmtCheckMot->execute([$m['nome'], $m['empresa']]);
            $existingMot = $stmtCheckMot->fetch();
            if ($existingMot) {
                if ($isFirstSyncAfterReset) {
                    // FIRST SYNC AFTER RESET: use incoming values directly (REPLACE)
                    $mergedViagensMot = $m['viagens'];
                    $mergedKmMot = $m['km'];
                    $mergedPtsMot = $m['pontuacao'];
                    $mergedGold = $m['cs_gold'];
                    $mergedPlano = $m['plano'];
                } else {
                    // NORMAL SYNC: merge using MAX to preserve best values across PCs
                    $mergedViagensMot = max((int)$existingMot['viagens'], $m['viagens']);
                    $mergedKmMot = max((int)$existingMot['km'], $m['km']);
                    $mergedPtsMot = max((int)$existingMot['pontuacao'], $m['pontuacao']);
                    // Para cs_gold: MAX (evitar crescimento infinito)
                    $mergedGold = max((int)$existingMot['cs_gold'], $m['cs_gold']);
                    // Para plano: pegar o mais alto (vip > gold > bronze)
                    $planoRank = ['bronze' => 0, 'gold' => 1, 'vip' => 2];
                    $existingPlanoRank = $planoRank[$existingMot['plano'] ?? 'bronze'] ?? 0;
                    $newPlanoRank = $planoRank[$m['plano'] ?? 'bronze'] ?? 0;
                    $mergedPlano = $newPlanoRank > $existingPlanoRank ? $m['plano'] : ($existingMot['plano'] ?? 'bronze');
                }
                // Foto: usar a remota se existir, senao manter a local
                $fotoFinal = ($m['foto'] && $m['foto'] !== '') ? $m['foto'] : '';
                $stmtUpdateMot->execute([
                    $fotoFinal,
                    $mergedViagensMot,
                    $mergedKmMot,
                    $mergedPtsMot,
                    $mergedGold,
                    $mergedPlano,
                    $m['nome'],
                    $m['empresa']
                ]);
            } else {
                $stmtInsertMot->execute([
                    $m['nome'],
                    $m['empresa'],
                    $m['foto'],
                    $m['viagens'],
                    $m['km'],
                    $m['pontuacao'],
                    $m['cs_gold'],
                    $m['plano'],
                    $pcId !== '' ? $pcId : null
                ]);
            }
        }

        // Dedup: remove Lobo Solitário entries when motorista has a real company
        try {
            $db->exec("DELETE FROM ranking_motoristas WHERE (empresa = 'Lobo Solitário' OR empresa = 'Lobo Solitario') AND nome IN (SELECT nome FROM ranking_motoristas WHERE empresa != 'Lobo Solitário' AND empresa != 'Lobo Solitario')");
        } catch (\Throwable $e) {}

        // ========== VIAGENS INDIVIDUAIS ==========
        // Hash inclui pontuacao para evitar conflitos de deduplicacao

        $viagensRecebidas = $input['viagens'] ?? [];
        $viagensInseridas = 0;
        if (!empty($viagensRecebidas)) {
            $stmtVia = $db->prepare('INSERT OR IGNORE INTO ranking_viagens (motorista, empresa, data, origem, destino, km, pontuacao, hash, pc_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($viagensRecebidas as $v) {
                $mot = trim($v['motorista'] ?? '');
                $data = $v['data'] ?? '';
                $km = (float)($v['km'] ?? 0);
                $origem = trim($v['origem'] ?? '');
                $destino = trim($v['destino'] ?? '');
                $pontuacao = (int)($v['pontuacao'] ?? 0);
                if ($mot === '' || $data === '') continue;
                $empCanon = canonicalEmpresa(trim($v['empresa'] ?? 'Lobo Solitario'));
                $motCanon = canonicalMotorista($mot, $empCanon !== '' ? $empCanon : 'Lobo Solitario');
                // Hash inclui pontuacao para deduplicacao correta
                $hash = md5($motCanon . '|' . $data . '|' . $km . '|' . $origem . '|' . $destino . '|' . $pontuacao);
                $stmtVia->execute([
                    $motCanon,
                    $empCanon,
                    $data,
                    $origem,
                    $destino,
                    $km,
                    $pontuacao,
                    $hash,
                    $pcId !== '' ? $pcId : null
                ]);
                if ($stmtVia->rowCount() > 0) $viagensInseridas++;
            }
        }

        // Stats gerais: contar motoristas UNICOS (por nome+empresa normalizado)
        $totalEmpresas = $db->query("SELECT COUNT(*) FROM ranking_empresas")->fetchColumn();
        $totalMotoristas = $db->query("SELECT COUNT(DISTINCT nome || '|' || empresa) FROM ranking_motoristas")->fetchColumn();
        $totalViagens = $db->query("SELECT COUNT(*) FROM ranking_viagens")->fetchColumn();
        $totalKm = $db->query("SELECT COALESCE(SUM(km), 0) FROM ranking_viagens")->fetchColumn();
        $stmtStats = $db->prepare('INSERT OR REPLACE INTO stats_gerais (id, total_empresas, total_motoristas, total_viagens, total_km) VALUES (1, ?, ?, ?, ?)');
        $stmtStats->execute([$totalEmpresas, $totalMotoristas, $totalViagens, $totalKm]);

        // ========== PROCESSAR IMAGENS EMBUTIDAS ==========

        $imagensAtualizadas = [];
        $uploadDir = __DIR__ . '/../uploads';
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0755, true);
        }
        $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
            . "://" . preg_replace('/[^a-zA-Z0-9\.\:\-]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost');

        foreach ($validEmpresas as $e) {
            foreach (['logo', 'banner'] as $tipo) {
                $dataKey = $tipo . '_data';
                if (!empty($e[$dataKey])) {
                    $dataUri = $e[$dataKey];
                    if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $dataUri, $matches)) {
                        $ext = strtolower($matches[1]);
                        if (in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'])) {
                            $imageData = base64_decode($matches[2], true);
                            if ($imageData !== false && strlen($imageData) <= 5 * 1024 * 1024) {
                                // Validate actual image content
                                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                                $mimeType = finfo_buffer($finfo, $imageData);
                                finfo_close($finfo);
                                $allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];
                                if (!in_array($mimeType, $allowedMimes)) continue;
                                // Use pc_id in filename to avoid overwriting other PCs' images
                                $sanitized = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $e['nome_canon']);
                                $pcSuffix = $pcId !== '' ? '_' . preg_replace('/[^a-zA-Z0-9]/', '', $pcId) : '';
                                $filename = "{$sanitized}{$pcSuffix}_{$tipo}.{$ext}";
                                $filepath = "{$uploadDir}/{$filename}";
                                file_put_contents($filepath, $imageData);
                                $url = rtrim($baseUrl, '/') . "/uploads/{$filename}";
                                $allowedCols = ['logo', 'banner'];
                                if (in_array($tipo, $allowedCols)) {
                                    $db->prepare("UPDATE ranking_empresas SET {$tipo} = ? WHERE nome = ?")->execute([$url, $e['nome_canon']]);
                                }
                                $imagensAtualizadas[] = [
                                    'nome' => $e['nome_canon'],
                                    'tipo' => $tipo,
                                    'url' => $url
                                ];
                            }
                        }
                    }
                }
            }
        }

        $db->exec('COMMIT');

        // ========== VAGAS SYNC ==========
        $vagasRecebidas = $input['vagas'] ?? [];
        $vagasInseridas = 0;
        if (!empty($vagasRecebidas) && $pcId !== '') {
            try {
                $stmtVaga = $db->prepare('INSERT OR REPLACE INTO vagas_sync (empresa, titulo, descricao, categoria, qtd_vagas, status, pc_id, remote_id, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($vagasRecebidas as $v) {
                    $empresa = canonicalEmpresa(trim($v['empresa'] ?? ''));
                    $titulo = trim($v['titulo'] ?? '');
                    if ($empresa === '' || $titulo === '') continue;
                    $stmtVaga->execute([
                        $empresa, $titulo,
                        $v['descricao'] ?? '',
                        $v['categoria'] ?? 'geral',
                        (int)($v['qtd_vagas'] ?? 1),
                        $v['status'] ?? 'aberta',
                        $pcId,
                        (int)($v['id'] ?? 0),
                        $v['criada_em'] ?? date('c')
                    ]);
                    if ($stmtVaga->rowCount() > 0) $vagasInseridas++;
                }
            } catch (\Throwable $e) {}
        }

        // ========== CANDIDATURAS SYNC ==========
        $candsRecebidas = $input['candidaturas'] ?? [];
        $candsInseridas = 0;
        if (!empty($candsRecebidas) && $pcId !== '') {
            try {
                $stmtCand = $db->prepare('INSERT OR REPLACE INTO candidaturas_sync (vaga_remote_id, vaga_titulo, vaga_empresa, motorista, motorista_empresa, mensagem, status, pc_id, remote_id, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($candsRecebidas as $c) {
                    $mot = trim($c['motorista'] ?? '');
                    if ($mot === '') continue;
                    $vagaEmp = canonicalEmpresa($c['vaga_empresa'] ?? '');
                    $motEmp = canonicalEmpresa($c['motorista_empresa'] ?? 'Lobo Solitario');
                    $motCanon = canonicalMotorista($mot, $motEmp !== '' ? $motEmp : 'Lobo Solitario');
                    $stmtCand->execute([
                        (int)($c['vaga_id'] ?? 0),
                        $c['vaga_titulo'] ?? '',
                        $vagaEmp,
                        $motCanon,
                        $motEmp,
                        $c['mensagem'] ?? '',
                        $c['status'] ?? 'pendente',
                        $pcId,
                        (int)($c['id'] ?? 0),
                        $c['criada_em'] ?? date('c')
                    ]);
                    if ($stmtCand->rowCount() > 0) $candsInseridas++;
                }
            } catch (\Throwable $e) {}
        }

        // ========== SOLICITACOES/CONVITES SYNC ==========
        $solRecebidas = $input['solicitacoes'] ?? [];
        $solsInseridas = 0;
        if (!empty($solRecebidas) && $pcId !== '') {
            try {
                $stmtSol = $db->prepare('INSERT OR REPLACE INTO solicitacoes_sync (motorista, empresa, status, mensagem, tipo, vaga_id, pc_id, remote_id, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($solRecebidas as $s) {
                    $mot = trim($s['motorista'] ?? '');
                    $emp = canonicalEmpresa(trim($s['empresa'] ?? ''));
                    if ($mot === '' || $emp === '') continue;
                    $motCanon = canonicalMotorista($mot, $emp);
                    $stmtSol->execute([
                        $motCanon, $emp,
                        $s['status'] ?? 'pendente',
                        $s['mensagem'] ?? '',
                        $s['tipo'] ?? 'pedido',
                        (int)($s['vaga_id'] ?? 0),
                        $pcId,
                        (int)($s['id'] ?? 0),
                        $s['criada_em'] ?? date('c')
                    ]);
                    if ($stmtSol->rowCount() > 0) $solsInseridas++;
                }
            } catch (\Throwable $e) {}
        }

        // Update dispositivo entry
        if ($pcId !== '') {
            $stmtUpsert = $db->prepare('INSERT OR REPLACE INTO dispositivos (pc_id, nome, ultimo_sync, versao_app, reset_token, data_version, ativo) VALUES (?, ?, datetime(\'now\'), ?, ?, ?, 1)');
            $stmtUpsert->execute([$pcId, $pcNome, $pcVersao, $serverToken, $dataVersion]);
        }

        // Store max data_version seen across all PCs
        if ($dataVersion > 0) {
            $stmtVer = $db->prepare("SELECT valor FROM server_config WHERE chave = 'max_data_version'");
            $stmtVer->execute();
            $existingVer = (int)($stmtVer->fetchColumn() ?: 0);
            if ($dataVersion > $existingVer) {
                $db->prepare("INSERT OR REPLACE INTO server_config (chave, valor) VALUES ('max_data_version', ?)")->execute([(string)$dataVersion]);
            }
        }

        echo json_encode([
            'ok' => true,
            'empresas' => count($validEmpresas),
            'motoristas' => count($validMotoristas),
            'vagas' => $vagasInseridas,
            'candidaturas' => $candsInseridas,
            'solicitacoes' => $solsInseridas,
            'imagens' => $imagensAtualizadas,
            'warnings' => $warnings,
            'reset_token' => $serverToken,
            'sync_generation' => $serverGeneration,
            'data_version' => $dataVersion,
            'first_sync_after_reset' => $isFirstSyncAfterReset,
            'timestamp' => date('c')
        ]);
    } catch (\Throwable $e) {
        $db->exec('ROLLBACK');
        http_response_code(500);
        echo json_encode([
            'error' => 'Erro durante sync: ' . $e->getMessage()
        ]);
    }

} catch (\Throwable $e) {
    http_response_code(500);
    error_log('[CARGOSTATS] sync: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno do servidor']);
}
?>
