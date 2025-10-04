import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatRankingEntry } from '@yui/shared/chat/selectors';
import { palette, radius, spacing, typography } from '../../theme/tokens';

export type RankingSheetProps = {
  visible: boolean;
  onClose: () => void;
  ranking: ChatRankingEntry[];
};

export function RankingSheet({ visible, onClose, ranking }: RankingSheetProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.title}>ランキング</Text>
          </View>
          <FlatList
            data={ranking}
            keyExtractor={(item) => item.name}
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
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeLabel}>閉じる</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </View>
  );
}

function formatRelativeTime(time: number): string {
  const diff = Date.now() - time;
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  return `${Math.floor(diff / 3_600_000)}時間前`;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surfaceLight,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '70%',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: palette.textPrimaryLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rank: {
    width: 24,
    textAlign: 'center',
    fontSize: typography.subtitle,
    fontWeight: '700',
    color: palette.primary,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    fontSize: typography.subtitle,
    fontWeight: '600',
    color: palette.textPrimaryLight,
  },
  meta: {
    fontSize: typography.small,
    color: palette.textSecondaryLight,
  },
  empty: {
    textAlign: 'center',
    color: palette.textSecondaryLight,
    paddingVertical: spacing.lg,
  },
  closeButton: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: palette.primary,
    paddingVertical: spacing.md,
  },
  closeLabel: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
});
