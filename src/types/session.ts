export interface SessionMeta {
  id: string;
  name: string;
  templateName: string;
  createdAt: string;
  lastModified: string;
  totalLoops: number;
  status: 'running' | 'paused' | 'stopped';
  llmProvider: string;
  llmModel: string;
}
