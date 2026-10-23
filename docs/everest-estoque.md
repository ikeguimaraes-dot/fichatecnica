# Estoque: notas fiscais recebidas

A aba Estoque consulta `/api/everest-stock` com a sessão autenticada existente. As credenciais privadas `EVEREST_USERNAME`, `EVEREST_PASSWORD`, `EVEREST_ENTITY` e `EVEREST_ENVIRONMENT` são usadas somente no servidor, como na integração atual.

Contrato consultado em https://homologacao.acomsistemas.com.br/api/swagger.json em 23/10/2026:

- Notas: `GET /api/dfi/notarecebida`, filtros inclusivos `lancamento_inicial` e `lancamento_final`.
- Itens, por empresa das notas: `GET /api/dfi/notarecebidaitem`, com `cd_empresa`, `dt_lancamento_ini` e `dt_lancamento_fin`.
- Categorias: `GET /api/adm/item`, relacionamento por `id_item`, descrição `ds_grupo`.
- Todos usam `x-Entidade`, `x-Pagina`, Basic Authentication e paginação pelo header `x-paginas`.

A consulta percorre todas as páginas antes de apresentar os resultados; falhas não viram listas vazias. A data inicial padrão é 20/10/2026 e pode ser alterada na tela. A data final padrão é o dia corrente em São Paulo. A data exibida na linha é **emissão**, pois a documentação do cabeçalho não fornece o campo de data de lançamento na resposta.

Uma nota pode aparecer em várias categorias: os valores agregados são dos itens (`vl_total`), sem repetir o total do cabeçalho em cada categoria. Valores ausentes permanecem não informados. Notas sem itens são sinalizadas separadamente. A situação original é exibida pelo código do Everest, pois a documentação não enumera os significados; não se presume que todas as notas estejam efetivadas. A listagem de NFs preserva as entradas; a seção de controle descrita abaixo calcula o consumo das vendas separadamente.

Validação automatizada com respostas simuladas: contrato de datas, paginação, autenticação, erros, navegação e filtro de categorias. A consulta real das notas requer publicar a nova função no ambiente com as credenciais; não foi executada nesta implementação local.

## Controle de saldo e disponibilidade (23/10/2026)

A seção Controle de estoque agora complementa a consulta de NFs. O ponto inicial é fixo: **zero em 20/10/2026**. Se a consulta de entradas começar depois dessa data, o cálculo não é apresentado.

- `/api/stock-context?unit=...&end=...` lê `lorean_workdays` e todos os `lorean_produtos_dia` associados desde o dia 20, com paginação e vínculo por UUID da unidade em `everest_unidades` (ambiente `producao`). Não usa totais financeiros como quantidade de produtos.
- Cada atualização recalcula do zero a partir da fonte atual. Não grava baixas incrementais, portanto reabrir a tela ou corrigir uma venda não duplica o consumo. O coletor Lorean existente continua responsável por alimentar o banco; este recurso não altera nem reprocessa os relatórios de origem.
- Vínculos `confirmado` de `produto_venda_ficha` são usados somente na mesma unidade. Nenhuma correspondência aproximada de nome é confirmada automaticamente. A tela permite aos editores já autorizados no Everest confirmar uma ficha e a quantidade de saída por venda. As exceções ficam em `receita_estoque_vinculo`, separadas dos vínculos de outros sistemas, com autor e data.
- Por padrão, uma venda corresponde a uma unidade apenas quando a ficha produz UN/UNID. Fichas em KG/L exigem conversão explícita de porção. Não se deduz peso pelo nome do prato.
- `raw_cost` do snapshot publicado contém a árvore expandida com rendimentos e aproveitamentos já aplicados pelo Everest. O cálculo soma **somente as folhas**, usando `qt_utilizada / qt_utilizada da raiz × saída por venda`, convertendo G/KG e ML/L. Não reaplica percentuais de perda ou rendimento sobre essas quantidades. A versão, o rendimento, os ingredientes diretos e a integridade da árvore são conferidos.
- Entradas usam `qt_convertido` na unidade padrão de estoque quando disponível. Caso contrário, usam `id_embalagem` e `qt_item` do catálogo. A conversão é aplicada uma vez; KG, L e UN nunca são misturados. Conversões desconhecidas viram pendências.
- Disponibilidade = piso do menor saldo/consumo por porção. O número é individual para cada prato; não representa um plano de produção simultânea. Saldos negativos permanecem visíveis.
- Dia sem importação não equivale a venda zero. Produtos sem ficha, dias faltantes, importação em andamento, relatórios suspeitos e unidades incompatíveis impedem apresentar disponibilidade como confirmada. O último dia importado aparece na tela. Mesmo pratos sem vendas aparecem quando existem nas fichas da unidade.
- Este é um **saldo teórico** de entradas menos consumo de ingredientes. Perdas, contagens, transferências não presentes nas NFs e estoque separado de preparos prontos não são movimentados por este recurso. As fichas e os vínculos atuais são aplicados ao período inteiro; não há reconstrução de versões históricas.

Migração `20261023142921_add_stock_sales_links.sql`: tabela com RLS habilitado, sem acesso direto de anon/authenticated; acesso pelo servidor e escrita limitada à lista `EVEREST_ALLOWED_USER_IDS`. Aplicada no projeto conectado por SQL em 23/10/2026 e verificada por consulta e privilégios. Não contém vínculos inventados ou pré-preenchidos.

Validação real: banco tinha produtos dos dias 20–22 para as quatro casas e nenhum movimento em 23/10 no momento da verificação. O cálculo foi executado localmente sobre 124 registros reais de produtos e 358 fichas da Madonna, encontrando 63 produtos com vínculo/conversão pendentes. Isso não constitui confirmação do saldo físico; as pendências precisam de conferência operacional.

## Categorias do cardápio e Top 20

O cardápio permite filtrar Proteínas, Alcoólicos, Embutidos, Pães, Massas e outras categorias, mantendo a disponibilidade em porções e a ficha expansível. A classificação usa primeiro o grupo do produto vendido no Lorean, depois o grupo do item principal no Everest e, como alternativa, o nome do produto/ficha. Não classifica o prato pela categoria dos ingredientes. Produtos sem classificação ficam em Outros; a classificação por nome é uma aproximação.

Top 20 produtos apresenta dois rankings independentes para a unidade e período selecionados, desde 20/10/2026: quantidade e valor vendido, ambos decrescentes e numerados desde 1. O valor soma `bruto - desconto`; `total` do Lorean inclui gorjeta e não é usado. Produtos sem ficha também entram nos rankings. Nomes são agrupados pela mesma normalização do controle de consumo; empates são resolvidos pelo nome. Dados suspeitos ficam fora dos dois rankings, quantidades inválidas ficam fora do ranking por quantidade e valores financeiros ausentes ficam fora do ranking por valor, com aviso na tela.

O Top 20 também permite combinar checkboxes de Pratos principais, Entradas, Bebidas alcoólicas, Não alcoólicos e Sobremesas. Outros preserva produtos sem classificação nessas famílias. Todos começam selecionados; desmarcar todos exibe lista vazia. A seleção filtra as vendas **antes** de ordenar e limitar a 20, e cada ranking reinicia em 1.

Cada produto vendido com ficha vinculada apresenta o componente principal: maior custo aplicado no rendimento completo da ficha, usando a mesma apuração de custos da ficha técnica (ramos de preparos somam somente folhas). Componentes repetidos de mesmo item/unidade somam seus custos. Preço unitário por kg não determina o principal. Custos incompletos ou total zero impedem escolher um principal. O saldo mostrado é o saldo teórico desse item na unidade, após consumo, com marcação de estimativa quando necessário. Preparos internos e unidades incompatíveis ficam a conferir, sem presumir estoque de preparo pronto nem converter ausência de dados em zero.

Exceção da Parrillada de carne: todas as carnes são prioritárias, sem depender dos custos. A identificação usa a composição expandida para mostrar também as carnes dos preparos (Chorizo e linguiças), excluindo acompanhamentos. Validado com a ficha 837 da unidade 1: Ojo de Bife, Steak Meet, Picanha, Chorizo, Linguiça Chimichurri, Marguerita e Tex Mex. Se a composição não puder ser expandida, os componentes diretos identificados são preservados, com preparos sinalizados. No Top 20, quantidade disponível = máximo entre zero e saldo teórico; falta de entrada de um item identificado resulta em zero. Os saldos negativos continuam preservados no controle de saldo. Custos não bloqueiam a consulta de saldo das carnes prioritárias; ausência de ficha ou unidade incompatível continua sendo indicada explicitamente.
