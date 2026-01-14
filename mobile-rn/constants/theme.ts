/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#0F172A', // Slate 900
    textSecondary: '#64748B', // Slate 500
    background: '#F8FAFC', // Slate 50
    card: '#FFFFFF',
    border: '#E2E8F0', // Slate 200
    tint: '#3B82F6', // Blue 500
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#3B82F6',

    // Semantic
    primary: '#3B82F6',
    primaryLight: 'rgba(59, 130, 246, 0.1)',
    success: '#10B981', // Emerald 500
    successLight: 'rgba(16, 185, 129, 0.1)',
    danger: '#EF4444', // Red 500
    dangerLight: 'rgba(239, 68, 68, 0.1)',
    warning: '#F59E0B', // Amber 500
    warningLight: 'rgba(245, 158, 11, 0.1)',

    // Specific
    headerBorder: '#E2E8F0',
    inputBackground: '#F1F5F9', // Slate 100
    inputBorder: '#CBD5E1', // Slate 300
  },
  dark: {
    text: '#F8FAFC', // Slate 50
    textSecondary: '#94A3B8', // Slate 400
    background: '#0F172A', // Slate 900
    card: '#1E293B', // Slate 800
    border: '#334155', // Slate 700
    tint: '#3B82F6',
    icon: '#94A3B8',
    tabIconDefault: '#64748B',
    tabIconSelected: '#3B82F6',

    // Semantic
    primary: '#3B82F6',
    primaryLight: 'rgba(59, 130, 246, 0.15)',
    success: '#10B981',
    successLight: 'rgba(16, 185, 129, 0.15)',
    danger: '#EF4444',
    dangerLight: 'rgba(239, 68, 68, 0.15)',
    warning: '#F59E0B',
    warningLight: 'rgba(245, 158, 11, 0.15)',

    // Specific
    headerBorder: '#334155',
    inputBackground: '#334155',
    inputBorder: '#475569',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
