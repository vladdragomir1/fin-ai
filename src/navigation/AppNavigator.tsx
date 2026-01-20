import React from 'react';
import { NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { 
  LayoutDashboard, 
  Search, 
  Star, 
  BarChart2, 
  Sparkles 
} from 'lucide-react-native'; 
import { palette } from '@/theme';
import {
  AIChatScreen,
  CompanyDetailsScreen,
  CompanySearchScreen,
  HomeScreen,
  SettingsScreen,
  StatisticsScreen,
  WatchlistScreen,
  MarketMoversScreen,
  BrowseStocksScreen,
} from '@/screens';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Define the Deep Dark Navigation Theme
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
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: palette.surface,
        borderTopColor: palette.border,
        borderTopWidth: 1,
        elevation: 0, 
        height: 60,   
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarActiveTintColor: palette.primary, 
      tabBarInactiveTintColor: palette.mutedText, 
      tabBarLabelStyle: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
      },
      tabBarIcon: ({ color, size, focused }) => {
        const iconSize = 22;
        const strokeWidth = focused ? 2.5 : 1.5;

        switch (route.name) {
          case 'Home':
            return <LayoutDashboard size={iconSize} color={color} strokeWidth={strokeWidth} />;
          case 'Search':
            return <Search size={iconSize} color={color} strokeWidth={strokeWidth} />;
          case 'Watchlist':
            return <Star size={iconSize} color={color} strokeWidth={strokeWidth} />;
          case 'Statistics':
            return <BarChart2 size={iconSize} color={color} strokeWidth={strokeWidth} />;
          case 'AI':
            return <Sparkles size={iconSize} color={color} strokeWidth={strokeWidth} />;
          default:
            return <LayoutDashboard size={iconSize} color={color} />;
        }
      },
    })}>
    <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Overview' }} />
    <Tab.Screen name="Search" component={CompanySearchScreen} options={{ title: 'Search' }} />
    <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: 'Watchlist' }} />
    <Tab.Screen name="Statistics" component={StatisticsScreen} options={{ title: 'Analytics' }} />
    <Tab.Screen name="AI" component={AIChatScreen} options={{ title: 'FinAI' }} />
  </Tab.Navigator>
);

export const AppNavigator = () => (
  <NavigationContainer theme={navigationTheme}>
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.text, fontWeight: '600' },
        headerTintColor: palette.primary,
        // Removed 'headerBackTitleVisible' to fix TS error
      }}
    >
      <Stack.Screen 
        name="Root" 
        component={TabNavigator} 
        options={{ headerShown: false }} 
      />
      
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: 'card',
          title: 'Settings',
        }}
      />
      
      <Stack.Screen
        name="CompanyDetails"
        component={CompanyDetailsScreen}
        options={{
          presentation: 'card',
          title: 'Details',
        }}
      />
      
      <Stack.Screen
        name="MarketMovers"
        component={MarketMoversScreen}
        options={{
          presentation: 'card',
          title: 'Market Movers',
        }}
      />
      
      <Stack.Screen
        name="BrowseStocks"
        component={BrowseStocksScreen}
        options={{
          presentation: 'card',
          title: 'Browse Stocks',
        }}
      />
    </Stack.Navigator>
  </NavigationContainer>
);