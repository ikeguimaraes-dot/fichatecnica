const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
export const isProduction = (name) => normalized(name).startsWith("PROD");

// Owner-confirmed correction for an incomplete Everest item/company link.
export function includedRecipe(raw, unitId, upstreamMember) {
  const correctedUnit =
    Number(raw.id_fichatecnica) === 240 && Number(raw.id_item) === 1918
      ? 3
      : null;
  return (
    visibleRecipe(raw.ds_item, unitId) &&
    (correctedUnit !== null ? Number(unitId) === correctedUnit : upstreamMember)
  );
}

// Explicit house labels take precedence over the broad item/company links.
// Unlabelled recipes keep their upstream membership; never guess their owner.
export function recipeHouse(name) {
  const value = normalized(name);
  // Sashimeet is exclusive to Meet, as confirmed by the owner.
  if (/\b(SASHIMEET|SASHIMMET)\b/.test(value)) return 1;
  if (/\b(FRNZ|FRZN|FRENZ|FRENEZE)\b/.test(value)) return 10;
  if (/\b(MDNA|MADONNA)\b/.test(value)) return 3;
  if (/\bMEET\b/.test(value)) return 1;
  if (/\bMATCH\s+POINT\b/.test(value)) return 5;
  return null;
}
export function excludedRecipe(name) {
  const value = normalized(name);
  // Productions such as wine reduction or champagne biscuits remain recipes.
  if (isProduction(value)) return false;
  return (
    /\bDOSES?\b/.test(value) ||
    /^(DOSES?\b|GF\b|GARRAFAS?\b|SOFT\b|CERVEJAS?\b|CHOPP\b|VINHOS?\b|V\.?\s+(TINTO|BRANCO|ROSE|TT|BR|PORTO)\b|CHAMP(?:\.|ANHE|AGNE)?\b|ESP\.|ESPUMANTES?\b)/.test(
      value,
    ) ||
    /^(AGUA\b|RED BULL\b|COCA\b|GUARANA\b|TONICA\b|SCHWEPPES\b|SPRITE\b|FANTA\b|REFRIGERANTE\b|ENERGETICO\b|SUCO DE UVA INTEGRAL\b)/.test(
      value,
    )
  );
}
export function recipeCategory(name) {
  const value = normalized(name);
  if (isProduction(value)) {
    if (/\bCONFEITARIA\b/.test(value)) return "food";
    const base = value.replace(/^PROD\.?\s*/, "");
    return /^(SUCO\b|XAROPE\b|GIN\b|VODKA\b|RUM\b|LICOR\b|LIMONCELLO\b|CORDIAL\b|SODA\b|BLEND DE VERMUT|MIX DE LIMOES\b|EXTRATO DE GENGIBRE\b|ESPUMA DE (GENGIBRE|LIMAO)\b|SONETO DE CAMOMILA\b)/.test(
      base,
    )
      ? "drink"
      : "food";
  }
  return /^(DRINK\b|CAIP|JARRA\b|SODA\b|SUCO\b|CAFE\b|CHA\b|DEWARS\b|DEWAERS\b)/.test(
    value,
  ) || excludedRecipe(value)
    ? "drink"
    : "food";
}
export function visibleRecipe(name, unitId) {
  const house = recipeHouse(name);
  return !excludedRecipe(name) && (house === null || house === Number(unitId));
}
