export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // ISO string
  note?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'monthly' | 'weekly';
  month: string; // YYYY-MM
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface TrainingMetrics {
  loss: number;
  accuracy: number;
}

export interface TrainingJob {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt?: string;
  completedAt?: string;
  progress: number;
  epochs: number;
  datasetSize: number;
  metrics: TrainingMetrics;
  notes?: string;
}

export interface PredictionInsight {
  id: string;
  title: string;
  description: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  impact: number; // 0 - 1
}

export interface FinanceState {
  transactions: Transaction[];
  budgets: Budget[];
  categories: Category[];
  aiMessages: AiMessage[];
  trainingJobs: TrainingJob[];
  insights: PredictionInsight[];
  lastSyncedAt?: string;
}

export interface TransactionInput {
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  note?: string;
}
