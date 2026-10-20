// Colours and type taken from the design mockups.

export const colors = {
  bg: '#050912',
  bgDeep: '#020409',
  tabBar: '#070d18',
  panel: '#0a1a2e',
  panelRow: '#0b1c31',
  panelRowDone: '#0d2440',
  track: '#0f2238',

  border: '#3fb8ff',
  borderMuted: '#1d3d5c',
  borderDone: '#2a7fb5',
  bracket: '#bfeaff',

  cyan: '#5cd0ff',
  text: '#e6f6ff',
  textSoft: '#cfe9f8',
  textMuted: '#9cc3dc',
  textDone: '#7fa3bb',

  danger: '#ff4d5e',
  dangerSoft: '#ff7a87',
  dangerPanel: '#1e0a10',
  dangerBracket: '#ffc2c8',

  gold: '#ffc857',
  goldPanel: '#15110a',
  goldBracket: '#ffe2a3',

  epic: '#b98cff',
  epicPanel: '#110e1d',
  epicBracket: '#e2d4ff',
} as const;

export type WindowVariant = 'system' | 'danger' | 'gold' | 'epic';

export const windowPalette: Record<
  WindowVariant,
  { panel: string; border: string; bracket: string; glow: string; accent: string }
> = {
  system: { panel: colors.panel, border: colors.border, bracket: colors.bracket, glow: '63,184,255', accent: colors.cyan },
  danger: {
    panel: colors.dangerPanel,
    border: colors.danger,
    bracket: colors.dangerBracket,
    glow: '255,77,94',
    accent: colors.dangerSoft,
  },
  gold: { panel: colors.goldPanel, border: colors.gold, bracket: colors.goldBracket, glow: '255,200,87', accent: colors.gold },
  epic: { panel: colors.epicPanel, border: colors.epic, bracket: colors.epicBracket, glow: '185,140,255', accent: colors.epic },
};

export const fonts = {
  displayMedium: 'Rajdhani_500Medium',
  displaySemi: 'Rajdhani_600SemiBold',
  display: 'Rajdhani_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
