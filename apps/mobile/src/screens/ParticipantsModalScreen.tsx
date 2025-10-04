import React from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../navigation/types';
import { Button } from '../components/ui/Button';
import { palette, spacing, typography } from '../theme/tokens';

export function ParticipantsModalScreen({ route, navigation }: RootStackScreenProps<'ParticipantsModal'>) {
  const { participants } = route.params;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>参加者一覧</Text>
        <Text style={styles.subtitle}>直近5分間に発言したユーザー</Text>
      </View>
      <FlatList
        data={participants}
        keyExtractor={(item) => item.uuid}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.color, { backgroundColor: item.color }]} />
            <Text style={styles.name}>{item.name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>現在参加者はいません。</Text>}
      />
      <View style={styles.footer}>
        <Button label="閉じる" onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
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
  },
  color: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.md,
  },
  name: {
    fontSize: typography.subtitle,
    color: palette.textPrimaryLight,
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
