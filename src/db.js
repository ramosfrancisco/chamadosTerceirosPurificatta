const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(() => {
  console.log('Banco de dados conectado com sucesso');
}).catch(err => {
  console.error('Erro ao conectar ao banco:', err.message);
});

module.exports = {
  query: async (text, params) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 2000) console.warn('Query lenta:', duration + 'ms', text.substring(0, 60));
      return res;
    } catch (err) {
      console.error('Query error:', err.message, '| SQL:', text.substring(0, 80));
      throw err;
    }
  },
  pool,
};
