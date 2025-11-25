import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Watchlist: undefined;
  Statistics: undefined;
  AI: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};

export type RootStackParamList = {
  Root: NavigatorScreenParams<TabParamList>;
  Settings: undefined;
  CompanyDetails: {
    symbol: string;
    name: string;
  };
  Login: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<TabParamList, T>;