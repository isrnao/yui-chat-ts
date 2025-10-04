import type { PropsWithChildren } from 'react';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';

export type ButtonProps = PropsWithChildren<{
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}>;

export function Button({ label, children, onPress, disabled = false, variant = 'primary' }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.text, variant === 'ghost' && styles.textGhost]}>
        {label ?? children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: palette.primary,
  },
  secondary: {
    backgroundColor: palette.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.4)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  textGhost: {
    color: palette.primary,
  },
});
