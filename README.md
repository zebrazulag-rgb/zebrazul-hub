# Zebrazul Hub

Plataforma própria de gestão de redes sociais, aprovação de conteúdo e relatórios — inspirada no fluxo do MLabs/Reportei, feita sob medida para a operação da Zebrazul.

## O que já vem pronto

- **Autenticação por papel**: admin, equipe (team) e cliente, com JWT.
- **Gestão de clientes**: cadastro de contas e redes sociais conectadas (Instagram, Facebook, TikTok, LinkedIn, YouTube).
- **Calendário & Aprovação de conteúdo**: a equipe cria o post (legenda, formato, plataformas, data), envia para aprovação, e o cliente aprova/reprova com comentários — tudo com histórico de conversa por post.
- **Relatórios**: dashboard com gráficos de alcance, engajamento e cliques por cliente, com lançamento manual de métricas (pronto para depois plugar as APIs oficiais de Meta Ads e Google Ads).
- **Painel geral**: visão consolidada de pendências de aprovação e próximas publicações.

## Estrutura

```
zebrazul-hub/
  backend/     → API REST (Node + Express + SQLite)
  frontend/    → Interface web (React + Vite + Tailwind + Recharts)
```

## Rodando localmente

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # ajuste o JWT_SECRET
npm run seed              # cria o banco com dados de exemplo
npm start                 # sobe em http://localhost:4000
```

Contas de demonstração criadas pelo seed:

| Papel   | E-mail                        | Senha        |
|---------|--------------------------------|--------------|
| Admin   | saulo@zebrazul.com             | zebrazul123  |
| Equipe  | equipe@zebrazul.com            | zebrazul123  |
| Cliente | dentoessence@cliente.com       | cliente123   |

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                # sobe em http://localhost:5173
```

O frontend já está configurado para redirecionar chamadas `/api` para o backend em desenvolvimento (`vite.config.js`).

## Hospedando em produção

Recomendação simples e barata:

- **Backend**: Railway, Render ou um VPS pequeno (o SQLite funciona bem para o volume da agência; se crescer muito, trocar para Postgres é a única mudança estrutural necessária — o código já usa queries parametrizadas, então a migração é direta).
- **Frontend**: Vercel ou Netlify, apontando a variável de ambiente da API para a URL pública do backend (trocar o `baseURL` em `src/api.js` ou usar uma variável `VITE_API_URL`).

Antes de ir para produção:
1. Troque `JWT_SECRET` no `.env` do backend por um valor aleatório forte.
2. Ative HTTPS (Railway/Render/Vercel já fazem isso automaticamente).
3. Rode `npm run seed` uma única vez para criar o admin inicial — depois use a rota `POST /api/auth/users` (autenticado como admin) para cadastrar a equipe e os clientes reais.
4. Apague os dados de demonstração ou ajuste o seed antes do lançamento real.

## Próximos passos sugeridos (roadmap)

- Integração real com **Meta Marketing API** e **Google Ads API** para puxar métricas automaticamente (hoje o lançamento é manual, propositalmente, para não depender de tokens de terceiros nesta primeira versão).
- Upload de mídia (imagem/vídeo) direto no post, hoje o campo `media_url` aceita um link.
- Notificações por e-mail/WhatsApp quando um conteúdo é aprovado, reprovado ou comentado.
- Publicação automática agendada (hoje o status "agendado" é apenas organizacional).

## Papéis e permissões

- **admin**: acesso total, incluindo criação de novos usuários.
- **team**: cria/edita clientes, posts e métricas; não cria usuários.
- **client**: vê apenas os próprios dados; só pode aprovar/reprovar posts e comentar.
