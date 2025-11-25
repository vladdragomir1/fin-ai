import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';
import * as Keychain from 'react-native-keychain';
import { DeviceEventEmitter } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette } from '@/theme';

// 1. Add a new key to track ALL users
const STORAGE_KEY_USERNAME = 'username';
const STORAGE_KEY_ALL_USERS = 'registered_users'; 
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  isExplicitLogout?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isExplicitLogout = false }) => {
  // ... (keep all your existing state variables exactly the same) ...
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [isSignUpMode, setIsSignUpMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [storedUsername, setStoredUsername] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showQuickLogin, setShowQuickLogin] = useState<boolean>(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean>(false);

  useEffect(() => {
    checkExistingUser();
    checkBiometrics();
  }, []);

  // ... (keep checkExistingUser, checkBiometrics, and handleBiometricLogin the same) ...
  const checkExistingUser = async () => {
    try {
      const storedName = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      const existingUsersJson = await AsyncStorage.getItem(STORAGE_KEY_ALL_USERS);
      const existingUsers: string[] = existingUsersJson ? JSON.parse(existingUsersJson) : [];

      if (storedName) {
        const serviceName = `${KEYCHAIN_SERVICE}_${storedName}`;
        const credentials = await Keychain.getGenericPassword({ service: serviceName });
        if (credentials) {
          setStoredUsername(storedName || 'User');
          setHasAccount(true);
          if (isExplicitLogout) {
            setShowQuickLogin(false);
            setIsSignUpMode(false);
          } else {
            setShowQuickLogin(true);
            setIsSignUpMode(false);
          }
          setIsLoading(false);
          return;
        }
      }

      if (existingUsers.length > 0) {
        setHasAccount(true);
        setIsSignUpMode(false);
        setShowQuickLogin(false);
      } else {
        setHasAccount(false);
        setIsSignUpMode(true);
        setShowQuickLogin(false);
      }
    } catch (error) {
      console.error('Error checking existing user:', error);
      setHasAccount(false);
      setIsSignUpMode(true);
      setShowQuickLogin(false);
    } finally {
      setIsLoading(false);
    }
  };

  const checkBiometrics = async () => {
    try {
      const rnBiometrics = new ReactNativeBiometrics();
      const result = await rnBiometrics.isSensorAvailable();
      if (result?.available === true) {
        setBiometricsAvailable(true);
      } else {
        setBiometricsAvailable(false);
      }
    } catch (error) {
      setBiometricsAvailable(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const rnBiometrics = new ReactNativeBiometrics();
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Authenticate to log in',
        cancelButtonText: 'Cancel',
      });

      if (success) {
        setError('');
        onLoginSuccess();
      } else {
        setError('Biometric authentication cancelled');
      }
    } catch (error: any) {
      console.error('Biometric authentication error:', error);
      setError('Biometric authentication failed. Please use your PIN.');
    }
  };

  // 2. UPDATED: Handle Sign Up with Check
  const handleSignUp = async () => {
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!pin.trim()) {
      setError('Please enter a PIN');
      return;
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    try {
      const newUsername = username.trim();

      // A. Get the list of all existing users
      const existingUsersJson = await AsyncStorage.getItem(STORAGE_KEY_ALL_USERS);
      let existingUsers: string[] = existingUsersJson ? JSON.parse(existingUsersJson) : [];

      // B. Check if username exists
      if (existingUsers.includes(newUsername)) {
        // This sets the error message which is styled in RED in your return JSX
        setError('Username already exists'); 
        return;
      }

      // C. If not exists, add to the list and save back
      existingUsers.push(newUsername);
      await AsyncStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(existingUsers));

      // D. Proceed with standard login (save current active user)
      await AsyncStorage.setItem(STORAGE_KEY_USERNAME, newUsername);

      // Save PIN to Keychain under a per-user service
      const serviceName = `${KEYCHAIN_SERVICE}_${newUsername}`;
      await Keychain.setGenericPassword(newUsername, pin, { service: serviceName });
      
      // Clear form
      setUsername('');
      setPin('');
      setError('');
      
      // Call success callback
      // Notify contexts that the active user changed
      DeviceEventEmitter.emit('userChanged');
      onLoginSuccess();
    } catch (error) {
      console.error('Error during sign up:', error);
      setError('Failed to save credentials. Please try again.');
    }
  };

  // ... (keep handleSignIn, handleDeleteAccount, toggleMode, and the return/styles exactly the same) ...
  const handleSignIn = async () => {
    if (!pin.trim()) {
      setError('Please enter your PIN');
      return;
    }

    try {
      if (showQuickLogin) {
        const currentStored = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
        if (currentStored) {
          const serviceName = `${KEYCHAIN_SERVICE}_${currentStored}`;
          const storedCreds = await Keychain.getGenericPassword({ service: serviceName });
          if (storedCreds && storedCreds.password === pin) {
            setPin('');
            setUsername('');
            setError('');
            DeviceEventEmitter.emit('userChanged');
            onLoginSuccess();
            return;
          }
        }

        setError('Incorrect PIN');
        setPin('');
        return;
      } else {
        if (!username.trim()) {
          setError('Please enter your username');
          return;
        }

        const serviceName = `${KEYCHAIN_SERVICE}_${username.trim()}`;
        const storedCreds = await Keychain.getGenericPassword({ service: serviceName });

        if (storedCreds && storedCreds.password === pin) {
          await AsyncStorage.setItem(STORAGE_KEY_USERNAME, username.trim());
          setPin('');
          setUsername('');
          setError('');
          DeviceEventEmitter.emit('userChanged');
          onLoginSuccess();
        } else {
          setError('Incorrect username or PIN');
          setPin('');
        }
      }
    } catch (error) {
      console.error('Error during sign in:', error);
      setError('Failed to verify credentials. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // Remove keychain entry for current user
      const currentUsername = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      if (currentUsername) {
        const serviceName = `${KEYCHAIN_SERVICE}_${currentUsername}`;
        await Keychain.resetGenericPassword({ service: serviceName });
      }
      // Remove per-user watchlist and username
      try {
        if (currentUsername) {
          const watchlistKey = `@finai_watchlist_${currentUsername}`;
          await AsyncStorage.removeItem(watchlistKey);
        }
      } catch (err) {
        console.warn('Failed removing per-user watchlist during account deletion', err);
      }
      await AsyncStorage.removeItem(STORAGE_KEY_USERNAME);
      DeviceEventEmitter.emit('userChanged');
      setHasAccount(false);
      setIsSignUpMode(true);
      setStoredUsername('');
      setPin('');
      setUsername('');
      setError('');
    } catch (error) {
      console.error('Error deleting account:', error);
      setError('Failed to delete account. Please try again.');
    }
  };

  const toggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setPin('');
    setUsername('');
    setError('');
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Image
            source={require('../assets/FINAI.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>
            {isSignUpMode ? 'Welcome to FinanceAI' : showQuickLogin ? `Welcome back, ${storedUsername}` : 'Log In to FinanceAI'}
          </Text>

          {isSignUpMode && (
            <>
              <TextInput
                label="Create Your Username"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setError('');
                }}
                mode="outlined"
                style={styles.input}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
                textColor={palette.text}
                theme={{
                  colors: {
                    onSurfaceVariant: palette.mutedText,
                    background: palette.surface,
                  },
                }}
              />
              <TextInput
                label="Create PIN"
                value={pin}
                onChangeText={(text) => {
                  setPin(text);
                  setError('');
                }}
                mode="outlined"
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                style={styles.input}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
                textColor={palette.text}
                theme={{
                  colors: {
                    onSurfaceVariant: palette.mutedText,
                    background: palette.surface,
                  },
                }}
              />
            </>
          )}

          {!isSignUpMode && (
            <>
              {!showQuickLogin && (
                <TextInput
                  label="Enter Your Username"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setError('');
                  }}
                  mode="outlined"
                  style={styles.input}
                  outlineColor={palette.border}
                  activeOutlineColor={palette.primary}
                  textColor={palette.text}
                  theme={{
                    colors: {
                      onSurfaceVariant: palette.mutedText,
                      background: palette.surface,
                    },
                  }}
                />
              )}
              <TextInput
                label="Enter Your PIN"
                value={pin}
                onChangeText={(text) => {
                  setPin(text);
                  setError('');
                }}
                mode="outlined"
                secureTextEntry
                keyboardType="numeric"
                maxLength={6}
                style={styles.input}
                outlineColor={palette.border}
                activeOutlineColor={palette.primary}
                textColor={palette.text}
                theme={{
                  colors: {
                    onSurfaceVariant: palette.mutedText,
                    background: palette.surface,
                  },
                }}
              />
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            mode="contained"
            onPress={isSignUpMode ? handleSignUp : handleSignIn}
            style={styles.button}
            buttonColor={palette.primary}
            textColor="#FFFFFF">
            {isSignUpMode ? 'Sign Up' : 'Log In'}
          </Button>

          {!isSignUpMode && biometricsAvailable && (
            <TouchableOpacity onPress={handleBiometricLogin} style={styles.biometricButton}>
              <Icon name="finger-print" size={24} color={palette.primary} />
              <Text style={styles.biometricText}>Use Biometrics</Text>
            </TouchableOpacity>
          )}

          <View style={styles.toggleContainer}>
            <Text style={styles.toggleText}>
              {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={toggleMode}>
              <Text style={styles.toggleLink}>
                {isSignUpMode ? 'Log In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    marginBottom: 16,
  },
  button: {
    width: '100%',
    marginTop: 8,
    paddingVertical: 6,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  toggleText: {
    color: palette.mutedText,
    fontSize: 14,
  },
  toggleLink: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: palette.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  biometricText: {
    color: palette.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    width: '100%',
    marginTop: 8,
  },
  errorText: {
    color: palette.error,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: palette.text,
    textAlign: 'center',
  },
});