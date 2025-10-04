import React from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { EntryScreen } from '../screens/EntryScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { LogScreen } from '../screens/LogScreen';
import { RankingModalScreen } from '../screens/RankingModalScreen';
import { ParticipantsModalScreen } from '../screens/ParticipantsModalScreen';
import type { ChatTabsParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<ChatTabsParamList>();

function ChatTabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ title: 'チャット' }}
      />
      <Tabs.Screen name="Logs" component={LogScreen} options={{ title: '過去ログ' }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const scheme = useColorScheme();
  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack.Navigator>
        <Stack.Screen
          name="Entry"
          component={EntryScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ChatTabs"
          component={ChatTabsNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="RankingModal"
          component={RankingModalScreen}
          options={{ presentation: 'modal', title: 'ランキング' }}
        />
        <Stack.Screen
          name="ParticipantsModal"
          component={ParticipantsModalScreen}
          options={{ presentation: 'modal', title: '参加者' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
