import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatRankingEntry } from '@yui/shared/chat/selectors';
import type { Participant } from '@yui/shared/chat/types';

export type RootStackParamList = {
  Entry: undefined;
  ChatTabs: undefined;
  RankingModal: { ranking: ChatRankingEntry[] };
  ParticipantsModal: { participants: Participant[] };
};

export type ChatTabsParamList = {
  ChatRoom: undefined;
  Logs: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type ChatTabsScreenProps<T extends keyof ChatTabsParamList> = CompositeScreenProps<
  BottomTabScreenProps<ChatTabsParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
