import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ColorPicker } from '../components/ui/ColorPicker';
import { useIdentity } from '../context/IdentityContext';
import { useChatActionsMobile } from '../hooks/useChatActionsMobile';
import { palette, spacing, typography } from '../theme/tokens';
import { useThemeTokens } from '../theme/useTheme';
import type { RootStackScreenProps } from '../navigation/types';

export function EntryScreen({ navigation }: RootStackScreenProps<'Entry'>) {
  const { identity, updateIdentity } = useIdentity();
  const chatActions = useChatActionsMobile();
  const theme = useThemeTokens();

  const [name, setName] = useState(identity.name);
  const [color, setColor] = useState(identity.color);
  const [email, setEmail] = useState(identity.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await chatActions.enter({ name, color, email });
      updateIdentity({ name, color, email, entered: true });
      navigation.replace('ChatTabs');
    } catch (err) {
      const message = err instanceof Error ? err.message : '入室に失敗しました';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}> 
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: theme.textPrimary }]}>ゆいちゃっと Mobile</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>おなまえとテーマカラーを選んでください。</Text>

          <Input label="おなまえ" value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false} />
          <Input
            label="メール（任意）"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View>
            <Text style={[styles.label, { color: theme.textPrimary }]}>テーマカラー</Text>
            <ColorPicker value={color} onChange={setColor} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonWrapper}>
            <Button label={loading ? '入室中...' : 'チャットに入る'} onPress={handleSubmit} disabled={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
  },
  container: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: palette.textPrimaryLight,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.subtitle,
    color: palette.textSecondaryLight,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    color: palette.textPrimaryLight,
  },
  error: {
    marginVertical: spacing.sm,
    color: palette.warning,
  },
  buttonWrapper: {
    marginTop: spacing.xl,
  },
});
