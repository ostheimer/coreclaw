/**
 * Knowledge Source interface — pluggable data connectors for the Context Conductor.
 * Each knowledge source can retrieve structured and unstructured data
 * to enrich agent context before task execution.
 */
export interface KnowledgeSource {
  readonly name: string;
  readonly type: string;

  /** Test connectivity and authentication */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /** Search for records matching a query */
  search(query: string, options?: SearchOptions): Promise<KnowledgeRecord[]>;

  /** Get a single record by ID */
  getById(id: string): Promise<KnowledgeRecord | null>;

  /** Get records related to a specific reference (e.g., case ID, customer email) */
  getRelated(ref: string, options?: SearchOptions): Promise<KnowledgeRecord[]>;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  type?: string;
  fields?: string[];
}

export interface KnowledgeRecord {
  id: string;
  source: string;
  type: string;
  title: string;
  content: string;
  url?: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}
