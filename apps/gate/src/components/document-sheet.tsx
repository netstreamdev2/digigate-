import { colors, space } from '@digigate/design';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from './chip';
import { IconButton } from './icon-button';

/** Every detail on a scanned document, over the current screen. Opens instantly: nothing animates in the gate app. */
export function DocumentSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheet, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <IconButton icon="close" label="Close details" tone="dark" onPress={onClose} />
        <Chip label="All details" icon="info" />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: space.lg,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    gap: space.lg,
  },
});
