import React from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../navigation/types';
import { Button } from '../components/ui/Button';
import { palette, spacing, typography } from '../theme/tokens';

export function RankingModalScreen({ route, navigation }: RootStackScreenProps<'RankingModal'>) {
  const { ranking } = route.params;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>ランキング</Text>
        <Text style={styles.subtitle}>投稿数の多いユーザー順</Text>
      </View>
      <FlatList
        data={ranking}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.count} 件 / 最終 {formatRelativeTime(item.lastTime)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>まだデータがありません。</Text>}
      />
      <View style={styles.footer}>
        <Button label="閉じる" onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
}

function formatRelativeTime(time: number): string {
  const diff = Date.now() - time;
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  return `${Math.floor(diff / 3_600_000)}時間前`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.surfaceLight,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
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
    marginBottom: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  rank: {
    width: 32,
    fontSize: typography.subtitle,
    fontWeight: '700',
    color: palette.primary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.subtitle,
    color: palette.textPrimaryLight,
    fontWeight: '600',
  },
  meta: {
    fontSize: typography.small,
    color: palette.textSecondaryLight,
  },
  empty: {
    textAlign: 'center',
    color: palette.textSecondaryLight,
    paddingVertical: spacing.xl,
  },
  footer: {
    padding: spacing.xl,
  },
});
