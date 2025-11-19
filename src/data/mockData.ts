import { formatISO, subDays } from 'date-fns';
import {
  AiMessage,
  Budget,
  Category,
  FinanceState,
  PredictionInsight,
  TrainingJob,
  Transaction,
} from '@/types';

const iso = (date: Date) => formatISO(date, { representation: 'complete' });

export const defaultCategories: Category[] = [
  { id: 'salary', name: 'Venit Recurent', icon: 'briefcase-outline', color: '#22c55e' },
  { id: 'food', name: 'Mâncare', icon: 'pizza-outline', color: '#f97316' },
  { id: 'transport', name: 'Transport', icon: 'car-outline', color: '#3b82f6' },
  { id: 'shopping', name: 'Shopping', icon: 'cart-outline', color: '#a855f7' },
  { id: 'housing', name: 'Locuință', icon: 'home-outline', color: '#facc15' },
  { id: 'health', name: 'Sănătate', icon: 'medkit-outline', color: '#fb7185' },
];

export const sampleTransactions: Transaction[] = [
  {
    id: 'trx-1',
    title: 'Salariu Net',
    amount: 8200,
    type: 'income',
    category: 'salary',
    date: iso(subDays(new Date(), 3)),
    note: 'Companie: Aurora Tech',
    createdAt: iso(subDays(new Date(), 3)),
  },
  {
    id: 'trx-2',
    title: 'Chirie',
    amount: 2300,
    type: 'expense',
    category: 'housing',
    date: iso(subDays(new Date(), 2)),
    note: 'Apartament Titan',
    createdAt: iso(subDays(new Date(), 2)),
  },
  {
    id: 'trx-3',
    title: 'Cumpărături Mega',
    amount: 320,
    type: 'expense',
    category: 'food',
    date: iso(subDays(new Date(), 1)),
    note: 'Alimente pentru 4 zile',
    createdAt: iso(subDays(new Date(), 1)),
  },
  {
    id: 'trx-4',
    title: 'Abonament Metro',
    amount: 80,
    type: 'expense',
    category: 'transport',
    date: iso(subDays(new Date(), 5)),
    note: 'STB + Metrorex',
    createdAt: iso(subDays(new Date(), 5)),
  },
  {
    id: 'trx-5',
    title: 'Consult Dermatolog',
    amount: 450,
    type: 'expense',
    category: 'health',
    date: iso(subDays(new Date(), 7)),
    note: 'Clinica Dermiq',
    createdAt: iso(subDays(new Date(), 7)),
  },
  {
    id: 'trx-6',
    title: 'Freelance UI Kit',
    amount: 1800,
    type: 'income',
    category: 'salary',
    date: iso(subDays(new Date(), 8)),
    note: 'Client: Nordic Commerce',
    createdAt: iso(subDays(new Date(), 8)),
  },
];

export const sampleBudgets: Budget[] = [
  {
    id: 'bdg-1',
    category: 'food',
    limit: 1500,
    spent: 620,
    period: 'monthly',
    month: '2025-11',
  },
  {
    id: 'bdg-2',
    category: 'transport',
    limit: 400,
    spent: 120,
    period: 'monthly',
    month: '2025-11',
  },
  {
    id: 'bdg-3',
    category: 'shopping',
    limit: 900,
    spent: 380,
    period: 'monthly',
    month: '2025-11',
  },
];

export const sampleTrainingJobs: TrainingJob[] = [
  {
    id: 'train-1',
    status: 'completed',
    startedAt: iso(subDays(new Date(), 10)),
    completedAt: iso(subDays(new Date(), 9)),
    progress: 100,
    epochs: 6,
    datasetSize: 420,
    metrics: {
      loss: 0.21,
      accuracy: 0.86,
    },
    notes: 'Fine-tuning Gemma 2B pe ultimele tranzacții.',
  },
  {
    id: 'train-2',
    status: 'idle',
    progress: 0,
    epochs: 8,
    datasetSize: 520,
    metrics: {
      loss: 0.0,
      accuracy: 0.0,
    },
    notes: 'Config pregătit pentru următorul sprint de date.',
  },
];

export const sampleMessages: AiMessage[] = [
  {
    id: 'msg-1',
    role: 'system',
    content: 'Ești FinanceAI, analist financiar personalizat pentru Vlad.',
    createdAt: iso(subDays(new Date(), 8)),
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Cheltuielile din ultimele 7 zile sunt cu 11% mai mici decât media lunară.',
    createdAt: iso(subDays(new Date(), 1)),
  },
];

export const sampleInsights: PredictionInsight[] = [
  {
    id: 'ins-1',
    title: 'Cheltuieli alimentare stabile',
    description: 'Ești sub bugetul setat pentru mâncare cu 17%.',
    sentiment: 'positive',
    impact: 0.72,
  },
  {
    id: 'ins-2',
    title: 'Abonamente recurente',
    description: 'Plățile recurente reprezintă 43% din cheltuielile totale.',
    sentiment: 'neutral',
    impact: 0.54,
  },
  {
    id: 'ins-3',
    title: 'Risc de depășire buget shopping',
    description: 'Dacă păstrezi ritmul actual, vei depăși bugetul de shopping în 9 zile.',
    sentiment: 'negative',
    impact: 0.81,
  },
];

export const initialState: FinanceState = {
  transactions: sampleTransactions,
  budgets: sampleBudgets,
  categories: defaultCategories,
  aiMessages: sampleMessages,
  trainingJobs: sampleTrainingJobs,
  insights: sampleInsights,
  lastSyncedAt: iso(subDays(new Date(), 1)),
};
