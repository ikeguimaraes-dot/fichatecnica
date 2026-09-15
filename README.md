# Le Chef · Livro de receitas

Sistema de fichas técnicas de pratos, em português, com React, TypeScript, Vite e Supabase.

## Rodar

```sh
npm ci
npm run dev
```

Abra a URL indicada pelo Vite. Para gerar a versão de produção:

```sh
npm run build
npm run preview
```

O projeto já usa a URL e a chave **publicável** do Supabase configurado. Para outro ambiente, copie `.env.example` para `.env.local`. Nunca coloque `service_role` em variáveis `VITE_*` ou no frontend.

## Funcionalidades

- Biblioteca com vários livros, cada um com nome, descrição, tema de capa e foto opcional.
- Receitas organizadas por livro; criação dentro do livro, seleção no editor e movimentação em lote de receitas existentes.
- Visões globais Todas as receitas, Sem livro, favoritos e custos. Busca e categorias continuam disponíveis dentro de cada livro.
- Excluir um livro preserva suas receitas em Sem livro; receitas existentes permanecem acessíveis.
- Ficha com descrição, rendimento, tempo de preparo, ingredientes, etapas, fotos e notas.
- Custos calculados a partir da quantidade em g ou kg e do preço por kg. O total usa os valores sem arredondamento intermediário; exibição em reais com duas casas decimais.
- Custo total e por porção. Valores correspondem aos ingredientes; mão de obra, energia e perdas não são calculadas.
- Upload da foto principal e de uma foto por etapa, em JPG, PNG ou WebP, até 10 MB.
- Impressão da ficha pelo navegador e opção de salvar como PDF.
- Cadastro, login, recuperação de senha e dados privados por conta.
- Demonstração com receitas ilustrativas e persistência no navegador; fotos nesse modo têm limite de 2 MB por arquivo. Dados de demonstração não são importados automaticamente para a conta.
- Layout responsivo, navegação por teclado, foco em modais e respeito à preferência de movimento reduzido.

## Banco de dados

As migrações em `supabase/migrations/` criam uma estrutura própria e a identificam como `receita`. A segunda migração renomeia apenas a estrutura criada por este aplicativo. Nenhuma tabela legada de receitas, fichas técnicas ou ingredientes é utilizada. O único vínculo externo é com `auth.users`, para autenticação do Supabase.

Estrutura aplicada ao projeto informado:

- `public.receita_livro`: livros privados por conta, com nome, descrição, capa e tema.
- `public.receita.book_id`: vínculo opcional ao livro, com chave estrangeira que também verifica o proprietário. Ao excluir um livro, apenas esse vínculo é removido.
- `public.receita`: uma ficha por registro, com ingredientes e etapas em JSONB para salvar o documento atomicamente.
- `receita-fotos`: bucket privado; caminhos começam com o ID do usuário. Acesso às imagens por URLs assinadas com validade de 24 horas; recarregue a página para renová-las.
- RLS em SELECT, INSERT, UPDATE e DELETE, limitada ao proprietário. Visitantes não têm acesso à tabela.
- A aplicação cria novos arquivos para cada upload. Fotos removidas de uma ficha ou de uma edição cancelada podem continuar no bucket; a limpeza desses arquivos pode ser feita posteriormente com uma rotina de retenção.

A aplicação usa as configurações existentes do Supabase Auth. Para publicar, configure **Site URL** e **Redirect URLs** no painel de Auth para o domínio definitivo e para o endereço local utilizado. Cadastro com confirmação e recuperação dependem da entrega de e-mail configurada no projeto. Cada conta tem sua própria biblioteca; compartilhamento entre membros de equipe não foi implementado.

## Publicação

Compatível com hospedagens estáticas, como Vercel, Netlify e Cloudflare Pages:

- Build: `npm run build`
- Diretório de saída: `dist`
- Variáveis opcionais: as de `.env.example`.

O arquivo `vercel.json` define explicitamente o framework Vite, a instalação via `npm ci` e a saída `dist`. Isso evita que um preset Next.js selecionado no painel impeça o deploy. A raiz do projeto na Vercel deve ser a raiz deste repositório.

Nenhum servidor administrativo ou chave secreta é necessário no deploy.

## Verificação

```sh
npx playwright install chromium
npm test
```

Os testes verificam busca, filtros, favoritos, criação/edição/exclusão, foto, cálculo com unidades diferentes, persistência e largura mobile. O Playwright compila e inicia uma prévia em `http://localhost:4173`. Os testes de livros também cobrem movimentação entre livros, capa, exclusão preservando receitas e dados locais anteriores.

## Design

Identidade Le Chef: fundo branco, laranja ácido `#ff6500` e texto escuro.

Tipografia Playfair Display, DM Sans e Manrope (Google Fonts). Fotografias ilustrativas do Unsplash. Recursos externos requerem conexão; as fichas próprias usam o Supabase Storage.
