import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { WatchlistItem } from '@/types';

interface WatchlistContextValue {
  watchlist: WatchlistItem[];
  addToWatchlist: (symbol: string, name: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  isInWatchlist: (symbol: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | undefined>(undefined);

const WATCHLIST_KEY_BASE = '@finai_watchlist';
const STORAGE_KEY_USERNAME = 'username';

export const WatchlistProvider = ({ children }: { children: ReactNode }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    loadWatchlist();
    // Reload when the active user changes (login / logout / delete account)
    const listener = DeviceEventEmitter.addListener('userChanged', () => {
      loadWatchlist();
    });

    return () => {
      listener.remove();
    };
  }, []);

  const loadWatchlist = async () => {
    try {
      const currentUser = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      const key = currentUser ? `${WATCHLIST_KEY_BASE}_${currentUser}` : `${WATCHLIST_KEY_BASE}_global`;

      // If no per-user key but a legacy global key exists, migrate it for the current user
      if (currentUser) {
        const legacy = await AsyncStorage.getItem(WATCHLIST_KEY_BASE);
        const hasUserKey = await AsyncStorage.getItem(key);
        if (!hasUserKey && legacy) {
          await AsyncStorage.setItem(key, legacy);
          await AsyncStorage.removeItem(WATCHLIST_KEY_BASE);
        }
      }

      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      } else {
        setWatchlist([]);
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    }
  };

  const saveWatchlist = async (items: WatchlistItem[]) => {
    try {
      const currentUser = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      const key = currentUser ? `${WATCHLIST_KEY_BASE}_${currentUser}` : `${WATCHLIST_KEY_BASE}_global`;
      await AsyncStorage.setItem(key, JSON.stringify(items));
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
