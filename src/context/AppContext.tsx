import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { formatISO } from 'date-fns';
import { initialState } from '@/data/mockData';
import {
  AiMessage,
  Budget,
  FinanceState,
  Transaction,
  TransactionInput,
  TrainingJob,
} from '@/types';
import { loadState, saveState } from '@/services/storageService';
import { AiService } from '@/services/aiService';
import { createTrainingJob, simulateTraining } from '@/services/trainingService';

type Action =
  | { type: 'HYDRATE'; payload: FinanceState }
  | { type: 'UPSERT_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'UPSERT_BUDGET'; payload: Budget }
  | { type: 'ADD_MESSAGE'; payload: AiMessage }
  | { type: 'UPSERT_JOB'; payload: TrainingJob }
  | { type: 'SET_LAST_SYNC'; payload: string };

const reducer = (state: FinanceState, action: Action): FinanceState => {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload };
    case 'UPSERT_TRANSACTION':
      return {
        ...state,
        transactions: [action.payload, ...state.transactions.filter(t => t.id !== action.payload.id)],
      };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
    case 'UPSERT_BUDGET':
      return {
        ...state,
        budgets: state.budgets.some(b => b.id === action.payload.id)
          ? state.budgets.map(b => (b.id === action.payload.id ? action.payload : b))
          : [...state.budgets, action.payload],
      };
    case 'ADD_MESSAGE':
      return { ...state, aiMessages: [...state.aiMessages, action.payload] };
    case 'UPSERT_JOB':
      return {
        ...state,
        trainingJobs: state.trainingJobs.some(job => job.id === action.payload.id)
          ? state.trainingJobs.map(job => (job.id === action.payload.id ? action.payload : job))
          : [action.payload, ...state.trainingJobs],
      };
    case 'SET_LAST_SYNC':
      return { ...state, lastSyncedAt: action.payload };
    default:
      return state;
  }
};

interface AppContextValue extends FinanceState {
  addTransaction: (input: TransactionInput) => void;
  deleteTransaction: (transactionId: string) => void;
  sendMessage: (prompt: string) => Promise<void>;
  startTrainingJob: (datasetSize?: number, epochs?: number) => void;
  hydrateFinished: boolean;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const runningJobs = useRef<Record<string, () => void>>({});

  const stopAllJobs = useCallback(() => {
    Object.values(runningJobs.current).forEach(stop => stop());
    runningJobs.current = {};
  }, [runningJobs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await loadState();
      if (stored && mounted) {
        dispatch({ type: 'HYDRATE', payload: stored });
      }
      setHydrated(true);
    })();
    return () => {
      mounted = false;
      stopAllJobs();
    };
  }, [stopAllJobs]);

  useEffect(() => {
    if (hydrated) {
      saveState(state);
    }
  }, [state, hydrated]);

  const addTransaction = useCallback(
    (input: TransactionInput) => {
      const transaction: Transaction = {
        id: `trx-${Date.now()}`,
        createdAt: formatISO(new Date()),
        ...input,
      };

      const budget = state.budgets.find(
        b => b.category === input.category && b.month === transaction.date.slice(0, 7),
      );

      if (budget && transaction.type === 'expense') {
        dispatch({
          type: 'UPSERT_BUDGET',
          payload: { ...budget, spent: budget.spent + transaction.amount },
        });
      }

      dispatch({ type: 'UPSERT_TRANSACTION', payload: transaction });
    },
    [state.budgets],
  );

  const deleteTransaction = useCallback((transactionId: string) => {
    dispatch({ type: 'DELETE_TRANSACTION', payload: transactionId });
  }, []);

  const sendMessage = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      const now = formatISO(new Date());
      const userMessage: AiMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: now,
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      const response = await AiService.generateResponse(trimmed, {
        transactions: state.transactions,
        budgets: state.budgets,
        insights: state.insights,
      });

      const assistantMessage: AiMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        createdAt: formatISO(new Date()),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      dispatch({ type: 'SET_LAST_SYNC', payload: assistantMessage.createdAt });
    },
    [state.transactions, state.budgets, state.insights],
  );

  const startTrainingJob = useCallback(
    (datasetSize?: number, epochs?: number) => {
      const job = createTrainingJob(datasetSize, epochs);
      dispatch({ type: 'UPSERT_JOB', payload: job });

      const stop = simulateTraining(job, updatedJob => {
        dispatch({ type: 'UPSERT_JOB', payload: updatedJob });
      });

      runningJobs.current[job.id] = stop;
    },
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      addTransaction,
      deleteTransaction,
      sendMessage,
      startTrainingJob,
      hydrateFinished: hydrated,
    }),
    [state, hydrated, addTransaction, deleteTransaction, sendMessage, startTrainingJob],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return ctx;
};
