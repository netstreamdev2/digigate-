import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { HostField } from '@/host/host-field';
import { useHostSession } from '@/host/host-session';
import { problemWords } from '@/host/invites';

/** A host signs in with their mobile number, email or username and their password. No authenticator. */
export default function HostSignIn() {
  const insets = useSafeAreaInsets();
  const { signIn } = useHostSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await signIn(login.trim(), password);
    } catch (cause) {
      setProblem(problemWords(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        <Logo height={30} />
        <View style={styles.heading}>
          <Text variant="overline" color={colors.brand}>
            Visitor invites
          </Text>
          <Text variant="display">Invite a visitor</Text>
          <Text variant="body" color={colors.inkMuted}>
            Send them a QR. At the gate they show it with their ID or licence, and the guard knows they&apos;re expected.
          </Text>
        </View>

        {problem ? <ResultBanner compact tone="warning" title="Not signed in" message={problem} /> : null}

        <View style={styles.form}>
          <HostField label="Mobile number, email or username" value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" placeholder="082 123 4567" />
          <HostField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={() => void submit()} />
          <PillButton label={busy ? 'Signing in…' : 'Sign in'} icon="check" disabled={busy || !login.trim() || !password} onPress={() => void submit()} />
        </View>

        <View style={styles.gate}>
          <Text variant="label" color={colors.inkSubtle}>
            Setting up a phone for a gate instead?
          </Text>
          <PillButton label="Use this phone at a gate" variant="secondary" icon="scan" onPress={() => router.push('/pair')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  heading: {
    gap: space.xs,
  },
  form: {
    gap: space.md,
  },
  gate: {
    marginTop: 'auto',
    gap: space.xs,
  },
});
