-- ============================================================
-- PURIFICATTA — Schema do Banco de Dados v2
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Tabela de administradores
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cargo TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de prestadores
CREATE TABLE IF NOT EXISTS prestadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT,
  email TEXT,
  -- Endereço
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_estado TEXT,
  endereco_cep TEXT,
  -- Acesso
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  -- Valores da tabela vigente
  valor_km NUMERIC(10,2) DEFAULT 0,
  valor_hora NUMERIC(10,2) DEFAULT 0,
  valor_hig_a NUMERIC(10,2) DEFAULT 0,
  valor_hig_b NUMERIC(10,2) DEFAULT 0,
  valor_inst NUMERIC(10,2) DEFAULT 0,
  valor_trans NUMERIC(10,2) DEFAULT 0,
  -- Documentos (paths dos arquivos)
  doc_contrato_path TEXT,
  doc_contrato_nome TEXT,
  doc_tabela_path TEXT,
  doc_tabela_nome TEXT,
  -- Status
  ativo BOOLEAN DEFAULT TRUE,
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de chamados
CREATE TABLE IF NOT EXISTS chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID NOT NULL REFERENCES prestadores(id) ON DELETE CASCADE,
  data_chamado DATE,
  numero_chamado TEXT,
  cliente TEXT,
  km_ida_volta NUMERIC(10,2) DEFAULT 0,
  descricao TEXT,
  tempo_horas NUMERIC(10,4) DEFAULT 0,
  estacionamento NUMERIC(10,2) DEFAULT 0,
  pecas NUMERIC(10,2) DEFAULT 0,
  periodo_fechado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de histórico de PDFs
CREATE TABLE IF NOT EXISTS historico_pdf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID NOT NULL REFERENCES prestadores(id) ON DELETE CASCADE,
  gerado_em TIMESTAMPTZ DEFAULT NOW(),
  total_chamados INTEGER,
  total_geral NUMERIC(10,2),
  snapshot JSONB,
  periodo_mes INTEGER,
  periodo_ano INTEGER
);

-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  id INTEGER PRIMARY KEY DEFAULT 1,
  fechamento_dia INTEGER DEFAULT 25,
  email_principal TEXT,
  emails_cc TEXT[], -- array de e-mails
  gmail_usuario TEXT,
  gmail_senha_app TEXT,
  envio_ativo BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Tabela de log de envios de e-mail
CREATE TABLE IF NOT EXISTS log_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID REFERENCES prestadores(id) ON DELETE SET NULL,
  prestador_nome TEXT,
  enviado_em TIMESTAMPTZ DEFAULT NOW(),
  destinatario TEXT,
  cc TEXT[],
  assunto TEXT,
  status TEXT, -- 'enviado' | 'erro'
  erro_msg TEXT,
  periodo_mes INTEGER,
  periodo_ano INTEGER
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chamados_prestador ON chamados(prestador_id);
CREATE INDEX IF NOT EXISTS idx_chamados_data ON chamados(data_chamado);
CREATE INDEX IF NOT EXISTS idx_chamados_periodo ON chamados(periodo_fechado);
CREATE INDEX IF NOT EXISTS idx_historico_prestador ON historico_pdf(prestador_id);
CREATE INDEX IF NOT EXISTS idx_log_emails_prestador ON log_emails(prestador_id);

-- Inserir configurações padrão
INSERT INTO configuracoes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Admin padrão (senha: Purificatta@2026)
INSERT INTO admins (email, password_hash, nome, cargo)
VALUES (
  'admin@purificatta.com.br',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Administrador',
  'Administrador Principal'
) ON CONFLICT (email) DO NOTHING;
