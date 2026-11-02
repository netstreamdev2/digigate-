import { colors } from '@digigate/design';
import { useEffect } from 'react';
import { BackHandler, Keyboard, StyleSheet, View } from 'react-native';

import { SignInPanel } from './sign-in-panel';

/**
 * The lock screen, laid over whatever the guard was doing rather than replacing it. A car waiting on a supervisor
 * keeps its result and its decision through a lock, and the guard picks up where they left off after their PIN.
 */
export function LockCover() {
  useEffect(() => {
    Keyboard.dismiss();
    // The screen underneath must not go back while nobody can see it.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.cover}>
      <SignInPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
  },
});
