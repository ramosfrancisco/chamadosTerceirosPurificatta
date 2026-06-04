const cron = require('node-cron');
const db = require('./db');
const { rodarFechamento } = require('./email');

function iniciarCron() {
  // Runs every day at 08:00
  cron.schedule('0 8 * * *', async () => {
    try {
      const { rows } = await db.query('SELECT * FROM configuracoes WHERE id = 1');
      const config = rows[0];
      if (!config || !config.envio_ativo || !config.fechamento_dia) return;

      const hoje = new Date();
      const diaHoje = hoje.getDate();
      if (diaHoje !== config.fechamento_dia) return;

      // Close previous month
      const mes = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
      const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();

      console.log(`[Cron] Dia de fechamento! Disparando relatórios para ${mes}/${ano}`);
      await rodarFechamento(mes, ano);
    } catch (err) {
      console.error('[Cron] Erro no fechamento automático:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[Cron] Agendador de fechamento iniciado (verifica diariamente às 08:00 BRT)');
}

module.exports = { iniciarCron };
