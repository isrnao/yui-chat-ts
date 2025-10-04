import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { Chat } from '@yui/shared/chat/types';
import { palette, radius, spacing, typography } from '../../theme/tokens';

export type ChatBubbleProps = {
  chat: Chat;
  isOwn?: boolean;
};

export function ChatBubble({ chat, isOwn = false }: ChatBubbleProps) {
  const isSystem = Boolean(chat.system);
  const bubbleStyle = [styles.bubble, isSystem && styles.systemBubble, isOwn && styles.ownBubble];
  const nameColor = isSystem ? palette.accent : chat.color;

  return (
    <Animated.View entering={FadeInUp.springify().mass(0.5)} style={styles.container}>
      {!isSystem ? (
        <View style={[styles.avatar, { backgroundColor: chat.color }]}>
          <Text style={styles.avatarText}>{chat.name.slice(0, 1)}</Text>
        </View>
      ) : (
        <View style={[styles.avatar, styles.systemAvatar]}>
          <Text style={styles.avatarText}>★</Text>
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.name, { color: nameColor }]}>{chat.name}</Text>
          <Text style={styles.time}>{formatTime(chat.time)}</Text>
        </View>
        <View style={bubbleStyle}>
          <Text style={styles.message}>{chat.message}</Text>
          {chat.optimistic ? <Text style={styles.pending}>送信中...</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  systemAvatar: {
    backgroundColor: palette.primary,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: typography.subtitle,
    fontWeight: '600',
  },
  time: {
    fontSize: typography.small,
    color: palette.textSecondaryLight,
  },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceLight,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  ownBubble: {
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.24)',
  },
  systemBubble: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  message: {
    fontSize: typography.body,
    color: palette.textPrimaryLight,
    lineHeight: 20,
  },
  pending: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    color: palette.warning,
  },
});
