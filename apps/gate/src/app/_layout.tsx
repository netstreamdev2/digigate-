import { colors, fontFamily } from '@digigate/design';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { InterTight_600SemiBold, InterTight_700Bold } from '@expo-google-fonts/inter-tight';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { SessionProvider, useSession } from '@/auth/session';
import { demoPost } from '@/demo/gate-demo';
import { seedUsers } from '@/demo/seed-users';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fontFamily.display]: InterTight_700Bold,
    [fontFamily.displayMedium]: InterTight_600SemiBold,
    [fontFamily.text]: Inter_400Regular,
    [fontFamily.textMedium]: Inter_500Medium,
    [fontFamily.textSemibold]: Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <SessionProvider users={seedUsers} idleLockMinutes={demoPost.idleLockMinutes}>
      <StatusBar style="dark" />
      <GuardedStack />
    </SessionProvider>
  );
}

function GuardedStack() {
  const { state, recordActivity } = useSession();
  const signedIn = state.status === 'active';

  return (
    <View style={styles.root} onTouchStart={recordActivity}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="entry" />
          <Stack.Screen name="exit" />
          <Stack.Screen name="shift" />
          <Stack.Screen name="scan-test" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
