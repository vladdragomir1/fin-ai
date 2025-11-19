import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WatchlistItem } from '@/types';

interface WatchlistContextValue {
  watchlist: WatchlistItem[];
  addToWatchlist: (symbol: string, name: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  isInWatchlist: (symbol: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | undefined>(undefined);

const WATCHLIST_KEY = '@finai_watchlist';

export const WatchlistProvider = ({ children }: { children: ReactNode }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = async () => {
    try {
      const stored = await AsyncStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    }
  };

  const saveWatchlist = async (items: WatchlistItem[]) => {
    try {
      await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
      setWatchlist(items);
    } catch (error) {
      console.error('Error saving watchlist:', error);
    }
  };

  const addToWatchlist = useCallback(
    async (symbol: string, name: string) => {
      const newItem: WatchlistItem = {
        symbol,
        name,
        addedAt: new Date().toISOString(),
      };
      const updated = [...watchlist.filter(item => item.symbol !== symbol), newItem];
      await saveWatchlist(updated);
    },
    [watchlist],
  );

  const removeFromWatchlist = useCallback(
    async (symbol: string) => {
      const updated = watchlist.filter(item => item.symbol !== symbol);
      await saveWatchlist(updated);
    },
    [watchlist],
  );

  const isInWatchlist = useCallback(
    (symbol: string) => {
      return watchlist.some(item => item.symbol === symbol);
    },
    [watchlist],
  );

  return (
    <WatchlistContext.Provider
      value={{
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
      }}>
      {children}
    </WatchlistContext.Provider>
  );
};

export const useWatchlist = () => {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error('useWatchlist must be used inside WatchlistProvider');
  }
  return ctx;
};
