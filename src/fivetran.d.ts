export interface FivetranRequest {
  agent: string;
  state: {
    since?: string;
    nextPageLinks?: string[];
  };
  secrets: {
    username: string;
    password: string;
  };
  setup_test?: boolean;
  sync_id?: string;
}

export type FivetranCellType = string | number | boolean | Date | null;
export type FivetranRow = { [key: string]: FivetranCellType };

export interface FivetranSuccessResponse {
  state: {
    since: string;
    nextPageLinks: string[];
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
