const bcrypt = require('bcryptjs');
const { initDB, getDB } = require('./database');

function seed() {
    console.log('Inicializando banco de dados...');
    initDB();
    const db = getDB();

    const adminEmail = 'admin@cargostats.com';
    const adminSenha = 'admin123';
    const adminExiste = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(adminEmail);

    if (!adminExiste) {
        const hash = bcrypt.hashSync(adminSenha, 10);
        db.prepare(`INSERT INTO usuarios (email, senha_hash, nome, tipo) VALUES (?, ?, ?, ?)`).run(adminEmail, hash, 'Administrador', 'admin');
        console.log(`Admin criado: ${adminEmail} / ${adminSenha}`);
    } else {
        console.log(`Admin ja existe: ${adminEmail}`);
    }

    console.log('Banco inicializado com sucesso!');
    console.log('Acesse o painel admin com: admin@cargostats.com / admin123');
}

seed();
