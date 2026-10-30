import { colors, space } from '@digigate/design';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { Keypad } from '@/components/keypad';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { fromBase64 } from '@/lib/bytes';
import { PAIRING_CODE_LENGTH, type PairingResult } from '@/sync/pairing';
import { useSync } from '@/sync/sync-context';

import { subscribeToScans } from '../../modules/scanner';

const problems: Record<Exclude<PairingResult, { ok: true }>['reason'], string> = {
  'invalid-code': `That isn't a pairing code. Codes are ${PAIRING_CODE_LENGTH} digits.`,
  'code-not-found': 'That code has expired or was already used. Ask an admin for a new one.',
  'no-connection': 'No connection. Pairing needs the internet once; after that the device works offline.',
  'server-error': 'Something went wrong on the server. Try again in a minute.',
};

/** Groups the code as 3-3-4 digits so it's easy to compare with the dashboard. */
function formatCode(code: string): string {
  return [code.slice(0, 3), code.slice(3, 6), code.slice(6)].filter(Boolean).join(' ');
}

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const { pair, status } = useSync();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const unavailable = status.state === 'local-only';

  const submit = async (fullCode: string) => {
    setBusy(true);
    try {
      const result = await pair(fullCode);
      if (result.ok) setPaired(true);
      else setProblem(problems[result.reason]);
    } catch {
      setProblem(problems['no-connection']);
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  // The QR on the dashboard carries the same code, so a scan saves typing it.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const subscription = subscribeToScans((event) => {
      const scanned = String.fromCharCode(...fromBase64(event.bytes));
      if (new RegExp(`^\\d{${PAIRING_CODE_LENGTH}}$`).test(scanned)) void submitRef.current(scanned);
    });
    return () => subscription?.remove();
  }, []);

  const onDigit = (digit: string) => {
    setProblem(null);
    if (code.length >= PAIRING_CODE_LENGTH) return;
    const next = code + digit;
    setCode(next);
    if (next.length === PAIRING_CODE_LENGTH) void submit(next);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
      </View>

      <View style={styles.heading}>
        <Text variant="overline" color={colors.inkMuted}>
          Device setup
        </Text>
        <Text variant="display">Pair this device</Text>
        <Text variant="label" color={colors.inkMuted}>
          {`Scan the QR on the DigiGate dashboard, or type its ${PAIRING_CODE_LENGTH}-digit code.`}
        </Text>
      </View>

      <View style={styles.entry}>
        <Text variant="display" style={styles.code}>
          {formatCode(code)}
        </Text>
        <Text variant="label" color={colors.inkMuted}>
          {busy ? 'Pairing…' : ' '}
        </Text>
      </View>

      {unavailable ? (
        <ResultBanner
          tone="warning"
          title="Can't pair this build"
          message="It was built without server settings. Add them to apps/gate/.env and restart the dev server."
        />
      ) : null}
      {problem ? <ResultBanner tone="warning" title="Not paired" message={problem} /> : null}
      {paired ? (
        <ResultBanner tone="clear" title="Paired" message="This device now syncs its guard list and records with the site." />
      ) : null}

      <View style={styles.controls}>
        {paired ? (
          <PillButton label="Done" icon="check" onPress={() => router.back()} />
        ) : (
          <Keypad onDigit={onDigit} onDelete={() => setCode(code.slice(0, -1))} disabled={busy || unavailable} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
    gap: space.lg,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    gap: space.xs,
  },
  entry: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  code: {
    minHeight: 41,
    letterSpacing: 2,
  },
  controls: {
    gap: space.md,
  },
});
