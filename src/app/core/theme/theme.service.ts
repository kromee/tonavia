import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'tonavia:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.storedPreference());
  readonly resolvedTheme = signal<ResolvedTheme>('dark');

  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.applyTheme();
    this.mediaQuery.addEventListener('change', () => this.applyTheme());
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);

    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }

    this.applyTheme();
  }

  private applyTheme(): void {
    const resolved = this.preference() === 'system'
      ? this.systemTheme()
      : this.preference() as ResolvedTheme;

    this.resolvedTheme.set(resolved);
    document.documentElement.dataset['theme'] = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  private systemTheme(): ResolvedTheme {
    return this.mediaQuery.matches ? 'dark' : 'light';
  }

  private storedPreference(): ThemePreference {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }
}
