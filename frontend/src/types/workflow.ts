export type NodeStatus = 'pending' | 'running' | 'paused' | 'completed' | 'error';

export type AgentProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

export interface Agent {
  _id?: string;
  id?: string;
  name: string;
  provider: AgentProvider;
  model_id: string;
  api_key?: string;
  system_prompt?: string;
  base_url?: string;
}

export interface WorkflowNode {
  id: string;
  name: string;
  skill_id: string;
  agent_id?: string;
  require_approval: boolean;
  is_start_node?: boolean;
  position?: { x: number; y: number };
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  config?: Record<string, any>;
}

export interface NodeRunData {
  node_id: string;
  status: NodeStatus;
  inputs: Record<string, any>;
  outputs: any;
  error_msg: string | null;
}

export interface WorkflowRunData {
  _id: string;
  status: string;
  node_runs: Record<string, NodeRunData>;
}