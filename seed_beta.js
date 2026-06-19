const bcrypt = require('bcryptjs');
const { initDB, getDB, criarUsuario, criarEmpresa, criarMotorista } = require('./database');

function seed() {
    console.log('=== CARGO STATS - BETA SEED ===');
    console.log('Inicializando banco de dados para testes beta...\n');

    initDB();
    const db = getDB();

    // --- Admin padrão ---
    const adminEmail = 'admin@cargostats.com';
    const adminSenha = 'admin123';
    const adminExiste = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(adminEmail);

    if (!adminExiste) {
        const hash = bcrypt.hashSync(adminSenha, 10);
        db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo) VALUES (?, ?, ?, ?)`).run(adminEmail, hash, 'Administrador', 'admin');
        console.log('[OK] Admin criado:');
    } else {
        console.log('[OK] Admin ja existe:');
    }
    console.log(`     Email: ${adminEmail}`);
    console.log(`     Senha: ${adminSenha}\n`);

    // --- Verificar se há dados existentes ---
    const empresaCount = db.prepare(`SELECT COUNT(*) as c FROM empresas`).get().c;
    const motoristaCount = db.prepare(`SELECT COUNT(*) as c FROM motoristas`).get().c;
    const viagemCount = db.prepare(`SELECT COUNT(*) as c FROM viagens`).get().c;

    console.log('=== STATUS ATUAL DO BANCO ===');
    console.log(`  Empresas:    ${empresaCount}`);
    console.log(`  Motoristas:  ${motoristaCount}`);
    console.log(`  Viagens:     ${viagemCount}\n`);

    if (empresaCount === 0 && motoristaCount === 0) {
        console.log('Banco vazio. Os usuarios criarao suas proprias empresas');
        console.log('ao se cadastrarem no app.\n');
    }

    console.log('=== INSTRUCOES PARA O BETA ===');
    console.log('1. Acesse: http://localhost:3000/');
    console.log('2. Crie sua conta em /app (Login → Cadastrar)');
    console.log('3. Crie sua empresa na pagina Meu Perfil');
    console.log('4. Convide motoristas para sua empresa');
    console.log('5. Registre viagens manualmente ou via auto-record\n');

    console.log('Banco inicializado com sucesso!');
}

seed();
