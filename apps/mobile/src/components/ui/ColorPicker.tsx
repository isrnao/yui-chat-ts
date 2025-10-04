import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';

const DEFAULT_COLORS = ['#2563eb', '#ec4899', '#10b981', '#f97316', '#8b5cf6'];

export type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
};

export function ColorPicker({ value, onChange, colors = DEFAULT_COLORS }: ColorPickerProps) {
  return (
    <View style={styles.container}>
      {colors.map((color) => {
        const isSelected = value === color;
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            style={[styles.swatch, { backgroundColor: color }, isSelected && styles.selected]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: spacing.sm,
  },
  selected: {
    borderColor: palette.surfaceLight,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
