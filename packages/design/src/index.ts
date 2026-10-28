// Provisional tokens drawn from the user's reference shots (2026-10-28).
// The full design system replaces these values; components only ever read tokens.

export const colors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F5',
  border: '#E7E7EB',
  ink: '#0B0B0D',
  inkRaised: '#26262B',
  inkMuted: '#5F5F69',
  inkSubtle: '#9B9BA4',
  inkInverse: '#FFFFFF',
  brand: '#062C65',
  tileSky: '#DDF0FB',
  tileMint: '#DFF4E1',
  tileButter: '#FFF3B5',
  tileLilac: '#ECE7FB',
  badge: '#E5452A',
  clear: '#108043',
  clearSoft: '#DDF6E6',
  warning: '#B45309',
  warningSoft: '#FFF1CC',
  blocked: '#D92D20',
  blockedSoft: '#FDE4E1',
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

export const fontFamily = {
  display: 'InterTight_700Bold',
  displayMedium: 'InterTight_600SemiBold',
  text: 'Inter_400Regular',
  textMedium: 'Inter_500Medium',
  textSemibold: 'Inter_600SemiBold',
} as const;

export const typography = {
  display: { fontFamily: fontFamily.display, fontSize: 38, lineHeight: 41, letterSpacing: -1.4 },
  title: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  heading: { fontFamily: fontFamily.displayMedium, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  stat: { fontFamily: fontFamily.displayMedium, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
  body: { fontFamily: fontFamily.text, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  bodyStrong: { fontFamily: fontFamily.textSemibold, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  label: { fontFamily: fontFamily.textMedium, fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  overline: { fontFamily: fontFamily.textSemibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;

export const shadow = {
  card: '0px 6px 20px rgba(17, 24, 39, 0.07)',
  floating: '0px 10px 24px rgba(17, 24, 39, 0.22)',
  glow: '0px 0px 18px rgba(88, 190, 230, 0.45)',
  // A white upward shadow, so content scrolling under the dock fades out instead of cutting off.
  dockFade: '0px -16px 24px rgba(255, 255, 255, 0.95)',
} as const;
