import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Text,
  ActivityIndicator,
  DeviceEventEmitter,
  Dimensions,
} from 'react-native';
import { 
  User, 
  Lock, 
  Fingerprint, 
  ArrowRight, 
  AlertCircle,
  ShieldCheck 
} from 'lucide-react-native';
import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, spacing, layout } from '@/theme';
import crypto from 'react-native-quick-crypto';
import { attemptPinMigrationOnLogin } from '@/utils/pinMigration';

// --- LOGIC CONSTANTS ---
const STORAGE_KEY_USERNAME = 'username';
const STORAGE_KEY_ALL_USERS = 'registered_users';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION = 30000; // 30 seconds in milliseconds

// --- SECURITY UTILITIES ---
/**
 * Hash a PIN using PBKDF2 with SHA-256
 * @param pin - The PIN to hash
 * @param salt - Salt for the hash (username is used as salt)
 * @returns Hashed PIN as hex string
 */
const hashPin = (pin: string, salt: string): string => {
  try {
    // Use PBKDF2 with 100,000 iterations for strong security
    const hash = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
    return hash.toString('hex');
  } catch (error) {
    console.error('Error hashing PIN:', error);
    throw error;
  }
};

interface LoginScreenProps {
  onLoginSuccess: () => void;
  isExplicitLogout?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isExplicitLogout = false }) => {
  // --- STATE MANAGEMENT (Preserved) ---
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [isSignUpMode, setIsSignUpMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [storedUsername, setStoredUsername] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showQuickLogin, setShowQuickLogin] = useState<boolean>(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean>(false);
  
  // --- BRUTE-FORCE PROTECTION STATE ---
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutEndTime, setLockoutEndTime] = useState<number>(0);
  const [remainingLockoutTime, setRemainingLockoutTime] = useState<number>(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- EFFECTS (Preserved) ---
  useEffect(() => {
    checkExistingUser();
    checkBiometrics();
    checkLockoutStatus();
    
    return () => {
      if (lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
      }
    };
  }, []);
  
  // Update remaining lockout time every second
  useEffect(() => {
    if (isLockedOut && lockoutEndTime > Date.now()) {
      lockoutTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, lockoutEndTime - Date.now());
        setRemainingLockoutTime(remaining);
        
        if (remaining === 0) {
          setIsLockedOut(false);
          setFailedAttempts(0);
          if (lockoutTimerRef.current) {
            clearInterval(lockoutTimerRef.current);
          }
        }
      }, 1000);
      
      return () => {
        if (lockoutTimerRef.current) {
          clearInterval(lockoutTimerRef.current);
        }
      };
    }
  }, [isLockedOut, lockoutEndTime]);

  // --- LOGIC FUNCTIONS (Preserved) ---
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
  
  const checkLockoutStatus = async () => {
    try {
      const lockoutData = await AsyncStorage.getItem('login_lockout');
      if (lockoutData) {
        const { endTime, attempts } = JSON.parse(lockoutData);
        const now = Date.now();
        
        if (endTime > now) {
          setIsLockedOut(true);
          setLockoutEndTime(endTime);
          setRemainingLockoutTime(endTime - now);
          setFailedAttempts(attempts);
        } else {
          // Lockout expired, clear it
          await AsyncStorage.removeItem('login_lockout');
          setFailedAttempts(0);
        }
      }
    } catch (error) {
      console.error('Error checking lockout status:', error);
    }
  };
  
  const handleFailedAttempt = async () => {
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);
    
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const endTime = Date.now() + LOCKOUT_DURATION;
      setIsLockedOut(true);
      setLockoutEndTime(endTime);
      setRemainingLockoutTime(LOCKOUT_DURATION);
      
      // Persist lockout state
      await AsyncStorage.setItem('login_lockout', JSON.stringify({
        endTime,
        attempts: newAttempts
      }));
      
      setError(`Too many failed attempts. Locked out for ${LOCKOUT_DURATION / 1000} seconds.`);
    } else {
      setError('Incorrect PIN');
    }
  };
  
  const resetFailedAttempts = async () => {
    setFailedAttempts(0);
    await AsyncStorage.removeItem('login_lockout');
  };

  const handleBiometricLogin = async () => {
    if (isLockedOut) {
      const seconds = Math.ceil(remainingLockoutTime / 1000);
      setError(`Account locked. Please wait ${seconds} second${seconds !== 1 ? 's' : ''}.`);
      return;
    }
    
    try {
      const rnBiometrics = new ReactNativeBiometrics();
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Authenticate to log in',
        cancelButtonText: 'Cancel',
      });

      if (success) {
        setError('');
        await resetFailedAttempts();
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
      const newUsername = username.trim();
      const existingUsersJson = await AsyncStorage.getItem(STORAGE_KEY_ALL_USERS);
      let existingUsers: string[] = existingUsersJson ? JSON.parse(existingUsersJson) : [];

      if (existingUsers.includes(newUsername)) {
        setError('Username already exists'); 
        return;
      }

      existingUsers.push(newUsername);
      await AsyncStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(existingUsers));
      await AsyncStorage.setItem(STORAGE_KEY_USERNAME, newUsername);

      // Hash the PIN before storing (username is used as salt)
      const hashedPin = hashPin(pin, newUsername);
      
      const serviceName = `${KEYCHAIN_SERVICE}_${newUsername}`;
      await Keychain.setGenericPassword(newUsername, hashedPin, { service: serviceName });
      
      setUsername('');
      setPin('');
      setError('');
      
      DeviceEventEmitter.emit('userChanged');
      onLoginSuccess();
    } catch (error) {
      console.error('Error during sign up:', error);
      setError('Failed to save credentials. Please try again.');
    }
  };

  const handleSignIn = async () => {
    if (isLockedOut) {
      const seconds = Math.ceil(remainingLockoutTime / 1000);
      setError(`Account locked. Please wait ${seconds} second${seconds !== 1 ? 's' : ''}.`);
      return;
    }
    
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
          
          if (storedCreds) {
            // Hash the entered PIN with username as salt
            const hashedInputPin = hashPin(pin, currentStored);
            
            if (storedCreds.password === hashedInputPin) {
              setPin('');
              setUsername('');
              setError('');
              await resetFailedAttempts();
              DeviceEventEmitter.emit('userChanged');
              onLoginSuccess();
              return;
            }
            
            // Attempt migration for existing users with plain-text PINs
            const migrated = await attemptPinMigrationOnLogin(currentStored, pin);
            if (migrated) {
              setPin('');
              setUsername('');
              setError('');
              await resetFailedAttempts();
              DeviceEventEmitter.emit('userChanged');
              onLoginSuccess();
              return;
            }
          }
        }
        await handleFailedAttempt();
        setPin('');
        return;
      } else {
        if (!username.trim()) {
          setError('Please enter your username');
          return;
        }

        const usernameTrimmed = username.trim();
        const serviceName = `${KEYCHAIN_SERVICE}_${usernameTrimmed}`;
        const storedCreds = await Keychain.getGenericPassword({ service: serviceName });

        if (storedCreds) {
          // Hash the entered PIN with username as salt
          const hashedInputPin = hashPin(pin, usernameTrimmed);
          
          if (storedCreds.password === hashedInputPin) {
            await AsyncStorage.setItem(STORAGE_KEY_USERNAME, usernameTrimmed);
            setPin('');
            setUsername('');
            setError('');
            await resetFailedAttempts();
            DeviceEventEmitter.emit('userChanged');
            onLoginSuccess();
            return;
          }
          
          // Attempt migration for existing users with plain-text PINs
          const migrated = await attemptPinMigrationOnLogin(usernameTrimmed, pin);
          if (migrated) {
            await AsyncStorage.setItem(STORAGE_KEY_USERNAME, usernameTrimmed);
            setPin('');
            setUsername('');
            setError('');
            await resetFailedAttempts();
            DeviceEventEmitter.emit('userChanged');
            onLoginSuccess();
            return;
          }
        }
        
        await handleFailedAttempt();
        setPin('');
      }
    } catch (error) {
      console.error('Error during sign in:', error);
      setError('Failed to verify credentials. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    // Preserved specifically requested functionality, though not used in UI yet
    try {
      const currentUsername = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
      if (currentUsername) {
        const serviceName = `${KEYCHAIN_SERVICE}_${currentUsername}`;
        await Keychain.resetGenericPassword({ service: serviceName });
      }
      try {
        if (currentUsername) {
          const watchlistKey = `@finai_watchlist_${currentUsername}`;
          await AsyncStorage.removeItem(watchlistKey);
        }
      } catch (err) {
        console.warn('Failed removing per-user watchlist', err);
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
      setError('Failed to delete account.');
    }
  };

  const toggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setPin('');
    setUsername('');
    setError('');
  };

  // --- RENDER HELPERS ---

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Securing connection...</Text>
      </View>
    );
  }

  // --- NEW UI IMPLEMENTATION ---
  
  const headerTitle = isSignUpMode 
    ? 'Create Account' 
    : showQuickLogin 
      ? `Welcome back, ${storedUsername}` 
      : 'Access Terminal';
      
  const headerSubtitle = isSignUpMode
    ? 'Initialize your secure financial profile.'
    : 'Enter credentials to continue.';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        
        {/* Brand Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
             {/* Note: Ensure the image path is correct, kept from your code */}
            <Image
              source={require('../assets/FINAI.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appTitle}>FINAI</Text>
          <Text style={styles.appSubtitle}>INTELLIGENT ASSET</Text>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          <View style={styles.textGroup}>
            <Text style={styles.heading}>{headerTitle}</Text>
            <Text style={styles.subHeading}>{headerSubtitle}</Text>
          </View>

          {/* Username Input (Hidden during Quick Login) */}
          {(isSignUpMode || (!isSignUpMode && !showQuickLogin)) && (
            <View style={styles.inputWrapper}>
              <View style={styles.inputIcon}>
                <User size={20} color={palette.mutedText} />
              </View>
              <TextInput
                placeholder="Username"
                placeholderTextColor={palette.mutedText}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setError('');
                }}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
          )}

          {/* PIN Input */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Lock size={20} color={palette.mutedText} />
            </View>
            <TextInput
              placeholder="Enter PIN"
              placeholderTextColor={palette.mutedText}
              value={pin}
              onChangeText={(text) => {
                setPin(text);
                setError('');
              }}
              style={styles.input}
              secureTextEntry
              keyboardType="numeric"
              maxLength={6}
            />
          </View>

          {/* Lockout Warning */}
          {isLockedOut && (
            <View style={styles.lockoutContainer}>
              <ShieldCheck size={20} color={palette.warning} />
              <View style={styles.lockoutTextContainer}>
                <Text style={styles.lockoutTitle}>Security Lockout Active</Text>
                <Text style={styles.lockoutText}>
                  Too many failed attempts. Retry in {Math.ceil(remainingLockoutTime / 1000)}s
                </Text>
              </View>
            </View>
          )}

          {/* Error Message */}
          {error && !isLockedOut ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={16} color={palette.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary Action Button */}
          <TouchableOpacity
            onPress={isSignUpMode ? handleSignUp : handleSignIn}
            style={[
              styles.primaryButton, 
              isLockedOut && !isSignUpMode && styles.primaryButtonDisabled
            ]}
            activeOpacity={layout.activeOpacity}
            disabled={isLockedOut && !isSignUpMode}>
            <Text style={styles.primaryButtonText}>
              {isSignUpMode ? 'Initialize Account' : 'Authenticate'}
            </Text>
            <ArrowRight size={20} color={palette.background} strokeWidth={2.5} />
          </TouchableOpacity>

          {/* Biometric Button */}
          {!isSignUpMode && biometricsAvailable && (
            <TouchableOpacity 
              onPress={handleBiometricLogin} 
              style={[styles.bioButton, isLockedOut && styles.bioButtonDisabled]}
              activeOpacity={layout.activeOpacity}
              disabled={isLockedOut}>
              <Fingerprint size={24} color={isLockedOut ? palette.mutedText : palette.accent} />
              <Text style={[styles.bioButtonText, isLockedOut && styles.bioButtonTextDisabled]}>
                Biometric Access
              </Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
          </View>

          {/* Mode Switcher */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isSignUpMode ? 'Existing user?' : 'New to FinAI?'}
            </Text>
            <TouchableOpacity onPress={toggleMode}>
              <Text style={styles.footerLink}>
                {isSignUpMode ? 'Log In' : 'Create ID'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Safe Area Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  
  // Header Styles
  headerSection: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  logoContainer: {
    marginBottom: spacing.md,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  logo: {
    width: 80,
    height: 80,
    tintColor: palette.primary, // Applies white tint to logo if strictly monochrome
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: 6,
  },
  appSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: palette.accent,
    letterSpacing: 3,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },

  // Form Styles
  formContainer: {
    width: '100%',
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
  },
  textGroup: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subHeading: {
    fontSize: 14,
    color: palette.mutedText,
    textAlign: 'center',
  },
  
  // Inputs
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceHighlight,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12, // Slightly tighter radius for inputs
    marginBottom: spacing.md,
    height: 56,
  },
  inputIcon: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    height: '100%',
    paddingRight: spacing.md,
  },
  
  // States
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // Red with opacity
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    flex: 1,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    height: 56,
    borderRadius: 12,
    marginTop: spacing.xs,
    gap: spacing.sm,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    color: palette.background, // Black text on white button
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: spacing.sm,
    backgroundColor: 'transparent',
  },
  bioButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
  },
  bioButtonDisabled: {
    opacity: 0.4,
  },
  bioButtonTextDisabled: {
    color: palette.mutedText,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },

  // Security Status
  lockoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.1)', // Amber/warning color with opacity
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  lockoutTextContainer: {
    flex: 1,
  },
  lockoutTitle: {
    color: palette.warning || '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  lockoutText: {
    color: palette.warning || '#f59e0b',
    fontSize: 12,
  },
  attemptWarning: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  attemptWarningText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: '600',
  },

  // Footer
  dividerContainer: {
    marginVertical: spacing.lg,
    alignItems: 'center',
  },
  dividerLine: {
    width: 40,
    height: 2,
    backgroundColor: palette.border,
    borderRadius: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerText: {
    color: palette.mutedText,
    fontSize: 14,
  },
  footerLink: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});