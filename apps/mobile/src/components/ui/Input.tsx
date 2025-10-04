import React, { forwardRef } from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';

export type InputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
};

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, helperText, error, style, ...props }, ref) => {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          style={[styles.input, isDark && styles.inputDark, style, error && styles.inputError]}
          placeholderTextColor={isDark ? palette.textSecondaryDark : palette.textSecondaryLight}
          {...props}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {helperText && !error ? <Text style={styles.helper}>{helperText}</Text> : null}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textPrimaryLight,
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    backgroundColor: palette.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.textPrimaryLight,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: palette.surfaceDark,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    color: palette.textPrimaryDark,
  },
  inputError: {
    borderColor: palette.warning,
  },
  error: {
    color: palette.warning,
    marginTop: spacing.xs,
    fontSize: 12,
  },
  helper: {
    color: palette.textSecondaryLight,
    marginTop: spacing.xs,
    fontSize: 12,
  },
});
