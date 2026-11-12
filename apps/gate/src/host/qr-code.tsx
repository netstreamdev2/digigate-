import { colors } from '@digigate/design';
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** The quiet zone a scanner needs around a QR, in modules. */
const QUIET = 2;

/**
 * A QR drawn as one vector path, crisp at any size and in a shared picture. Medium error correction: enough for a
 * cracked phone screen at the gate, with modules still large on a small one.
 */
export function QrCode({ text, size }: { text: string; size: number }) {
  const { path, count } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(text);
    code.make();
    const modules = code.getModuleCount();
    let d = '';
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (code.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
    return { path: d, count: modules + QUIET * 2 };
  }, [text]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel="Invite QR code">
      <Rect width={count} height={count} fill={colors.surface} />
      <Path d={path} fill={colors.ink} />
    </Svg>
  );
}
