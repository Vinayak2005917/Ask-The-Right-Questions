export type MemoryNodeState = 'locked' | 'active';

export interface MemoryNodeData {
  id: string;
  x: number;
  y: number;
  state: MemoryNodeState;
}
