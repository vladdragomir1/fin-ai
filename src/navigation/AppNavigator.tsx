import React from 'react';
import { NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { palette } from '@/theme';
import {
  AIChatScreen,
  CompanyDetailsScreen,
  CompanySearchScreen,
  HomeScreen,
  SettingsScreen,
  StatisticsScreen,
  WatchlistScreen,
} from '@/screens';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: palette.primary,
    background: palette.background,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    notification: palette.accent,
  },
  fonts: {
    regular: {
      fontFamily: 'System',
      fontWeight: '400',
    },
    medium: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    bold: {
      fontFamily: 'System',
      fontWeight: '700',
    },
    heavy: {
      fontFamily: 'System',
      fontWeight: '900',
    },
  },
};

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: palette.surface,
        borderTopColor: palette.border,
        height: 64,
        paddingBottom: 10,
        paddingTop: 6,
      },
      tabBarActiveTintColor: palette.primary,
      tabBarInactiveTintColor: palette.mutedText,
      // eslint-disable-next-line react/no-unstable-nested-components
      tabBarIcon: ({ color, size }) => {
        const icons: Record<string, string> = {
          Home: 'home',
          Search: 'briefcase',
          Watchlist: 'star',
          Statistics: 'bar-chart',
          AI: 'flash',
        };
        return <Icon name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
      },
    })}>
    <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
    <Tab.Screen name="Search" component={CompanySearchScreen} options={{ title: 'Search' }} />
    <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: 'Watchlist' }} />
    <Tab.Screen name="Statistics" component={StatisticsScreen} options={{ title: 'Statistics' }} />
    <Tab.Screen name="AI" component={AIChatScreen} options={{ title: 'AI Analyst' }} />
  </Tab.Navigator>
);

export const AppNavigator = () => (
  <NavigationContainer theme={navigationTheme}>
    <Stack.Navigator>
      <Stack.Screen name="Root" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: 'card',
          title: 'Settings',
          headerStyle: { backgroundColor: palette.surface },
          headerTitleStyle: { color: palette.text },
          headerTintColor: palette.text,
        }}
      />
      <Stack.Screen
        name="CompanyDetails"
        component={CompanyDetailsScreen}
        options={{
          presentation: 'card',
          title: 'Company Details',
          headerStyle: { backgroundColor: palette.surface },
          headerTitleStyle: { color: palette.text },
          headerTintColor: palette.text,
        }}
      />
    </Stack.Navigator>
  </NavigationContainer>
);
