// Creates / migrates the database and seeds configuration defaults (no sample operational data).
const db = require('../backend/database/db');
const { seed } = require('../backend/database/seed');
const config = require('../backend/config');
db.open();
seed();
console.log(`Database ready at ${config.DB_PATH}`);
db.close();
