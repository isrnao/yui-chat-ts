import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { palette, spacing } from '../../theme/tokens';

export type LoaderProps = {
  label?: string;
};

export function Loader({ label }: LoaderProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={palette.primary} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: palette.textSecondaryLight,
    fontSize: 14,
    marginLeft: spacing.sm,
  },
});
