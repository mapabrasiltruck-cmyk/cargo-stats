<?php
// ============================================================
// CONFIGURACAO - Hostinger Premium
// Edite estas variaveis com seus dados reais
// ============================================================

define('DB_HOST',     'localhost');
define('DB_NAME',     'u734960555_cargo');  // Nome do banco no hPanel
define('DB_USER',     'u734960555_cargo');  // Usuario do banco no hPanel
define('DB_PASS',     'bS3xJFPY#0u');         // Senha do banco no hPanel
define('SYNC_SECRET', 'cargostats_luiz');    // Mesma chave configurada no app

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Erro ao conectar no banco: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

function initDB() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS ranking_empresas (
        nome VARCHAR(255) PRIMARY KEY,
        logo TEXT DEFAULT '',
        descricao TEXT DEFAULT '',
        motoristas INT DEFAULT 0,
        viagens INT DEFAULT 0,
        km INT DEFAULT 0,
        pontuacao INT DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS ranking_motoristas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        empresa VARCHAR(255) NOT NULL,
        viagens INT DEFAULT 0,
        km INT DEFAULT 0,
        pontuacao INT DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_motorista (nome, empresa)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS stats_gerais (
        id INT PRIMARY KEY DEFAULT 1,
        total_empresas INT DEFAULT 0,
        total_motoristas INT DEFAULT 0,
        total_viagens INT DEFAULT 0,
        total_km INT DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS sync_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        registros_empresas INT DEFAULT 0,
        registros_motoristas INT DEFAULT 0,
        ip_origem VARCHAR(45) DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// Tables devem ser criadas manualmente via phpMyAdmin
// Execute o arquivo create_tables.sql no phpMyAdmin
// initDB();
?>
