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
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette } from '@/theme';

const STORAGE_KEY_USERNAME = 'username';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  isExplicitLogout?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isExplicitLogout = false }) => {
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

  const checkExistingUser = async () => {
    try {
      // Check if PIN exists in Keychain
      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
      
      if (credentials) {
        // PIN exists
        const name = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
        setStoredUsername(name || 'User');
        setHasAccount(true);
        
        // If explicit logout, show full login form; otherwise show quick login
        if (isExplicitLogout) {
          setShowQuickLogin(false);
          setIsSignUpMode(false);
        } else {
          setShowQuickLogin(true);
          setIsSignUpMode(false);
        }
      } else {
        // No PIN, show sign up screen
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
      
      // Check if result exists and has the available property
      if (result?.available === true) {
        setBiometricsAvailable(true);
      } else {
        setBiometricsAvailable(false);
      }
    } catch (error) {
      // Silently fail - biometrics not available on this device/emulator
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
        // Biometric authentication successful
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
      // Save username to AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY_USERNAME, username.trim());
      
      // Save PIN to Keychain
      await Keychain.setGenericPassword('user', pin, { service: KEYCHAIN_SERVICE });
      
      // Clear form
      setUsername('');
      setPin('');
      setError('');
      
      // Call success callback
      onLoginSuccess();
    } catch (error) {
      console.error('Error during sign up:', error);
      setError('Failed to save credentials. Please try again.');
    }
  };

  const handleSignIn = async () => {
    if (!pin.trim()) {
      setError('Please enter your PIN');
      return;
    }

    try {
      // Get stored username from AsyncStorage
      const storedUser = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      
      // Get stored PIN from Keychain
      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
      
      // If quick login (Welcome back), only check PIN
      if (showQuickLogin) {
        if (credentials && credentials.password === pin) {
          setPin('');
          setUsername('');
          setError('');
          onLoginSuccess();
        } else {
          setError('Incorrect PIN');
          setPin('');
        }
      } else {
        // Full login - check both username and PIN
        if (!username.trim()) {
          setError('Please enter your username');
          return;
        }
        
        if (credentials && credentials.password === pin && storedUser === username.trim()) {
          setPin('');
          setUsername('');
          setError('');
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
      // Clear PIN from Keychain
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
      
      // Clear username from AsyncStorage
      await AsyncStorage.removeItem(STORAGE_KEY_USERNAME);
      
      // Reset state to show sign up form
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
          {/* Logo */}
          <Image
            source={require('../assets/FINAI.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Title */}
          <Text style={styles.title}>
            {isSignUpMode ? 'Welcome to FinanceAI' : showQuickLogin ? `Welcome back, ${storedUsername}` : 'Log In to FinanceAI'}
          </Text>

          {/* Sign Up Form */}
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

          {/* Login Form */}
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

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={isSignUpMode ? handleSignUp : handleSignIn}
            style={styles.button}
            buttonColor={palette.primary}
            textColor="#FFFFFF">
            {isSignUpMode ? 'Sign Up' : 'Log In'}
          </Button>

          {/* Biometric Login Button (only for login, not sign up) */}
          {!isSignUpMode && biometricsAvailable && (
            <TouchableOpacity onPress={handleBiometricLogin} style={styles.biometricButton}>
              <Icon name="finger-print" size={24} color={palette.primary} />
              <Text style={styles.biometricText}>Use Biometrics</Text>
            </TouchableOpacity>
          )}

          {/* Toggle Link */}
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
