import React from 'react';
import { Modal as RNModal, Pressable, StyleSheet } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';

export type ModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

export function Modal({ visible, onRequestClose, children }: ModalProps) {
  return (
    <RNModal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.scrim} onPress={onRequestClose}>
        <Pressable style={styles.surface} onPress={(event) => event.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  surface: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceLight,
    padding: spacing.xl,
  },
});
