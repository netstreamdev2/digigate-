import { useLocalSearchParams } from 'expo-router';

import { WalkInScreen } from '@/gate/walk-in-screen';

export default function WalkIn() {
  const { direction } = useLocalSearchParams<{ direction?: string }>();
  return <WalkInScreen direction={direction === 'exit' ? 'exit' : 'entry'} />;
}
