import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  primary: '#0E7A4F',
  primaryDark: '#0A5C3B',
  primaryDeep: '#063A26',
  primarySoft: '#E7F5EE',
  primaryTint: '#C9EBD9',

  ink: '#0F172A',
  inkSecondary: '#475569',
  inkMuted: '#94A3B8',
  inkInverse: '#FFFFFF',
  inkInverseMuted: 'rgba(255,255,255,0.72)',

  bg: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F4F7',
  border: '#E4E9EF',

  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#B45309',
  warningSoft: '#FFF7E6',
  info: '#2563EB',
  infoSoft: '#EEF4FF',
  gold: '#F5C451',

  overlay: 'rgba(15,23,42,0.6)',
} as const;

export const gradients = {
  brand: ['#12915E', '#0A5C3B', '#063A26'] as const,
  brandSoft: ['#15A06A', '#0E7A4F'] as const,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    web: { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' },
    default: { elevation: 2 },
  }),
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#063A26',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
    },
    web: { boxShadow: '0 12px 28px rgba(6,58,38,0.28)' },
    default: { elevation: 8 },
  }),
};
