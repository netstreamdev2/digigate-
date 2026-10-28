import { Image } from 'expo-image';

// assets/logo.svg is the brand file cropped to its mark and wordmark (1355 × 432).
const LOGO_ASPECT_RATIO = 1355 / 432;
const logo = require('../../assets/logo.svg');

type Props = {
  height?: number;
};

export function Logo({ height = 28 }: Props) {
  return (
    <Image
      source={logo}
      style={{ height, width: height * LOGO_ASPECT_RATIO }}
      contentFit="contain"
      accessibilityLabel="DigiGate"
    />
  );
}
