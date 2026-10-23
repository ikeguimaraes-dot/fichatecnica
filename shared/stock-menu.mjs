import { finite } from "./stock-ledger.mjs";
export const MENU_CATEGORIES = [
  "Proteínas",
  "Alcoólicos",
  "Embutidos",
  "Pães",
  "Massas",
  "Sem álcool",
  "Sobremesas",
  "Saladas",
  "Acompanhamentos",
  "Outros",
];
const clean = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
function groupCategory(text) {
  if (
    /SEM ALCOOL|S\s*\/\s*ALCOOL|SOFT|SUCO/.test(text) ||
    /^(CAFE|CHA|CAFE\/CHA|CHA E CAFE)$/.test(text)
  )
    return "Sem álcool";
  if (/EMBUTID|CHARCUT|LINGUICA|SALAME|PRESUNTO|SALSICHA/.test(text))
    return "Embutidos";
  if (/MASSA|PASTA|GNOCCHI/.test(text)) return "Massas";
  if (/PAES|PAO\b|PANIFIC|SANDUICHE|BURGER/.test(text)) return "Pães";
  if (/PROTEIN|CARNE|AVE\b|AVES\b|PEIXE|FRUTO.? ?MAR|DA BRASA|WAGYU/.test(text))
    return "Proteínas";
  if (
    /VINHO|CERVEJA|CHOPP|ESPUMANTE|CHAMPAGNE|CAIPIRINHA|DRINK|DOSES|LICOR|WHISK|ALCOOL/.test(
      text,
    ) ||
    /^(BRANCOS|TINTO|TACAS|AUTORAIS|CLASSICOS)$/.test(text)
  )
    return "Alcoólicos";
  if (/SOBREMESA|DOLCI/.test(text)) return "Sobremesas";
  if (/SALADA/.test(text)) return "Saladas";
  if (
    /ACOMPANHA|ARROZ|ARROZES|RISOTO|BATATA|FAROFA|LEGUME|VERDURA|MOLHO/.test(
      text,
    )
  )
    return "Acompanhamentos";
  return null;
}
export function menuCategory({
  name,
  recipeName = "",
  groups = [],
  catalogCategory = "",
}) {
  // Use product groups, never ingredient groups: pasta with beef remains pasta.
  for (const group of [...groups, catalogCategory]) {
    const category = groupCategory(clean(group));
    if (category) return category;
  }
  const text = clean(`${name} ${recipeName}`);
  if (/SEM ALCOOL|S\s*\/\s*ALCOOL|\bMOCKTAIL\b/.test(text)) return "Sem álcool";
  if (
    /\b(MASSA|MASSAS|PASTA|SPAGHETTI|ESPAGUETE|TAGLIATELLE|FETTUCCINE|FETUCCINE|PENNE|RAVIOLI|RAVIOLE|GNOCCHI|NHOQUE|LASAGNA|LASANHA|CAPELETTI|TORTELLINI|CARBONARA)\b/.test(
      text,
    )
  )
    return "Massas";
  if (
    /\b(PAO|PAES|FOCACCIA|BRIOCHE|CIABATTA|SANDUICHE|SANDUICHES|BURGER|HAMBURGUER|PIADINA|CROISSANT|BRUSCHETTA|TOAST)\b/.test(
      text,
    )
  )
    return "Pães";
  if (
    /\b(LINGUICA|LINGUICAS|SALAME|SALAMINHO|PRESUNTO|PROSCIUTTO|MORTADELA|SALSICHA|COPPA|CHARCUTARIA|EMBUTIDOS|BACON|PANCETTA)\b/.test(
      text,
    )
  )
    return "Embutidos";
  if (
    /^(DRINK|GIN|VODKA|WHISKY|WHISKEY|CERVEJA|CHOPP|VINHO|ESPUMANTE|CHAMPAGNE|CAIPIRINHA|CAIPIROSKA|APEROL SPRITZ|NEGRONI|MOJITO|MARGARITA|MOSCOW MULE)\b/.test(
      text,
    )
  )
    return "Alcoólicos";
  if (
    /^(SUCO|AGUA|REFRIGERANTE|CAFE|CHA|COCA|GUARANA|SODA|LIMONADA)\b/.test(text)
  )
    return "Sem álcool";
  if (
    /\b(TORTA|PUDIM|SORVETE|GELATO|TIRAMISU|BROWNIE|SOBREMESA|CHEESECAKE|PANNA COTTA)\b/.test(
      text,
    )
  )
    return "Sobremesas";
  if (/\b(SALADA|SALADAS|INSALATA)\b/.test(text)) return "Saladas";
  if (
    /\b(CARNE|BIFE|ANCHO|CHORIZO|PICANHA|FRALDINHA|WAGYU|FILE|FILLET|MIGNON|COSTELA|PRIME RIB|PORTER|PARRILLADA|FRANGO|GALETO|PATO|PORCO|SUINO|CORDEIRO|SALMAO|PEIXE|CAMARAO|POLVO|ATUM|BACALHAU)\b/.test(
      text,
    )
  )
    return "Proteínas";
  return "Outros";
}
export function rankSales(sales, metric) {
  const value = (sale) =>
    metric === "value"
      ? finite(sale.netValue)
      : sale.quantityValid === false
        ? null
        : finite(sale.quantity);
  return sales
    .filter((sale) => !sale.suspect && value(sale) !== null && value(sale) > 0)
    .sort(
      (a, b) => value(b) - value(a) || a.name.localeCompare(b.name, "pt-BR"),
    )
    .slice(0, 20)
    .map((sale, index) => ({ ...sale, rank: index + 1 }));
}

export const TOP_CATEGORIES = [
  "Pratos principais",
  "Entradas",
  "Bebidas alcoólicas",
  "Não alcoólicos",
  "Sobremesas",
  "Outros",
];
export function topCategory(item) {
  const category = menuCategory(item);
  if (category === "Alcoólicos") return "Bebidas alcoólicas";
  if (category === "Sem álcool") return "Não alcoólicos";
  const groups = (item.groups || []).map(clean);
  for (const group of groups) {
    if (/ENTRADA|ANTIPAST|PARA COMPARTILHAR/.test(group)) return "Entradas";
    if (/SOBREMESA|DOLCI/.test(group)) return "Sobremesas";
    if (
      /PRINCIPAL|PRATOS|PROTEIN|DA BRASA|WAGYU|PEIXE|FRUTO.? ?MAR|MASSA|RISOTO|EXECUTIVO/.test(
        group,
      )
    )
      return "Pratos principais";
  }
  if (category === "Sobremesas") return "Sobremesas";
  if (["Proteínas", "Massas"].includes(category)) return "Pratos principais";
  return "Outros";
}
