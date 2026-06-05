require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('./db');
const { authAdmin, authAny, authPrestador } = require('./middleware');
const { rodarFechamento, enviarRelatorio, getConfig } = require('./email');
const { iniciarCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Ensure uploads dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  cb(null, file.mimetype === 'application/pdf');
}});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, '../public')));

// ── AUTH ────────────────────────────────────────────────────

// POST /api/auth/login — unified login (admin or prestador)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Dados incompletos' });

    // Try admin first
    const { rows: admRows } = await db.query('SELECT * FROM admins WHERE email=$1 AND ativo=TRUE', [email.toLowerCase()]);
    if (admRows[0]) {
      const ok = await bcrypt.compare(password, admRows[0].password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
      const token = jwt.sign({ id: admRows[0].id, email: admRows[0].email, nome: admRows[0].nome, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
      return res.json({ token, nome: admRows[0].nome, role: 'admin' });
    }

    // Try prestador
    const { rows: prRows } = await db.query('SELECT * FROM prestadores WHERE login=$1 AND ativo=TRUE', [email.toLowerCase()]);
    if (prRows[0]) {
      const ok = await bcrypt.compare(password, prRows[0].password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
      // Update last access
      await db.query('UPDATE prestadores SET ultimo_acesso=NOW() WHERE id=$1', [prRows[0].id]);
      const token = jwt.sign({ id: prRows[0].id, email: prRows[0].login, nome: prRows[0].nome, role: 'prestador' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
      return res.json({ token, nome: prRows[0].nome, role: 'prestador', prestadorId: prRows[0].id });
    }

    return res.status(401).json({ error: 'Credenciais inválidas' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

// ── ADMINS ───────────────────────────────────────────────────

app.get('/api/admins', authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id,nome,cargo,email,ativo,created_at FROM admins ORDER BY created_at');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admins', authAdmin, async (req, res) => {
  try {
    const { nome, cargo, email, password } = req.body;
    if (!nome || !email || !password) return res.status(400).json({ error: 'Dados incompletos' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO admins (nome,cargo,email,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,nome,cargo,email,ativo,created_at',
      [nome, cargo || null, email.toLowerCase(), hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.code === '23505' ? 'E-mail já cadastrado' : 'Erro interno' }); }
});

app.put('/api/admins/:id', authAdmin, async (req, res) => {
  try {
    const { nome, cargo, email } = req.body;
    const { rows } = await db.query(
      'UPDATE admins SET nome=$1,cargo=$2,email=$3,updated_at=NOW() WHERE id=$4 RETURNING id,nome,cargo,email,ativo,created_at',
      [nome, cargo || null, email.toLowerCase(), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admins/:id/reset-senha', authAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Senha mínima 6 caracteres' });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE admins SET password_hash=$1,updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.patch('/api/admins/:id/status', authAdmin, async (req, res) => {
  try {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'Não é possível desativar a si mesmo' });
    const { ativo } = req.body;
    const { rows } = await db.query('UPDATE admins SET ativo=$1,updated_at=NOW() WHERE id=$2 RETURNING id,ativo', [ativo, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/admins/minha-senha', authAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await db.query('SELECT * FROM admins WHERE id=$1', [req.admin.id]);
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE admins SET password_hash=$1,updated_at=NOW() WHERE id=$2', [hash, req.admin.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── PRESTADORES ──────────────────────────────────────────────

app.get('/api/prestadores', authAny, async (req, res) => {
  try {
    let query, params=[];
    if(req.user.role==='prestador'){
      query=`SELECT p.*,0 AS total_chamados,0 AS total_geral FROM prestadores p WHERE p.id=$1`;
      params=[req.user.id];
    } else {
      query=`SELECT p.*,COUNT(c.id) AS total_chamados,COALESCE(SUM((c.km_ida_volta*p.valor_km)+(c.tempo_horas*p.valor_hora)+c.estacionamento+c.pecas),0) AS total_geral FROM prestadores p LEFT JOIN chamados c ON c.prestador_id=p.id GROUP BY p.id ORDER BY p.nome`;
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/prestadores', authAdmin, upload.fields([{ name: 'doc_contrato', maxCount: 1 }, { name: 'doc_tabela', maxCount: 1 }]), async (req, res) => {
  try {
    const b = req.body;
    if (!b.nome || !b.login || !b.password) return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    const hash = await bcrypt.hash(b.password, 10);
    const files = req.files || {};
    const contrato = files.doc_contrato?.[0];
    const tabela = files.doc_tabela?.[0];
    const { rows } = await db.query(`
      INSERT INTO prestadores (nome,documento,telefone,email,login,password_hash,
        endereco_rua,endereco_numero,endereco_complemento,endereco_bairro,endereco_cidade,endereco_estado,endereco_cep,
        valor_km,valor_hora,valor_hig_a,valor_hig_b,valor_inst,valor_trans,
        doc_contrato_path,doc_contrato_nome,doc_tabela_path,doc_tabela_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [b.nome,b.documento||null,b.telefone||null,b.email||null,b.login.toLowerCase(),hash,
       b.endereco_rua||null,b.endereco_numero||null,b.endereco_complemento||null,b.endereco_bairro||null,b.endereco_cidade||null,b.endereco_estado||null,b.endereco_cep||null,
       b.valor_km||0,b.valor_hora||0,b.valor_hig_a||0,b.valor_hig_b||0,b.valor_inst||0,b.valor_trans||0,
       contrato?.filename||null,contrato?.originalname||null,tabela?.filename||null,tabela?.originalname||null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: err.code === '23505' ? 'Login já em uso' : 'Erro interno' }); }
});

app.put('/api/prestadores/:id', authAdmin, upload.fields([{ name: 'doc_contrato', maxCount: 1 }, { name: 'doc_tabela', maxCount: 1 }]), async (req, res) => {
  try {
    const b = req.body;
    const files = req.files || {};
    const contrato = files.doc_contrato?.[0];
    const tabela = files.doc_tabela?.[0];

    const { rows: ex } = await db.query('SELECT * FROM prestadores WHERE id=$1', [req.params.id]);
    if (!ex[0]) return res.status(404).json({ error: 'Não encontrado' });

    const cPath = contrato ? contrato.filename : ex[0].doc_contrato_path;
    const cNome = contrato ? contrato.originalname : ex[0].doc_contrato_nome;
    const tPath = tabela ? tabela.filename : ex[0].doc_tabela_path;
    const tNome = tabela ? tabela.originalname : ex[0].doc_tabela_nome;

    const { rows } = await db.query(`
      UPDATE prestadores SET
        nome=$1,documento=$2,telefone=$3,email=$4,
        endereco_rua=$5,endereco_numero=$6,endereco_complemento=$7,endereco_bairro=$8,endereco_cidade=$9,endereco_estado=$10,endereco_cep=$11,
        valor_km=$12,valor_hora=$13,valor_hig_a=$14,valor_hig_b=$15,valor_inst=$16,valor_trans=$17,
        doc_contrato_path=$18,doc_contrato_nome=$19,doc_tabela_path=$20,doc_tabela_nome=$21,
        ativo=$22,updated_at=NOW()
      WHERE id=$23 RETURNING *`,
      [b.nome,b.documento||null,b.telefone||null,b.email||null,
       b.endereco_rua||null,b.endereco_numero||null,b.endereco_complemento||null,b.endereco_bairro||null,b.endereco_cidade||null,b.endereco_estado||null,b.endereco_cep||null,
       b.valor_km||0,b.valor_hora||0,b.valor_hig_a||0,b.valor_hig_b||0,b.valor_inst||0,b.valor_trans||0,
       cPath,cNome,tPath,tNome,b.ativo!==false,req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/prestadores/:id/reset-senha', authAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Senha mínima 6 caracteres' });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE prestadores SET password_hash=$1,updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/prestadores/:id', authAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM prestadores WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── CHAMADOS ─────────────────────────────────────────────────

app.get('/api/chamados', authAny, async (req, res) => {
  try {
    const { ano, mes, prestador_id } = req.query;
    let pid = prestador_id;
    if (req.user.role === 'prestador') pid = req.user.id;

    let query = `SELECT c.*, p.nome as prestador_nome,
      ROUND((c.km_ida_volta * p.valor_km)::numeric,2) as total_km,
      ROUND((c.tempo_horas * p.valor_hora)::numeric,2) as total_servico,
      ROUND((c.estacionamento + c.pecas)::numeric,2) as total_extra,
      ROUND((c.km_ida_volta*p.valor_km + c.tempo_horas*p.valor_hora + c.estacionamento + c.pecas)::numeric,2) as total
      FROM chamados c JOIN prestadores p ON p.id=c.prestador_id WHERE 1=1
      -- include prestador nome`;
    const params = [];
    let i = 1;
    if (pid) { query += ` AND c.prestador_id=$${i++}`; params.push(pid); }
    if (ano) { query += ` AND EXTRACT(YEAR FROM c.data_chamado)=$${i++}`; params.push(ano); }
    if (mes) { query += ` AND EXTRACT(MONTH FROM c.data_chamado)=$${i++}`; params.push(mes); }
    query += ' ORDER BY c.data_chamado ASC, c.created_at ASC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/chamados', authAny, async (req, res) => {
  try {
    let pid = req.body.prestador_id;
    if (req.user.role === 'prestador') pid = req.user.id;
    const { data_chamado, numero_chamado, cliente, km_ida_volta, descricao, tempo_horas, estacionamento, pecas } = req.body;
    const { rows } = await db.query(`
      INSERT INTO chamados (prestador_id,data_chamado,numero_chamado,cliente,km_ida_volta,descricao,tempo_horas,estacionamento,pecas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [pid, data_chamado||null, numero_chamado||null, cliente||null, km_ida_volta||0, descricao||null, tempo_horas||0, estacionamento||0, pecas||0]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/chamados/:id', authAny, async (req, res) => {
  try {
    const { data_chamado, numero_chamado, cliente, km_ida_volta, descricao, tempo_horas, estacionamento, pecas } = req.body;
    if (req.user.role === 'prestador') {
      const { rows } = await db.query('SELECT prestador_id,periodo_fechado FROM chamados WHERE id=$1', [req.params.id]);
      if (!rows[0] || rows[0].prestador_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
      if (rows[0].periodo_fechado) return res.status(403).json({ error: 'Período fechado' });
    }
    const { rows } = await db.query(`
      UPDATE chamados SET data_chamado=$1,numero_chamado=$2,cliente=$3,km_ida_volta=$4,
        descricao=$5,tempo_horas=$6,estacionamento=$7,pecas=$8,updated_at=NOW()
      WHERE id=$9 RETURNING *`,
      [data_chamado||null, numero_chamado||null, cliente||null, km_ida_volta||0, descricao||null, tempo_horas||0, estacionamento||0, pecas||0, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/chamados/:id', authAny, async (req, res) => {
  try {
    if (req.user.role === 'prestador') {
      const { rows } = await db.query('SELECT prestador_id,periodo_fechado FROM chamados WHERE id=$1', [req.params.id]);
      if (!rows[0] || rows[0].prestador_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
      if (rows[0].periodo_fechado) return res.status(403).json({ error: 'Período fechado' });
    }
    await db.query('DELETE FROM chamados WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── HISTÓRICO PDF ────────────────────────────────────────────

app.get('/api/historico-pdf', authAny, async (req, res) => {
  try {
    let pid = req.query.prestador_id;
    if (req.user.role === 'prestador') pid = req.user.id;
    const { rows } = await db.query('SELECT * FROM historico_pdf WHERE prestador_id=$1 ORDER BY gerado_em DESC LIMIT 50', [pid]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/historico-pdf', authAny, async (req, res) => {
  try {
    let pid = req.body.prestador_id;
    if (req.user.role === 'prestador') pid = req.user.id;
    const { total_chamados, total_geral, snapshot, periodo_mes, periodo_ano } = req.body;
    const { rows } = await db.query(`
      INSERT INTO historico_pdf (prestador_id,total_chamados,total_geral,snapshot,periodo_mes,periodo_ano)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [pid, total_chamados||0, total_geral||0, JSON.stringify(snapshot||[]), periodo_mes||null, periodo_ano||null]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── DASHBOARD ────────────────────────────────────────────────

app.get('/api/admin/dashboard', authAdmin, async (req, res) => {
  try {
    const { rows: stats } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM prestadores WHERE ativo=TRUE) AS prestadores_ativos,
        (SELECT COUNT(*) FROM chamados) AS total_chamados,
        (SELECT COUNT(*) FROM chamados WHERE EXTRACT(MONTH FROM data_chamado)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM data_chamado)=EXTRACT(YEAR FROM NOW())) AS chamados_mes
    `);
    const ano = new Date().getFullYear();
    const { rows: chart } = await db.query(`
      SELECT
        EXTRACT(MONTH FROM c.data_chamado) AS mes,
        p.nome AS prestador,
        ROUND(SUM(c.km_ida_volta*p.valor_km + c.tempo_horas*p.valor_hora + c.estacionamento + c.pecas)::numeric,2) AS total
      FROM chamados c
      JOIN prestadores p ON p.id=c.prestador_id
      WHERE EXTRACT(YEAR FROM c.data_chamado)=$1
      GROUP BY mes, p.nome ORDER BY mes, p.nome`,
      [ano]);
    res.json({ ...stats[0], chart, ano });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── CONFIGURAÇÕES ────────────────────────────────────────────

app.get('/api/configuracoes', authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id,fechamento_dia,email_principal,emails_cc,gmail_usuario,envio_ativo FROM configuracoes WHERE id=1');
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.put('/api/configuracoes', authAdmin, async (req, res) => {
  try {
    const { fechamento_dia, email_principal, emails_cc, gmail_usuario, gmail_senha_app, envio_ativo } = req.body;
    let query, params;
    if (gmail_senha_app) {
      query = `UPDATE configuracoes SET fechamento_dia=$1,email_principal=$2,emails_cc=$3,gmail_usuario=$4,gmail_senha_app=$5,envio_ativo=$6,updated_at=NOW() WHERE id=1`;
      params = [fechamento_dia, email_principal, emails_cc||[], gmail_usuario, gmail_senha_app, envio_ativo||false];
    } else {
      query = `UPDATE configuracoes SET fechamento_dia=$1,email_principal=$2,emails_cc=$3,gmail_usuario=$4,envio_ativo=$5,updated_at=NOW() WHERE id=1`;
      params = [fechamento_dia, email_principal, emails_cc||[], gmail_usuario, envio_ativo||false];
    }
    await db.query(query, params);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/configuracoes/testar-email', authAdmin, async (req, res) => {
  try {
    const { mes, ano } = req.body;
    const m = mes || new Date().getMonth() + 1;
    const a = ano || new Date().getFullYear();
    await rodarFechamento(m, a);
    res.json({ ok: true, mensagem: `Relatórios do período ${m}/${a} enviados com sucesso` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/log-emails', authAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM log_emails ORDER BY enviado_em DESC LIMIT 100');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

// ── SERVE INDEX PARA TUDO QUE NÃO FOR API ──
app.get('*', (req, res) => {
  // Se for requisição de API, retorna 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  // Caso contrário, serve index.html (SPA)
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Purificatta rodando na porta ${PORT}`);
  iniciarCron();
});
