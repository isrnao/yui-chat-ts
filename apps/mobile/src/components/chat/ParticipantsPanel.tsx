import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Participant } from '@yui/shared/chat/types';
import { Modal } from '../ui/Modal';
import { palette, spacing, typography } from '../../theme/tokens';

export type ParticipantsPanelProps = {
  visible: boolean;
  onClose: () => void;
  participants: Participant[];
};

export function ParticipantsPanel({ visible, onClose, participants }: ParticipantsPanelProps) {
  return (
    <Modal visible={visible} onRequestClose={onClose}>
      <Text style={styles.title}>参加者</Text>
      <FlatList
        data={participants}
        keyExtractor={(participant) => participant.uuid}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.color, { backgroundColor: item.color }]} />
            <Text style={styles.name}>{item.name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>現在参加者はいません。</Text>}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.lg,
    color: palette.textPrimaryLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  color: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
  },
  name: {
    fontSize: typography.body,
    color: palette.textPrimaryLight,
  },
  empty: {
    color: palette.textSecondaryLight,
    fontSize: typography.body,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
