import React, { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Haptic from 'react-native-haptic-feedback';
import { Button } from '../components/ui/Button';
import { Loader } from '../components/ui/Loader';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { Toast } from '../components/ui/Toast';
import { ChatBubble } from '../components/chat/ChatBubble';
import { useIdentity } from '../context/IdentityContext';
import { useChatSessionContext } from '../context/ChatSessionContext';
import { useChatActionsMobile } from '../hooks/useChatActionsMobile';
import { getChatRanking, getRecentParticipants } from '@yui/shared/chat/selectors';
import { sortChatsByTime } from '@yui/shared/utils/uuid';
import { spacing, typography } from '../theme/tokens';
import { useThemeTokens } from '../theme/useTheme';
import type { ChatTabsScreenProps } from '../navigation/types';

export function ChatRoomScreen({ navigation }: ChatTabsScreenProps<'ChatRoom'>) {
  const { identity, resetIdentity } = useIdentity();
  const session = useChatSessionContext();
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const theme = useThemeTokens();

  const chatActions = useChatActionsMobile((command) => {
    if (command === 'cut') {
      setToast('cut コマンドは現在利用できません');
    }
    if (command === 'clear') {
      setToast('チャットログを削除しました');
    }
  });

  const sortedChats = useMemo(() => sortChatsByTime(session.chatLog), [session.chatLog]);
  const ranking = useMemo(() => getChatRanking(sortedChats), [sortedChats]);
  const participants = useMemo(() => getRecentParticipants(sortedChats), [sortedChats]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        session.refresh();
      }
    });
    return () => subscription.remove();
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!identity.entered) {
      navigation.replace('Entry');
    }
  }, [identity.entered, navigation]);

  const handleSend = async () => {
    if (!identity.entered) return;
    const text = message.trim();
    if (!text) return;
    const normalized = text.toLowerCase();

    if (normalized === 'clear' || normalized === '/clear') {
      Alert.alert('チャットログを削除しますか？', 'この操作は取り消せません。', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatActions.sendMessage({
                message: text,
                name: identity.name,
                color: identity.color,
                email: identity.email,
              });
              setMessage('');
            } catch (error) {
              setToast('削除に失敗しました');
            }
          },
        },
      ]);
      return;
    }

    try {
      await chatActions.sendMessage({
        message: text,
        name: identity.name,
        color: identity.color,
        email: identity.email,
      });
      setMessage('');
      Haptic.trigger('impactLight');
    } catch (error) {
      setToast('送信に失敗しました');
    }
  };

  const handleExit = async () => {
    if (!identity.entered) return;
    try {
      await chatActions.exit({ name: identity.name, color: identity.color, email: identity.email });
    } finally {
      resetIdentity();
      navigation.replace('Entry');
    }
  };

  const renderItem = ({ item }: { item: typeof sortedChats[number] }) => (
    <ChatBubble chat={item} isOwn={item.name === identity.name} />
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <OfflineBanner visible={session.isOffline} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.textPrimary }]}>ゆいちゃっと</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Supabase + React Native</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[styles.headerActionsButton, styles.headerActionsButtonFirst]}>
              <Button
                label="ランキング"
                variant="ghost"
                onPress={() => navigation.navigate('RankingModal', { ranking })}
                disabled={ranking.length === 0}
              />
            </View>
            <View style={styles.headerActionsButton}>
              <Button
                label="参加者"
                variant="ghost"
                onPress={() => navigation.navigate('ParticipantsModal', { participants })}
                disabled={participants.length === 0}
              />
            </View>
          </View>
        </View>
        <View style={styles.listContainer}>
          <FlatList
            data={sortedChats}
            renderItem={renderItem}
            keyExtractor={(item) => item.uuid}
            inverted
            contentContainerStyle={styles.listContent}
            onRefresh={session.refresh}
            refreshing={sortedChats.length === 0 && session.isLoading}
          />
          {session.isLoading && sortedChats.length === 0 ? (
            <View style={[styles.loaderEmpty, { backgroundColor: theme.background }] }>
              <Loader label="読み込み中..." />
            </View>
          ) : null}
          {session.isLoading && sortedChats.length > 0 ? (
            <View style={styles.loaderOverlay} pointerEvents="none">
              <Loader label="更新中..." />
            </View>
          ) : null}
        </View>
        <View style={[styles.composer, { backgroundColor: theme.surface }]}> 
          <TextInput
            value={message}
            onChangeText={setMessage}
            style={[styles.input, { color: theme.textPrimary }]}
            placeholder="メッセージを入力"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={240}
          />
          <View style={styles.composerActions}>
            <View style={styles.composerActionButton}>
              <Button label="送信" onPress={handleSend} disabled={!message.trim()} />
            </View>
            <View style={styles.composerActionButton}>
              <Button label="退室" variant="secondary" onPress={handleExit} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <Toast message={toast} visible={Boolean(toast)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: typography.small,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionsButton: {
    marginLeft: spacing.sm,
  },
  headerActionsButtonFirst: {
    marginLeft: 0,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  loaderEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247, 248, 251, 0.95)',
  },
  loaderOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: spacing.xl,
  },
  composer: {
    borderTopWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: '#ffffff',
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  composerActionButton: {
    marginLeft: spacing.md,
  },
});
