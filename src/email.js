const nodemailer = require('nodemailer');
const db = require('./db');

async function getConfig() {
  const { rows } = await db.query('SELECT * FROM configuracoes WHERE id = 1');
  return rows[0] || {};
}

function buildTransporter(config) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail_usuario,
      pass: config.gmail_senha_app,
    },
  });
}

function buildEmailHTML(prestador, chamados, totais, periodo) {
  const fmt = (v) => 'R$ ' + (+v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rows = chamados.map((c, i) => {
    const df = c.data_chamado ? new Date(c.data_chamado).toLocaleDateString('pt-BR') : '—';
    const th = c.tempo_horas ? Number(c.tempo_horas).toFixed(2) + 'h' : '—';
    const tot = (c.km_ida_volta * prestador.valor_km) + (c.tempo_horas * prestador.valor_hora) + (+c.estacionamento) + (+c.pecas);
    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fbff'}">
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8">${df}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8">${c.numero_chamado || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8">${c.cliente || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8;text-align:center">${c.km_ida_volta || 0} km</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8">${c.descricao || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8;text-align:center">${th}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #edf2f8;text-align:right;font-family:monospace">${fmt(tot)}</td>
      </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)">
    <div style="background:#1F497D;padding:28px 32px">
      <h1 style="color:#fff;font-size:20px;margin:0 0 4px 0">Purificatta</h1>
      <p style="color:rgba(255,255,255,.7);font-size:13px;margin:0">Relatório de Manutenções — ${periodo}</p>
    </div>
    <div style="padding:28px 32px">
      <h2 style="font-size:16px;color:#1a2e45;margin:0 0 6px 0">Olá, ${prestador.nome}!</h2>
      <p style="font-size:14px;color:#5a7a9a;margin:0 0 24px 0">
        Segue o relatório de chamados referente ao período de <strong>${periodo}</strong>.
      </p>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        ${[
          ['Chamados', chamados.length],
          ['Total KM', fmt(totais.km)],
          ['Total Serviços', fmt(totais.servico)],
          ['Total Geral', fmt(totais.geral)],
        ].map(([l, v]) => `
          <div style="background:#f0f4f9;border-radius:8px;padding:14px;text-align:center">
            <div style="font-size:10px;color:#5a7a9a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${l}</div>
            <div style="font-family:monospace;font-size:15px;font-weight:600;color:#1F497D">${v}</div>
          </div>`).join('')}
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
        <thead>
          <tr style="background:#1F497D">
            <th style="color:#fff;padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:600">Data</th>
            <th style="color:#fff;padding:9px 10px;font-size:11px;text-transform:uppercase;font-weight:600">Chamado</th>
            <th style="color:#fff;padding:9px 10px;font-size:11px;text-transform:uppercase;font-weight:600">Cliente</th>
            <th style="color:#fff;padding:9px 10px;font-size:11px;text-transform:uppercase;font-weight:600">KM</th>
            <th style="color:#fff;padding:9px 10px;font-size:11px;text-transform:uppercase;font-weight:600">Descrição</th>
            <th style="color:#fff;padding:9px 10px;font-size:11px;text-transform:uppercase;font-weight:600">Tempo</th>
            <th style="color:#fff;padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;font-weight:600">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#DCE6F1">
            <td colspan="6" style="padding:9px 10px;font-weight:700;color:#1F497D;font-size:13px">TOTAL GERAL</td>
            <td style="padding:9px 10px;text-align:right;font-family:monospace;font-weight:700;color:#1a7a4a;font-size:14px">${fmt(totais.geral)}</td>
          </tr>
        </tfoot>
      </table>

      <p style="font-size:12px;color:#8aa0b8;border-top:1px solid #edf2f8;padding-top:16px;margin:0">
        Este e-mail foi gerado automaticamente pelo sistema Purificatta.<br>
        Em caso de dúvidas, entre em contato com a Purificatta.
      </p>
    </div>
    <div style="background:#1F497D;padding:16px 32px;text-align:center">
      <p style="color:rgba(255,255,255,.5);font-size:11px;margin:0">
        Purificatta Ind. Com. e Serviços de Purificação de Água Ltda. • CNPJ: 13.769.335/0001-10
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function enviarRelatorio(prestador, chamados, mes, ano) {
  const config = await getConfig();
  if (!config.gmail_usuario || !config.gmail_senha_app || !config.email_principal) {
    throw new Error('Configurações de e-mail incompletas');
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const periodo = `${meses[mes - 1]} ${ano}`;

  // Calculate totals
  const totais = { km: 0, servico: 0, extra: 0, geral: 0 };
  chamados.forEach(c => {
    totais.km += c.km_ida_volta * prestador.valor_km;
    totais.servico += c.tempo_horas * prestador.valor_hora;
    totais.extra += (+c.estacionamento) + (+c.pecas);
    totais.geral += (c.km_ida_volta * prestador.valor_km) + (c.tempo_horas * prestador.valor_hora) + (+c.estacionamento) + (+c.pecas);
  });

  const transporter = buildTransporter(config);
  const html = buildEmailHTML(prestador, chamados, totais, periodo);

  const mailOpts = {
    from: `"Purificatta" <${config.gmail_usuario}>`,
    to: config.email_principal,
    cc: config.emails_cc && config.emails_cc.length ? config.emails_cc.join(',') : undefined,
    subject: `Relatório Manutenções Prestador ${prestador.nome}`,
    html,
  };

  await transporter.sendMail(mailOpts);

  // Log success
  await db.query(`
    INSERT INTO log_emails (prestador_id, prestador_nome, destinatario, cc, assunto, status, periodo_mes, periodo_ano)
    VALUES ($1,$2,$3,$4,$5,'enviado',$6,$7)
  `, [prestador.id, prestador.nome, config.email_principal, config.emails_cc || [], mailOpts.subject, mes, ano]);
}

async function rodarFechamento(mes, ano) {
  console.log(`[Fechamento] Iniciando para ${mes}/${ano}`);
  // Get all active prestadores
  const { rows: prestadores } = await db.query('SELECT * FROM prestadores WHERE ativo = TRUE');

  for (const prest of prestadores) {
    try {
      // Get chamados for the period
      const { rows: chamados } = await db.query(
        `SELECT * FROM chamados WHERE prestador_id = $1
         AND EXTRACT(MONTH FROM data_chamado) = $2
         AND EXTRACT(YEAR FROM data_chamado) = $3
         ORDER BY data_chamado ASC`,
        [prest.id, mes, ano]
      );

      if (chamados.length === 0) {
        console.log(`[Fechamento] Sem chamados para ${prest.nome}, pulando.`);
        continue;
      }

      // Mark as closed
      await db.query(
        `UPDATE chamados SET periodo_fechado = TRUE
         WHERE prestador_id = $1
         AND EXTRACT(MONTH FROM data_chamado) = $2
         AND EXTRACT(YEAR FROM data_chamado) = $3`,
        [prest.id, mes, ano]
      );

      // Send email
      await enviarRelatorio(prest, chamados, mes, ano);
      console.log(`[Fechamento] E-mail enviado para prestador: ${prest.nome}`);
    } catch (err) {
      console.error(`[Fechamento] Erro ao processar ${prest.nome}:`, err.message);
      await db.query(`
        INSERT INTO log_emails (prestador_id, prestador_nome, assunto, status, erro_msg, periodo_mes, periodo_ano)
        VALUES ($1,$2,$3,'erro',$4,$5,$6)
      `, [prest.id, prest.nome, `Relatório Manutenções Prestador ${prest.nome}`, err.message, mes, ano]);
    }
  }
  console.log(`[Fechamento] Concluído para ${mes}/${ano}`);
}

module.exports = { enviarRelatorio, rodarFechamento, getConfig };
