import React from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, ScrollView, Text } from 'react-native';
import { 
  User, 
  LogOut, 
  Trash2, 
  ChevronRight, 
  ShieldCheck, 
  WalletCards 
} from 'lucide-react-native';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import { useAuth } from '../../App';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// --- LOGIC CONSTANTS (Preserved) ---
const STORAGE_KEY_USERNAME = 'username';
const STORAGE_KEY_ALL_USERS = 'registered_users';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

export const SettingsScreen = () => {
  // --- HOOKS & STATE (Preserved) ---
  const { logout } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const [activeUser, setActiveUser] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const name = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);
        if (mounted) setActiveUser(name);
      } catch (err) {
        console.warn('Failed loading active username in Settings', err);
      }
    };

    load();

    const sub = DeviceEventEmitter.addListener('userChanged', load);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // --- HANDLERS (Preserved) ---
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', onPress: () => logout(), style: 'destructive' },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              // 1. Get the current username
              const currentUsername = await AsyncStorage.getItem(STORAGE_KEY_USERNAME);

              // 2. Remove it from the list of ALL users
              if (currentUsername) {
                const existingUsersJson = await AsyncStorage.getItem(STORAGE_KEY_ALL_USERS);
                if (existingUsersJson) {
                   const existingUsers: string[] = JSON.parse(existingUsersJson);
                   // Filter out the deleted user
                   const updatedUsers = existingUsers.filter(u => u !== currentUsername);
                   await AsyncStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(updatedUsers));
                }
              }

              // 3. Clear Login Credentials (per-user keychain)
              if (currentUsername) {
                const serviceName = `${KEYCHAIN_SERVICE}_${currentUsername}`;
                await Keychain.resetGenericPassword({ service: serviceName });
              } else {
                // Fallback: try global keychain reset
                await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
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
              // Notify contexts that user changed
              DeviceEventEmitter.emit('userChanged');
              
              logout();
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
          style: 'destructive',
        },
      ],
    );
  };

  // --- UI COMPONENTS ---
  const SettingRow = ({ 
    icon: Icon, 
    label, 
    subLabel, 
    onPress, 
    isDanger = false 
  }: { 
    icon: any, 
    label: string, 
    subLabel?: string, 
    onPress: () => void, 
    isDanger?: boolean 
  }) => (
    <TouchableOpacity 
      style={[styles.row, isDanger && styles.rowDanger]} 
      onPress={onPress}
      activeOpacity={layout.activeOpacity}
    >
      <View style={[styles.iconContainer, isDanger && styles.iconDanger]}>
        <Icon size={20} color={isDanger ? palette.danger : palette.text} strokeWidth={1.5} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, isDanger && styles.textDanger]}>{label}</Text>
        {subLabel && <Text style={styles.rowSubLabel}>{subLabel}</Text>}
      </View>
      {!isDanger && <ChevronRight size={16} color={palette.surfaceHighlight} />}
    </TouchableOpacity>
  );

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <View style={styles.profileCard}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <User size={32} color={palette.primary} strokeWidth={1.5} />
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.username}>{activeUser || 'Guest User'}</Text>
              <View style={styles.statusBadge}>
                <ShieldCheck size={10} color={palette.success} />
                <Text style={styles.statusText}>Secure Session Active</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT MANAGEMENT</Text>
          
          <View style={styles.cardGroup}>
            <SettingRow 
              icon={WalletCards} 
              label="Subscription Plan" 
              subLabel="Standard Tier (Free)"
              onPress={() => {}} 
            />
            <View style={styles.divider} />
            <SettingRow 
              icon={LogOut} 
              label="Log Out" 
              subLabel="End current session safely"
              onPress={handleLogout} 
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>DANGER ZONE</Text>
          <View style={[styles.cardGroup, styles.dangerGroup]}>
            <SettingRow 
              icon={Trash2} 
              label="Delete Account" 
              subLabel="Permanently erase all personal data"
              onPress={handleDeleteAccount}
              isDanger
            />
          </View>
        </View>

        <Text style={styles.versionText}>FinAI Terminal v1.0.4</Text>
      </ScrollView>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Profile
  profileSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatarRing: {
    padding: 3,
    borderWidth: 1,
    borderColor: palette.surfaceHighlight,
    borderRadius: 99,
    marginRight: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    color: palette.success,
    fontSize: 12,
    fontWeight: '500',
  },

  // Section
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  dangerGroup: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  rowDanger: {
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  textDanger: {
    color: palette.danger,
  },
  rowSubLabel: {
    color: palette.mutedText,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: palette.surfaceHighlight,
    marginLeft: 64, // offset for icon width
  },

  versionText: {
    textAlign: 'center',
    color: palette.surfaceHighlight,
    fontSize: 12,
    marginTop: spacing.lg,
  },
});