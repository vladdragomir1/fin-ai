import React from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/Ionicons';
import { SurfaceCard } from '@/components';
import { palette, spacing } from '@/theme';
import { useAuth } from '../../App';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const STORAGE_KEY_USERNAME = 'username';
const KEYCHAIN_SERVICE = 'FinanceAI_PIN';

export const SettingsScreen = () => {
  const { logout } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          onPress: () => logout(),
          style: 'destructive',
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
              await AsyncStorage.removeItem(STORAGE_KEY_USERNAME);
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
      <TouchableOpacity onPress={handleLogout}>
        <SurfaceCard style={styles.settingCard}>
          <View style={styles.settingRow}>
            <Icon name="log-out-outline" size={24} color={palette.text} />
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Log Out</Text>
              <Text style={styles.settingDesc}>Sign out of your account</Text>
            </View>
          </View>
        </SurfaceCard>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleDeleteAccount}>
        <SurfaceCard style={styles.settingCard}>
          <View style={styles.settingRow}>
            <Icon name="trash-outline" size={24} color={palette.danger} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: palette.danger }]}>Delete Account</Text>
              <Text style={styles.settingDesc}>Permanently remove your account</Text>
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
});
