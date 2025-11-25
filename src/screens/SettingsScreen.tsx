import React from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';
import { SurfaceCard } from '@/components';
import { palette, spacing } from '@/theme';
import { useAuth } from '../../App';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Must match the LoginScreen keys
const STORAGE_KEY_USERNAME = 'username';
const STORAGE_KEY_ALL_USERS = 'registered_users';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

export const SettingsScreen = () => {
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
                const watchlistKey = `@finai_watchlist_${currentUsername}`;
                await AsyncStorage.removeItem(watchlistKey);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SurfaceCard style={styles.profileCard}>
        <View style={styles.profileInner}>
          <View style={styles.avatar}>
            <Icon name="person" size={36} color="#ffffff" />
          </View>
          <Text style={styles.loggedText}>Logged in as</Text>
          <Text style={styles.username}>{activeUser || '—'}</Text>
        </View>
      </SurfaceCard>

      <Text style={styles.actionsHeader}>Account Actions</Text>

      <TouchableOpacity onPress={handleLogout}>
        <SurfaceCard style={styles.logoutCard}>
          <View style={styles.settingRow}>
            <Icon name="log-out-outline" size={20} color={palette.text} />
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Log Out</Text>
              <Text style={styles.settingDesc}>Sign out of your account</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={palette.mutedText} />
          </View>
        </SurfaceCard>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleDeleteAccount}>
        <SurfaceCard style={styles.deleteCard}>
          <View style={styles.settingRow}>
            <Icon name="trash-outline" size={20} color={palette.background} />
            <View style={styles.settingText}>
              <Text style={styles.deleteTitle}>Delete Account</Text>
              <Text style={[styles.settingDesc, { color: palette.background }]}>Permanently remove your account</Text>
            </View>
          </View>
        </SurfaceCard>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.md,
  },
  settingCard: {
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDesc: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  profileCard: {
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
  },
  profileInner: {
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  loggedText: {
    color: palette.mutedText,
    fontSize: 13,
    marginBottom: 6,
  },
  username: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
  },
  actionsHeader: {
    color: palette.primary,
    fontSize: 13,
    marginVertical: spacing.md,
    fontWeight: '700',
  },
  logoutCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
  deleteCard: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: palette.danger,
  },
  deleteTitle: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },
});