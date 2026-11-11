# Migração para Supabase

## Configuração da aplicação

1. Crie um projeto Supabase e aplique `supabase/migrations/20261111_supabase_records.sql` pelo SQL Editor ou pela CLI do Supabase.
2. Ative o provedor Google em **Authentication → Providers** e configure as URLs de redirecionamento do app.
3. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente de execução. A chave service role é exclusiva do servidor e nunca deve receber o prefixo `VITE_`.
4. Copie `.env.example` para `.env` e preencha as variáveis localmente. Não versione `.env`.
5. Depois da importação, cadastre/confirme o usuário proprietário no Supabase Auth. Se o backup não tiver um administrador ativo com o mesmo e-mail, crie o registro de proprietário usando o UUID do usuário no SQL Editor:

   ```sql
   insert into public.app_records (collection, id, data)
   values (
     'admins',
     'UUID_DO_USUARIO',
     jsonb_build_object(
       'email', 'email-confirmado@exemplo.com',
       'role', 'owner',
       'active', true,
       'createdAt', now(),
       'updatedAt', now()
     )
   );
   ```
6. Habilite Realtime para a tabela `public.app_records` se a migração da publicação não tiver sido aplicada automaticamente.

O adaptador mantém temporariamente os nomes de coleções/documentos existentes dentro de `app_records` (`collection`, `id`, `data` em JSONB). O RLS impede acesso direto de usuários não autorizados, e as transações do app usam `apply_record_batch` com verificação de revisão e bloqueio no PostgreSQL.

## Migração de dados e contas existentes

A aplicação não consegue importar dados do Firestore sem acesso autorizado ao projeto de origem. Antes de publicar esta versão, use a exportação administrativa da versão antiga para baixar um JSON contendo `collections`; o endpoint de exportação desta versão passa a exportar o Supabase. Valide o backup e faça a importação antes de direcionar o tráfego de produção para o novo banco.

O importador aceita o JSON de exportação administrativa no formato `{ "collections": { "nome": [{ "id": "...", "...": "..." }] } }`. Também aceita documentos com `fields` no formato de valores Firestore REST. Primeiro execute em modo de conferência; a gravação só acontece com `--confirm`:

```powershell
npm run import:firestore -- C:\caminho\seguro\backup.json
npm run import:firestore -- C:\caminho\seguro\backup.json --confirm
```

O importador atualiza documentos com os mesmos IDs, converte `bytesValue` para arrays de bytes e ignora coleções fora da lista suportada. Faça o backup do projeto Supabase antes de repetir uma importação confirmada.

As contas e senhas do Firebase Authentication não são migradas automaticamente. Usuários administrativos devem ser criados/importados no Supabase Auth, o provedor Google precisa ser configurado novamente e cada conta precisa de um registro equivalente na coleção `admins` do Supabase. Se não for possível importar credenciais compatíveis, os usuários precisarão redefinir a senha ou entrar novamente pelo Google.

## Segurança

Não publique nem envie a chave service role. Ela contorna RLS e fica somente no servidor. A chave anon pode ser exposta, pois as políticas RLS restringem os registros a administradores ativos.
