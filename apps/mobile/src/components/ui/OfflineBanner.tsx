import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, spacing } from '../../theme/tokens';

export type OfflineBannerProps = {
  visible: boolean;
};

export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>オフラインです。接続を確認しています…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: palette.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#1f2937',
    fontWeight: '600',
  },
});
