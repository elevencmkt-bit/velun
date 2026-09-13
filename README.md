# Dashboard financeiro do casal

Ver a especificação completa no Google Drive: `ECM_HUB/000_Eleven_CM/DASHBOARD/spec-dashboard-financeiro.md`.

Status: **Fase 0 — Fundação** (schema + auth scaffolding prontos, faltando conectar a um projeto Supabase real).

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres + Auth + Storage), Recharts, Zod.

## Para colocar no ar (Fase 0)

1. **Criar o projeto Supabase**: [supabase.com/dashboard](https://supabase.com/dashboard) → New project. Guarde a *Project URL*, a *anon key* e a *service role key* (Settings → API).

2. **Configurar variáveis de ambiente**:
   ```bash
   cp .env.example .env.local
   ```
   Preencher `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` (essa última numa conta de plataforma separada da assinatura do Claude — [console.anthropic.com](https://console.anthropic.com)).

3. **Rodar a migration**: no SQL Editor do painel do Supabase, colar e rodar `supabase/migrations/0001_init.sql`.

4. **Criar os dois usuários**: Authentication → Users → Add user, um para cada um de vocês.

5. **Criar o household e ligar os dois membros** — no SQL Editor:
   ```sql
   insert into households (name) values ('Nome de vocês') returning id;

   -- com o id acima e o id de cada usuário (Authentication → Users):
   insert into members (id, household_id, display_name, color) values
     ('<uuid-usuario-1>', '<uuid-household>', 'Nome 1', '#2F6B4F'),
     ('<uuid-usuario-2>', '<uuid-household>', 'Nome 2', '#B2402F');
   ```

6. **Popular categorias de exemplo** (trocar depois pela lista real — ver seção 9 da spec): rodar `supabase/seed/categories_placeholder.sql` substituindo `:household_id` pelo id do household.

7. **Rodar localmente**:
   ```bash
   npm run dev
   ```
   Abrir [http://localhost:3000](http://localhost:3000), logar com um dos dois usuários e confirmar que aparece o household vazio.

8. **Gerar os tipos reais do banco** (opcional, mas recomendado antes da Fase 1):
   ```bash
   npx supabase gen types typescript --project-id <id-do-projeto> > src/lib/supabase/types.ts
   ```
   e trocar `createBrowserClient` / `createServerClient` para a versão tipada (`createBrowserClient<Database>` etc.) em `src/lib/supabase/client.ts` e `server.ts`.

## Estrutura

```
src/app/(auth)/login      tela de login
src/app/(app)/            telas autenticadas (importar, mês, transações, a pagar, fluxo de caixa, contas)
src/lib/supabase/         clientes Supabase (browser, server, middleware)
src/lib/money.ts          conversão centavos <-> texto exibido (única fronteira com float)
supabase/migrations/      schema SQL com RLS por household_id
supabase/seed/            dados de exemplo
```

## Próximo passo

Fase 1 (núcleo): contas, categorias, lançamento manual, lista de transações — ver seção 8 da spec.
