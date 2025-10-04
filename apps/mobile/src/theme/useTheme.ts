import { useColorScheme } from 'react-native';
import { palette } from './tokens';

export function useThemeTokens() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    isDark,
    background: isDark ? palette.backgroundDark : palette.backgroundLight,
    surface: isDark ? palette.surfaceDark : palette.surfaceLight,
    textPrimary: isDark ? palette.textPrimaryDark : palette.textPrimaryLight,
    textSecondary: isDark ? palette.textSecondaryDark : palette.textSecondaryLight,
    divider: isDark ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.08)',
  } as const;
}
