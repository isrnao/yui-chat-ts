import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';

export type ToastProps = {
  message: string | null;
  visible: boolean;
  duration?: number;
};

export function Toast({ message, visible, duration = 250 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration,
      useNativeDriver: true,
    }).start();
  }, [duration, opacity, visible]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
    backgroundColor: palette.surfaceDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  text: {
    color: palette.textPrimaryDark,
    textAlign: 'center',
    fontWeight: '600',
  },
});
