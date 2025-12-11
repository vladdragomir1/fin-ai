import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import crypto from 'react-native-quick-crypto';

const KEYCHAIN_SERVICE = 'FinanceAI_PIN';
const MIGRATION_FLAG_KEY = '@pin_migration_completed';
const STORAGE_KEY_ALL_USERS = 'registered_users';

/**
 * Hash a PIN using PBKDF2 with SHA-256
 */
const hashPin = (pin: string, salt: string): string => {
  const hash = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
  return hash.toString('hex');
};

/**
 * Check if migration has already been completed
 */
export const isMigrationCompleted = async (): Promise<boolean> => {
  try {
    const flag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    return flag === 'true';
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
};

export const migrateExistingPins = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    // Check if migration already completed
    const completed = await isMigrationCompleted();
    if (completed) {
      return {
        success: true,
        message: 'Migration already completed',
      };
    }

    // Get all registered users
    const usersJson = await AsyncStorage.getItem(STORAGE_KEY_ALL_USERS);
    if (!usersJson) {
      // No users to migrate
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      return {
        success: true,
        message: 'No users to migrate',
      };
    }

    const users: string[] = JSON.parse(usersJson);
    
    console.log(`Found ${users.length} users. Migration strategy:`);
    console.log('1. Existing users will need to reset their PIN on first login');
    console.log('2. All new PINs will be hashed automatically');
    
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    
    return {
      success: true,
      message: `Migration marked complete. ${users.length} users may need to reset PIN.`,
    };
  } catch (error) {
    console.error('Error during PIN migration:', error);
    return {
      success: false,
      message: `Migration failed: ${error}`,
    };
  }
};

/**
 * Check if a stored PIN is likely hashed (64 hex characters = 32 bytes)
 * vs plain text (4-6 numeric characters)
 */
export const isPinHashed = (pin: string): boolean => {
  // Hashed PINs are 64 character hex strings (32 bytes in hex)
  // Plain PINs are 4-6 numeric characters
  return /^[a-f0-9]{64}$/i.test(pin);
};

/**
 * Attempt to migrate a single user's PIN during login
 * This is called when a user fails to login with the new hashing system
 */
export const attemptPinMigrationOnLogin = async (
  username: string,
  enteredPin: string
): Promise<boolean> => {
  try {
    const serviceName = `${KEYCHAIN_SERVICE}_${username}`;
    const stored = await Keychain.getGenericPassword({ service: serviceName });
    
    if (!stored) {
      return false;
    }
    
    // Check if stored PIN is plain text (not hashed)
    if (!isPinHashed(stored.password)) {
      // It's a plain text PIN, check if entered PIN matches
      if (stored.password === enteredPin) {
        // Migrate to hashed PIN
        const hashedPin = hashPin(enteredPin, username);
        await Keychain.setGenericPassword(username, hashedPin, { service: serviceName });
        console.log(`✅ Migrated PIN for user: ${username}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error during PIN migration on login:', error);
    return false;
  }
};
