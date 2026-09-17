// Administrative CNPJs with duplicated Everest item links, excluded by the owner.
// Keep IDs stable even if the upstream company names change.
const excluded = new Set([2, 4, 6, 7, 8, 9]);
export const visibleEverestUnit = (id) => !excluded.has(Number(id));
