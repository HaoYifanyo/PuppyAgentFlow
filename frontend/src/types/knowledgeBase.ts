export interface KnowledgeBase {
  _id?: string;
  id?: string;
  name: string;
  description: string;
  embedding_agent_id: string;
  document_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface KBDocument {
  _id?: string;
  id?: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface KBSearchResult {
  text: string;
  score: number;
  filename: string;
  chunk_index: number;
}

export interface KBCreate {
  name: string;
  description: string;
  embedding_agent_id: string;
}

export interface KBUpdate {
  name?: string;
  description?: string;
  embedding_agent_id?: string;
}
