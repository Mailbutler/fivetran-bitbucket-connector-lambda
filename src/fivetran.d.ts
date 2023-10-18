export interface FivetranRequest {
  agent: string;
  state: {
    since?: string; // we could add other 'cursors'
  };
  secrets: {
    workspace: string;
    repositorySlugs: string;
    username: string;
    password: string;
  };
  setup_test?: boolean;
  sync_id?: string;
}

export type FivetranCellType = string | number | null;
export type FivetranRow = { [key: string]: FivetranCellType };

export interface FivetranSuccessResponse {
  state: {
    since: string;
  };
  insert: Record<string, FivetranRow[]>;
  delete?: Record<string, FivetranRow>;
  schema?: Record<string, { primary_key: string[] }>;
  hasMore: boolean;
  softDelete?: string[];
}

export interface FivetranErrorResponse {
  errorMessage: string;
}

export type FivetranResponse = FivetranSuccessResponse | FivetranErrorResponse;
