export type EverestComponent = {
  itemId: number | null;
  code: string;
  name: string;
  packaging: string;
  unit: string;
  quantity: number | null;
  utilization: number | null;
  type: number | null;
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
};
export type EverestPage = {
  records: EverestRecord[];
  page: number;
  totalPages: number;
  environment: string;
  fetchedAt: string;
};
