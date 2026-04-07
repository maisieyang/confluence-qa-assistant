'use client';

import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';

type ThemeValue = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'Auto', icon: '💻' },
];

export function ThemeSelector() {
  const { theme, setTheme, mounted } = useTheme();

  const currentTheme = useMemo(() => {
    if (!mounted) return 'system';
    return theme;
  }, [mounted, theme]);

  return (
    <div>
      <div className="text-sm font-medium text-text-secondary mb-2">Theme</div>
      <div className="flex rounded-lg border border-border-default overflow-hidden">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!mounted}
            onClick={() => setTheme(option.value)}
            className={`flex-1 px-2 py-1.5 text-sm transition-colors duration-150 cursor-pointer disabled:opacity-60 ${
              currentTheme === option.value
                ? 'bg-interactive-primary text-text-inverted font-medium'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="mr-0.5">{option.icon}</span> {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
