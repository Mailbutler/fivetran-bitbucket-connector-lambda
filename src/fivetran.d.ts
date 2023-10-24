export interface FivetranRequest {
  agent: string;
  state: {
    since?: string; // we could add other 'cursors'
    nextPageLinks?: Record<string, Record<string, string | undefined>>;
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

export type FivetranCellType = string | number | Date | null;
export type FivetranRow = { [key: string]: FivetranCellType };

export interface FivetranSuccessResponse {
  state: {
    since: string | undefined;
    nextPageLinks: Record<string, Record<string, string | undefined>>;
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
