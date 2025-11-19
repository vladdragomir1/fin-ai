import React, { useState, createContext, useContext } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';
import { WatchlistProvider } from '@/context/WatchlistContext';
import { AppNavigator } from '@/navigation/AppNavigator';
import { LoginScreen } from '@/screens';
import { palette } from '@/theme';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_USERNAME = 'username';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

interface AuthContextType {
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthContext');
  }
  return context;
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isExplicitLogout, setIsExplicitLogout] = useState(false);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setIsExplicitLogout(false);
  };

  const handleLogout = () => {
    // Mark as explicit logout and set authenticated to false
    setIsExplicitLogout(true);
    setIsAuthenticated(false);
  };

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ logout: handleLogout }}>
        <AppProvider>
          <WatchlistProvider>
            <StatusBar barStyle="light-content" backgroundColor={palette.background} />
            {isAuthenticated ? (
              <AppNavigator />
            ) : (
              <LoginScreen onLoginSuccess={handleLoginSuccess} isExplicitLogout={isExplicitLogout} />
            )}
          </WatchlistProvider>
        </AppProvider>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
};

export default App;
