# Purificatta — Sistema de Controle de Chamados v2

---

## Estrutura do Projeto

```
purificatta/
├── src/
│   ├── server.js       # Servidor Express + todas as rotas
│   ├── db.js           # Conexão PostgreSQL
│   ├── middleware.js   # Auth JWT (admin / prestador)
│   ├── email.js        # Nodemailer + geração de relatórios
│   └── cron.js         # Agendador de fechamento mensal
├── public/
│   ├── index.html      # Login unificado → redireciona por perfil
│   ├── admin.html      # Painel admin (copiar admin_preview validado)
│   └── prestador.html  # Tabela prestador (copiar prestador_preview validado)
├── db/
│   └── schema.sql      # Schema completo — rodar no Supabase
├── uploads/            # PDFs enviados (criado automaticamente)
├── .env.example
└── package.json
```

---

## Deploy — Passo a Passo

### 1. Supabase (Banco de Dados)

1. Acesse [supabase.com](https://supabase.com) → New Project
2. Vá em **SQL Editor** → cole o conteúdo de `db/schema.sql` → **Run**
3. Copie a **Connection String** em Settings → Database → Transaction mode

---

### 2. Gmail — Senha de App

Para o envio automático de e-mails funcionar com o Gmail:

1. Acesse [myaccount.google.com](https://myaccount.google.com)
2. Segurança → Verificação em duas etapas (precisa estar ativa)
3. Segurança → **Senhas de app** → Selecionar app: "Outro" → Nomear: "Purificatta"
4. Copie a senha gerada (16 caracteres) — use no campo **Senha de App Gmail** nas configurações

---

### 3. Railway (Hospedagem)

1. Acesse [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Envie os arquivos para um repositório GitHub (sem o `.env`)
3. No Railway → Variables → adicione:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string do Supabase |
| `JWT_SECRET` | String aleatória longa |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `UPLOAD_DIR` | `uploads` |

4. Settings → Domains → gere o domínio gratuito

---

## Variáveis de Ambiente

```env
DATABASE_URL=postgresql://postgres:[SENHA]@db.[ID].supabase.co:5432/postgres
JWT_SECRET=sua_string_secreta_aqui
JWT_EXPIRES_IN=8h
NODE_ENV=production
UPLOAD_DIR=uploads
PORT=3000
```

---

## Funcionalidades

### Login Unificado
- URL única para todos: `https://seu-dominio.up.railway.app`
- Admin → redireciona para `/admin.html`
- Prestador → redireciona para `/prestador.html`

### Painel Admin
- Dashboard com gráfico mensal por prestador
- Cadastro completo: dados, endereço, valores, upload de PDFs
- Controle de admins (criar, editar, resetar senha, ativar/desativar)
- Acompanhamento de chamados por prestador com histórico
- Configurações de fechamento mensal e e-mail

### Fechamento Mensal Automático
- Configurado por dia do mês (ex: todo dia 25)
- No dia configurado às 08:00 BRT:
  - Fecha os chamados do mês anterior
  - Gera relatório por prestador
  - Envia e-mail via Gmail com o resumo e PDF anexo
  - Assunto: `Relatório Manutenções Prestador [Nome]`
- Log completo de envios disponível no painel
- Botão de disparo manual para testes

### Gmail — Configuração no Painel
Nas Configurações → Fechamento Mensal:
- Dia do fechamento (1–28)
- E-mail principal (destinatário)
- E-mails em CC (múltiplos)
- Gmail: e-mail + senha de app
- Toggle ativo/inativo
- Botão testar envio

### Tabela do Prestador
- Login com e-mail e senha definidos no cadastro
- Cálculo automático (KM, Hora Técnica, extras)
- Auto-save no banco a cada alteração
- Período fechado não pode mais ser editado
- Geração de PDF + histórico de exportações
- Exportação CSV

---

## Desenvolvimento Local

```bash
npm install
cp .env.example .env   # preencher com suas credenciais
npm run dev
```

Acesse: `http://localhost:3000`

**Login padrão admin:**
- E-mail: `admin@purificatta.com.br`
- Senha: `password` ← **TROQUE IMEDIATAMENTE**
