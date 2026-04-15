export type FlagValue = boolean | string | number;

export type Operator = 'eq' | 'neq' | 'contains' | 'starts_with' | 'gt' | 'lt' | 'in';

export type FlagStatus = 'active' | 'inactive' | 'partial';

export interface Rule {
  field: string;
  operator: Operator;
  value: string;
}

export interface Segment {
  id: string;
  name: string;
  rules: Rule[];
  description: string;
}

export interface Flag {
  id: string;
  name: string;
  key: string;
  description: string;
  enabled: boolean;
  value: FlagValue;
  segments: Segment[];
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditEntry {
  id: string;
  flagId: string;
  action: string;
  oldValue: string;
  newValue: string;
  userId: string;
  timestamp: string;
  traceId: string;
}