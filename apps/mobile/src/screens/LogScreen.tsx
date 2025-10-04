import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useChatServices } from '../context/ChatContext';
import { ChatBubble } from '../components/chat/ChatBubble';
import { Loader } from '../components/ui/Loader';
import { palette, spacing, typography } from '../theme/tokens';
import type { Chat } from '@yui/shared/chat/types';
import type { ChatTabsScreenProps } from '../navigation/types';

const PAGE_SIZE = 50;

export function LogScreen(_: ChatTabsScreenProps<'Logs'>) {
  const { chatApi } = useChatServices();
  const [logs, setLogs] = useState<Chat[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await chatApi.loadChatLogsWithPaging(PAGE_SIZE, offset, false);
      setLogs((prev) => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setOffset((prev) => prev + PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [chatApi, hasMore, loading, offset]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>過去ログ</Text>
        <Text style={styles.subtitle}>スクロールでさらに読み込みます</Text>
      </View>
      <FlatList
        data={logs}
        renderItem={({ item }) => <ChatBubble chat={item} />}
        keyExtractor={(item) => item.uuid}
        contentContainerStyle={styles.listContent}
        onEndReached={loadLogs}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loading ? <Loader label="読み込み中" /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: palette.textPrimaryLight,
  },
  subtitle: {
    fontSize: typography.small,
    color: palette.textSecondaryLight,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
