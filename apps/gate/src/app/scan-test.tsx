import { colors, space } from '@digigate/design';
import { Directory, File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { PillButton } from '@/components/pill-button';
import { ResultBanner } from '@/components/result-banner';
import { Text } from '@/components/text';
import { fromBase64 } from '@/lib/bytes';

import { Scanner, type ScanEvent, type ScannerInfo } from '../../modules/scanner';

const MAX_SCANS = 10;
const LICENCE_BARCODE_LENGTH = 720;

// Private app storage. Saved scans are pulled to the gitignored fixtures.local/ over adb and never committed.
const fixturesDir = new Directory(Paths.document, 'scan-fixtures');

type ReceivedScan = ScanEvent & { saved: boolean };

// Describes the shape of a scan only. The decoded contents are personal information and stay off screen.
function describeScan(bytes: Uint8Array): string {
  if (bytes[0] === 0x25) return "Text starting with '%': looks like a licence disc";
  if (bytes.length === LICENCE_BARCODE_LENGTH) return "720 bytes of binary: looks like a driver's licence";
  return 'Unrecognised format';
}

function hexPreview(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export default function ScanTestScreen() {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<ScannerInfo | null>(() => Scanner?.getScannerInfo() ?? null);
  const [scans, setScans] = useState<readonly ReceivedScan[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!Scanner) return;
    const subscription = Scanner.addListener('onScan', (event) => {
      setScans((current) => [{ ...event, saved: false }, ...current].slice(0, MAX_SCANS));
    });
    return () => subscription.remove();
  }, []);

  const switchToAppOutput = () => {
    if (!Scanner) return;
    const switched = Scanner.switchToAppOutput();
    setInfo(Scanner.getScannerInfo());
    setProblem(switched ? null : "The scanner didn't accept the change. Set its output to Intent in the Urovo scanner settings.");
  };

  const save = async (scan: ReceivedScan) => {
    try {
      fixturesDir.create({ idempotent: true, intermediates: true });
      const file = new File(fixturesDir, `${scan.receivedAt}-${scan.length}.bin`);
      file.create({ overwrite: true });
      await file.write(fromBase64(scan.bytes));
      setScans((current) =>
        current.map((item) => (item.receivedAt === scan.receivedAt ? { ...item, saved: true } : item)),
      );
    } catch (cause) {
      setProblem(`Couldn't save that scan (${cause instanceof Error ? cause.message : 'unknown error'}). Try again.`);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" tone="dark" onPress={() => router.back()} />
          <Chip label="Diagnostics" icon="scan" />
        </View>

        <View style={styles.heading}>
          <Text variant="overline" color={colors.inkMuted}>
            Scanner test
          </Text>
          <Text variant="display">Scan a document</Text>
        </View>

        {!Scanner || !info ? (
          <ResultBanner
            tone="warning"
            title="No scanner here"
            message="Expo Go can't load DigiGate's scanner code. Install the development build on the DT50 to test scanning."
          />
        ) : (
          <Card style={styles.info}>
            <InfoRow label="Device" value={`${info.manufacturer} ${info.model} · Android ${info.androidVersion}`} />
            <InfoRow label="Scanner adapter" value={info.vendor ?? 'None for this device yet'} />
            <View style={styles.outputRow}>
              <InfoRow label="Output" value={info.outputMode === 'app' ? 'Raw bytes to DigiGate' : 'Not app mode'} />
              <Chip
                label={info.outputMode === 'app' ? 'App' : info.outputMode === 'keyboard' ? 'Keyboard' : 'Unknown'}
                tone={info.outputMode === 'app' ? 'clear' : 'blocked'}
              />
            </View>
            {info.outputMode !== 'app' ? (
              <View style={styles.switch}>
                <Text variant="label" color={colors.inkMuted}>
                  In keyboard mode the scanner types into whatever is on screen and corrupts the licence barcode.
                </Text>
                <PillButton label="Switch scanner to app mode" icon="scan" onPress={switchToAppOutput} />
              </View>
            ) : null}
          </Card>
        )}

        {problem ? <ResultBanner tone="warning" title="Something went wrong" message={problem} /> : null}

        {Scanner ? (
          <View style={styles.scans}>
            <Text variant="overline" color={colors.inkMuted}>
              Last scans
            </Text>
            {scans.length === 0 ? (
              <Text variant="body" color={colors.inkMuted}>
                Press a scan trigger on the side of the device.
              </Text>
            ) : (
              scans.map((scan) => {
                const bytes = fromBase64(scan.bytes);
                return (
                  <Card key={scan.receivedAt} style={styles.scan}>
                    <Text variant="bodyStrong">{describeScan(bytes)}</Text>
                    <Text variant="label" color={colors.inkMuted}>
                      {`${scan.length} bytes · symbology ${scan.symbology ?? '?'} · ${new Date(scan.receivedAt).toLocaleTimeString('en-ZA')}`}
                    </Text>
                    <Text variant="label" color={colors.inkSubtle}>{`Starts ${hexPreview(bytes)}`}</Text>
                    <View style={styles.scanActions}>
                      {scan.saved ? (
                        <Chip label="Saved for testing" icon="check" tone="clear" />
                      ) : (
                        <Chip label="Save for testing" icon="add" onPress={() => save(scan)} />
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="overline" color={colors.inkSubtle}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    gap: space.xs,
  },
  info: {
    gap: space.md,
  },
  infoRow: {
    flex: 1,
    gap: 2,
  },
  outputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  switch: {
    gap: space.sm,
  },
  scans: {
    gap: space.sm,
  },
  scan: {
    gap: space.xxs,
  },
  scanActions: {
    flexDirection: 'row',
    marginTop: space.xs,
  },
});
