import AsyncStorage from '@react-native-async-storage/async-storage';
import { FinanceState } from '@/types';

const STORAGE_KEY = '@finance-ai/state';

export const loadState = async (): Promise<FinanceState | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as FinanceState;
  } catch (error) {
    console.warn('[storage] Failed to load state', error);
    return null;
  }
};

export const saveState = async (state: FinanceState) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[storage] Failed to persist state', error);
  }
};

export const resetState = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[storage] Failed to reset state', error);
  }
};
