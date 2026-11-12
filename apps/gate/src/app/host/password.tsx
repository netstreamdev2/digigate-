import { colors, space } from '@digigate/design';
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

const MIN_LENGTH = 8;

/** The first sign-in uses the password an administrator handed over; the host chooses their own before anything else. */
export default function HostPassword() {
  const insets = useSafeAreaInsets();
  const { setPassword, signOut } = useHostSession();
  const [password, setValue] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mismatch = again.length > 0 && again !== password;

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await setPassword(password);
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
          <Text variant="display">Choose your password</Text>
          <Text variant="body" color={colors.inkMuted}>
            The one you were given only works once. Pick one of at least {MIN_LENGTH} characters that only you know.
          </Text>
        </View>
        {problem ? <ResultBanner compact tone="warning" title="Not saved" message={problem} /> : null}
        <View style={styles.form}>
          <HostField label="New password" value={password} onChangeText={setValue} secureTextEntry autoComplete="password-new" />
          <HostField label="Type it again" value={again} onChangeText={setAgain} secureTextEntry hint={mismatch ? "They don't match yet." : undefined} />
          <PillButton label={busy ? 'Saving…' : 'Save my password'} icon="check" disabled={busy || password.length < MIN_LENGTH || again !== password} onPress={() => void submit()} />
          <PillButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
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
});
