const db = require('./database');

// Disable foreign keys and clean
db.getDB().pragma('foreign_keys = OFF');

// Delete from all referencing tables first
db.getDB().prepare("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE 'tester%')").run();
const removedMot = db.getDB().prepare("DELETE FROM motoristas WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE 'tester%')").run();
const removed = db.getDB().prepare("DELETE FROM usuarios WHERE email LIKE 'tester%'").run();

db.getDB().pragma('foreign_keys = ON');

console.log('Removidos:', removedMot.changes, 'motoristas,', removed.changes, 'usuarios');

const users = db.getDB().prepare('SELECT id, nome, email, empresa, tipo, steam_id FROM usuarios').all();
console.log('Usuarios restantes:', JSON.stringify(users, null, 2));

process.exit(0);
