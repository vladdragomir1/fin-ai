import React, { useState, createContext, useContext } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WatchlistProvider } from '@/context/WatchlistContext';
import { AppNavigator } from '@/navigation/AppNavigator';
import { LoginScreen } from '@/screens';
import { palette } from '@/theme';

// Kept these imports in case you use them for logic later, strictly optional here
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const handleLogout = async () => {
    setIsExplicitLogout(true);
    setIsAuthenticated(false);
  };

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ logout: handleLogout }}>
        {/* REMOVED: <AppProvider> wrapper */}
        <WatchlistProvider>
          <StatusBar barStyle="light-content" backgroundColor={palette.background} />
          {isAuthenticated ? (
            <AppNavigator />
          ) : (
            <LoginScreen onLoginSuccess={handleLoginSuccess} isExplicitLogout={isExplicitLogout} />
          )}
        </WatchlistProvider>
        {/* REMOVED: </AppProvider> */}
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
};

export default App;