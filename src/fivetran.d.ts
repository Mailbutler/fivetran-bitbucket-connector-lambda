export interface FivetranRequest {
  agent: string;
  state: {
    since?: string; // we could add other 'cursors'
  };
  secrets?: Record<string, string>;
  setup_test?: boolean;
  sync_id?: string;
}

export type FiveTranCellType = string | number;
export type FivetranRow = Record<string, FiveTranCellType>;

export interface FivetranResponse {
  state: {
    since: string;
  };
  insert: Record<string, FivetranRow[]>;
  delete?: Record<string, Record<string, FiveTranCellType>>;
  schema?: Record<string, { primary_key: string[] }>;
  hasMore: boolean;
  softDelete?: string[];
}
