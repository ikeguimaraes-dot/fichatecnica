export type EverestComponent = {
  itemId: number | null;
  code: string;
  name: string;
  packaging: string;
  unit: string;
  quantity: number | null;
  utilization: number | null;
  type: number | null;
  unitCost: number | null;
  appliedCost: number | null;
  stockUnitCost: number | null;
  costBasis: "composition" | "everest" | "unmatched";
};
export type EverestRecord = {
  id: number;
  itemId: number | null;
  code: string;
  name: string;
  unit: string;
  quantity: number | null;
  yieldKg: number | null;
  version: number | null;
  versionDate: string;
  status: number | null;
  released: boolean;
  componentCount: number;
};
export type EverestDetail = EverestRecord & {
  packaging: string;
  instructions: string;
  notes: string;
  shelfLifeDays: number | null;
  components: EverestComponent[];
  costStatus:
    "available" | "review" | "partial" | "unavailable" | "version_mismatch";
  totalCost: number | null;
  costPerKg: number | null;
  costAudit: {
    sourceTotal: number | null;
    difference: number | null;
    zeroCostItems: string[];
    missingCostItems: string[];
    stocklessCostItems: string[];
  } | null;
};
export type EverestPage = {
  records: EverestRecord[];
  snapshotId?: string | null;
  page: number;
  totalPages: number;
  environment: string;
  fetchedAt: string;
};

export type EverestUnit = {
  id: number;
  name: string;
  syncedAt: string | null;
  recipeCount: number;
};
export type EverestSyncJob = {
  costWarningCount?: number;
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: string;
  error: string | null;
  requestedUnit: number | null;
  createdAt: string;
  finishedAt: string | null;
};
export type EverestCollection<T> = Omit<EverestPage, "records"> & {
  records: T[];
};
