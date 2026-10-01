import { Component, inject } from '@angular/core';

import { ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-switch',
  template: `
    <button
      class="theme-switch"
      type="button"
      role="switch"
      [class.is-dark]="resolvedTheme() === 'dark'"
      [attr.aria-checked]="resolvedTheme() === 'dark'"
      [attr.aria-label]="resolvedTheme() === 'dark' ? 'Modo oscuro. Cambiar a modo claro' : 'Modo claro. Cambiar a modo oscuro'"
      [attr.title]="resolvedTheme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      (click)="toggle()"
    >
      <span class="thumb" aria-hidden="true"></span>
      <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path>
      </svg>
      <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"></path>
      </svg>
    </button>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .theme-switch { align-items: center; background: var(--tonavia-control); border: 1px solid var(--tonavia-border); border-radius: 999px; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08); color: var(--tonavia-muted); cursor: pointer; display: inline-flex; height: 2.5rem; justify-content: space-around; padding: 0 0.35rem; position: relative; transition: background 180ms ease, border-color 180ms ease; width: 4.65rem; }
    .theme-switch:hover { border-color: var(--tonavia-accent); }
    .thumb { background: var(--tonavia-accent); border-radius: 50%; box-shadow: 0 2px 8px rgba(45, 19, 77, 0.25); height: 1.85rem; left: 0.32rem; position: absolute; top: 0.27rem; transition: transform 220ms ease; width: 1.85rem; }
    .is-dark .thumb { transform: translateX(2.08rem); }
    svg { height: 1.05rem; position: relative; width: 1.05rem; z-index: 1; }
    .sun { color: #fff; }
    .is-dark .sun { color: var(--tonavia-muted); }
    .is-dark .moon { color: #fff; }
  `
})
export class ThemeSwitchComponent {
  private readonly theme = inject(ThemeService);
  protected readonly resolvedTheme = this.theme.resolvedTheme;

  protected toggle(): void {
    this.theme.setPreference(this.resolvedTheme() === 'dark' ? 'light' : 'dark');
  }
}
