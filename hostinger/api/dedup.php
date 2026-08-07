<?php
// ============================================================
// DEDUP - Mescla duplicatas de EMPRESAS e MOTORISTAS
// Criadas por variacao de caixa/espaco/acento (ex.: "KM" vs "Km",
// "JDias Trucks" vs "jdias-trucks") apos formatar PC + re-sync.
//
// USO: acesse uma vez no navegador (GET):
//   https://SEU-DOMAIN/cargo/api/dedup.php?secret=SUA_CHAVE
// Ele retorna JSON com o relatorio e NAO precisa rodar de novo.
// Recomendado: tambem manter o sync.php atualizado (canonicalizacao)
// para evitar que novas duplicatas sejam criadas.
// ============================================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

error_reporting(E_ALL);
ini_set('display_errors', 0);

try {
    require_once __DIR__ . '/config.php';

    $secret = $_GET['secret'] ?? ($_POST['secret'] ?? '');
    if ($secret !== SYNC_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Chave secreta invalida']);
        exit;
    }

    $db = getDB();
    $report = ['empresas' => [], 'motoristas' => []];

    $db->exec('BEGIN TRANSACTION');

    // ========== EMPRESAS ==========
    $rows = $db->query("SELECT nome, logo, banner, descricao, motoristas, viagens, km, pontuacao, pc_id FROM ranking_empresas")->fetchAll();

    // Agrupar por chave normalizada
    $groups = [];
    foreach ($rows as $r) {
        $k = normalize_key($r['nome']);
        if ($k === '') continue;
        $groups[$k][] = $r;
    }

    foreach ($groups as $k => $group) {
        if (count($group) < 2) continue;

        // Escolher canonica: mais dados primeiro, depois nome mais curto
        usort($group, function ($a, $b) {
            $sa = $a['motoristas'] * 10 + $a['viagens'];
            $sb = $b['motoristas'] * 10 + $b['viagens'];
            if ($sa !== $sb) return $sb - $sa;
            return strlen($a['nome']) - strlen($b['nome']);
        });
        $canonical = $group[0]['nome'];

        foreach ($group as $i => $m) {
            if ($i === 0) continue; // canonica
            $other = $m['nome'];

            // Consolidar contadores na canonica
            $db->prepare("UPDATE ranking_empresas SET motoristas = motoristas + ?, viagens = viagens + ?, km = km + ?, pontuacao = pontuacao + ? WHERE nome = ?")
                ->execute([(int)$m['motoristas'], (int)$m['viagens'], (int)$m['km'], (int)$m['pontuacao'], $canonical]);

            // Reapontar referencias
            $db->prepare("UPDATE ranking_motoristas SET empresa = ? WHERE empresa = ?")->execute([$canonical, $other]);
            $db->prepare("UPDATE ranking_viagens SET empresa = ? WHERE empresa = ?")->execute([$canonical, $other]);
            try { $db->prepare("UPDATE solicitacoes_sync SET empresa = ? WHERE empresa = ?")->execute([$canonical, $other]); } catch (\Throwable $e) {}
            try { $db->prepare("UPDATE candidaturas_sync SET vaga_empresa = ? WHERE vaga_empresa = ?")->execute([$canonical, $other]); } catch (\Throwable $e) {}
            try { $db->prepare("UPDATE candidaturas_sync SET motorista_empresa = ? WHERE motorista_empresa = ?")->execute([$canonical, $other]); } catch (\Throwable $e) {}
            try {
                // vagas_sync tem UNIQUE(empresa, titulo, pc_id) - mescla evitando colisao
                foreach ($db->query("SELECT * FROM vagas_sync WHERE empresa = " . $db->quote($other)) as $v) {
                    $dup = $db->prepare("SELECT COUNT(*) FROM vagas_sync WHERE empresa = ? AND titulo = ? AND pc_id = ?")->execute([$canonical, $v['titulo'], $v['pc_id']]);
                    $exists = $db->query("SELECT COUNT(*) c FROM vagas_sync WHERE empresa = " . $db->quote($canonical) . " AND titulo = " . $db->quote($v['titulo']) . " AND pc_id = " . $db->quote($v['pc_id']))->fetch();
                    if ($exists && $exists['c'] > 0) {
                        $db->prepare("DELETE FROM vagas_sync WHERE id = ?")->execute([$v['id']]);
                    } else {
                        $db->prepare("UPDATE vagas_sync SET empresa = ? WHERE id = ?")->execute([$canonical, $v['id']]);
                    }
                }
            } catch (\Throwable $e) {}

            // Apagar a linha duplicada canonica da empresa
            $db->prepare("DELETE FROM ranking_empresas WHERE nome = ?")->execute([$other]);
            $report['empresas'][] = $other . ' => ' . $canonical;
        }
    }

    // ========== MOTORISTAS (duplicados por nome, mesma empresa) ==========
    $mots = $db->query("SELECT id, nome, empresa, viagens, km, pontuacao, foto, pc_id FROM ranking_motoristas")->fetchAll();
    $motGroups = [];
    foreach ($mots as $m) {
        if (trim((string)$m['nome']) === '') continue;
        $k = normalize_key($m['nome']) . '|' . normalize_key($m['empresa']);
        $motGroups[$k][] = $m;
    }

    foreach ($motGroups as $k => $members) {
        if (count($members) < 2) continue;
        usort($members, function ($a, $b) {
            return ((int)$b['viagens'] + (int)$b['km']) - ((int)$a['viagens'] + (int)$a['km']);
        });
        $canon = $members[0]['nome'];

        // dado um nome duplicado dentro da MESMA empresa, superior all references
        foreach ($members as $i => $m) {
            if ($i === 0) continue;
            $db->prepare("UPDATE ranking_viagens SET motorista = ? WHERE motorista = ? AND empresa = ?")->execute([$canon, $m['nome'], $m['empresa']]);
            try { $db->prepare("UPDATE solicitacoes_sync SET motorista = ? WHERE motorista = ? AND empresa = ?")->execute([$canon, $m['nome'], $m['empresa']]); } catch (\Throwable $e) {}
            try { $db->prepare("UPDATE candidaturas_sync SET motorista = ? WHERE motorista = ? AND motorista_empresa = ?")->execute([$canon, $m['nome'], $m['empresa']]); } catch (\Throwable $e) {}
            $db->prepare("DELETE FROM ranking_motoristas WHERE id = ?")->execute([$m['id']]);
            $report['motoristas'][] = $m['nome'] . ' => ' . $canon;
        }
    }

    // ========== MOTORISTAS sem empresa (Lobo) normalizados ==========
    // Remove duplicata de nome anexuada a 'Lobo' vs 'Lobo' — opcional, mantido simples.

    $db->exec('COMMIT');

    // Recalcular stats_gerais
    $totalEmpresas = $db->query("SELECT COUNT(*) FROM ranking_empresas")->fetchColumn();
    $totalMotoristas = $db->query("SELECT COUNT(*) FROM ranking_motoristas")->fetchColumn();
    $totalViagens = $db->query("SELECT COALESCE(SUM(viagens), 0) FROM ranking_motoristas")->fetchColumn();
    $totalKm = $db->query("SELECT COALESCE(SUM(km), 0) FROM ranking_motoristas")->fetchColumn();
    $db->prepare("INSERT OR REPLACE INTO stats_gerais (id, total_empresas, total_motoristas, total_viagens, total_km) VALUES (1, ?, ?, ?, ?)")
        ->execute([$totalEmpresas, $totalMotoristas, $totalViagens, $totalKm]);

    echo json_encode([
        'ok' => true,
        'message' => 'Deduplicacao concluida.',
        'de_empresas' => count($report['empresas']),
        'de_motoristas' => count($report['motoristas']),
        'empresas' => $report['empresas'],
        'motoristas' => $report['motoristas'],
        'stats' => ['empresas' => $totalEmpresas, 'motoristas' => $totalMotoristas, 'viagens' => $totalViagens, 'km' => $totalKm],
        'timestamp' => date('c')
    ]);

} catch (\Throwable $e) {
    if (isset($db)) { try { $db->exec('ROLLBACK'); } catch (\Throwable $x) {} }
    http_response_code(500);
    error_log('[CARGOSTATS] dedup: ' . $e->getMessage());
    echo json_encode(['error' => 'Erro interno: ' . $e->getMessage()]);
}
?>