import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SpotifySearchService, SpotifyTrack } from '../../core/spotify/spotify-search.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { QueueItem, RoomSessionStore } from '../rooms/room-session.store';

@Component({
  selector: 'app-room-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <header class="topbar">
        <a class="brand" routerLink="/admin"><span class="brand-mark">T</span>Tonavia</a>
        <div class="theme-toggle" role="group" aria-label="Tema visual">
          <button type="button" [class.is-active]="themePreference() === 'system'" (click)="setTheme('system')">Sistema</button>
          <button type="button" [class.is-active]="themePreference() === 'light'" (click)="setTheme('light')">Claro</button>
          <button type="button" [class.is-active]="themePreference() === 'dark'" (click)="setTheme('dark')">Oscuro</button>
        </div>
        @if (room()) { <span class="room-code">Sala {{ room()!.code }}</span> }
      </header>

      @if (loadingRoom()) {
        <section class="state-card" aria-live="polite">
          <span class="loader" aria-hidden="true"></span>
          <div><h1>Entrando a la sala</h1><p>Estamos preparando la música.</p></div>
        </section>
      } @else {
        <section class="intro">
          <div class="status-row"><span class="status-dot" [class.is-closed]="!isActive()"></span><p class="eyebrow">{{ isActive() ? 'Sala en vivo' : 'Evento finalizado' }}</p></div>
          <h1>{{ room()?.name || 'Sala Tonavia' }}</h1>
          <p>{{ isActive() ? 'Elige la siguiente canción y deja tu huella en la noche.' : 'Gracias por ser parte de la música de esta reunión.' }}</p>
        </section>

        @if (nowPlaying(); as current) {
          <section class="now-playing-card" aria-label="Sonando ahora">
            @if (current.albumImageUrl) { <img [src]="current.albumImageUrl" alt="" /> } @else { <span class="art-placeholder">♫</span> }
            <span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i></span>
            <div><p>Sonando ahora</p><strong>{{ current.title }}</strong><small>{{ current.artist }}</small></div>
          </section>
        }

        @if (!isActive()) {
          <section class="card closed-card"><span class="closed-icon" aria-hidden="true">✓</span><div><h2>La sesión terminó</h2><p>La cola queda aquí como recuerdo de lo que sonó.</p></div></section>
        } @else if (!guestName()) {
          <section class="card profile-card">
            <span class="step">Paso 1 de 2</span>
            <div><h2>¿Cómo te llamamos?</h2><p>Tu nombre aparecerá junto a las canciones que agregues.</p></div>
            <label class="field-label" for="guest-name">Tu apodo</label>
            <input id="guest-name" [value]="nameDraft()" (input)="updateName($event)" (keydown.enter)="saveName()" placeholder="Ej. Sofía" maxlength="24" autocomplete="nickname" autofocus />
            <button class="primary-button" type="button" (click)="saveName()" [disabled]="!nameDraft().trim() || joining()">{{ joining() ? 'Entrando…' : 'Entrar a la sala' }}</button>
          </section>
        } @else {
          <section class="card search-card">
            <div class="section-heading"><div><p class="eyebrow">Hola, {{ guestName() }}</p><h2>Pide una canción</h2></div><span class="queue-count">{{ queue().length }} en cola</span></div>
            <label class="field-label" for="song-search">Canción o artista</label>
            <div class="search-field" [class.is-searching]="searching()">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input id="song-search" [value]="query()" (input)="updateQuery($event)" placeholder="¿Qué quieres escuchar?" [attr.aria-busy]="searching()" autocomplete="off" />
              @if (searching()) { <span class="spinner" aria-hidden="true"></span> }
            </div>
            @if (searching()) { <p class="search-status" aria-live="polite">Buscando “{{ query().trim() }}”…</p> }
            <div class="results" [class.is-loading]="searching()">
              @if (searchError()) { <p class="empty-state error-state">{{ searchError() }}</p> }
              @else {
                @for (song of results(); track song.spotifyTrackId) {
                  <button class="song" type="button" (click)="requestSong(song)" [disabled]="searching() || addingId() === song.spotifyTrackId" [attr.aria-label]="'Agregar ' + song.title + ' de ' + song.artist">
                    @if (song.albumImageUrl) { <img class="song-art" [src]="song.albumImageUrl" alt="" /> } @else { <span class="song-art">♫</span> }
                    <span class="song-copy"><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span><span class="add">{{ addingId() === song.spotifyTrackId ? '…' : '+' }}</span>
                  </button>
                } @empty { <p class="empty-state">{{ emptySearchLabel() }}</p> }
              }
            </div>
            @if (feedback()) {
              <div class="feedback" [class.is-warning]="feedbackKind() === 'duplicate' || feedbackKind() === 'closed'" aria-live="polite">
                <span aria-hidden="true">{{ feedbackKind() === 'added' ? '✓' : '!' }}</span><p>{{ feedback() }}</p>
                @if (feedbackKind() === 'added') { <button type="button" (click)="requestAnother()">Pedir otra</button> }
              </div>
            }
          </section>
        }

        <section class="card queue-card">
          <div class="section-heading"><div><p class="eyebrow">La fila musical</p><h2>Lo que sigue</h2></div><span class="queue-count">{{ queue().length }} canciones</span></div>
          @if (queue().length) {
            <ol>
              @for (item of queue(); track item.id; let index = $index) {
                <li [id]="'queue-item-' + item.id" [class.is-highlighted]="highlightedId() === item.id" [class.is-playing]="item.startedAt">
                  <span class="position">{{ item.startedAt ? '▶' : index + 1 }}</span>
                  @if (item.albumImageUrl) { <img class="queue-art" [src]="item.albumImageUrl" alt="" /> } @else { <span class="queue-art art-placeholder">♫</span> }
                  <span class="track-copy"><strong>{{ item.title }}</strong><small>{{ item.artist }}</small><small class="requested">Pedida por {{ item.requestedBy }}</small>
                    @if (item.startedAt) { <small class="now-playing">Sonando ahora</small> }
                    @if (highlightedId() === item.id) { <small class="just-added">Acabas de agregarla</small> }
                  </span>
                </li>
              }
            </ol>
          } @else { <div class="empty-queue"><span aria-hidden="true">♫</span><p>La pista está libre.<br />Sé la primera persona en elegir una canción.</p></div> }
        </section>
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .page-shell { display: grid; gap: 1.5rem; margin: 0 auto; max-width: 43rem; min-height: 100dvh; padding: 1.5rem 1.25rem 5rem; }
    .topbar, .status-row, .section-heading { align-items: center; display: flex; }
    .topbar, .section-heading { justify-content: space-between; gap: 1rem; }
    .topbar { flex-wrap: wrap; }
    .brand { align-items: center; color: var(--tonavia-ink); display: inline-flex; font-size: 1.12rem; font-weight: 800; gap: 0.6rem; letter-spacing: -0.04em; text-decoration: none; }
    .brand-mark { align-items: center; background: linear-gradient(145deg, var(--tonavia-accent), #d3b7ff); border-radius: 0.55rem; color: #160d24; display: inline-flex; height: 2rem; justify-content: center; width: 2rem; }
    .theme-toggle { margin-left: auto; }
    .room-code, .queue-count, .step { border: 1px solid var(--tonavia-border); border-radius: 999px; color: var(--tonavia-muted); font-size: 0.73rem; font-weight: 700; letter-spacing: 0.04em; padding: 0.45rem 0.7rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(2.65rem, 12vw, 5rem); letter-spacing: -0.075em; line-height: 0.92; margin-top: 0.65rem; text-wrap: balance; }
    h2 { font-size: 1.35rem; letter-spacing: -0.035em; }
    .intro { padding: 2rem 0 0.5rem; }
    .status-row { gap: 0.5rem; }
    .status-dot { background: var(--tonavia-success); border-radius: 50%; box-shadow: 0 0 0.8rem rgba(74, 222, 128, 0.8); height: 0.5rem; width: 0.5rem; }
    .status-dot.is-closed { background: var(--tonavia-muted); box-shadow: none; }
    .eyebrow { color: var(--tonavia-accent); font-size: 0.75rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    .intro > p { color: var(--tonavia-muted); line-height: 1.6; margin-top: 1rem; max-width: 32rem; }
    .card, .state-card, .now-playing-card { backdrop-filter: blur(18px); background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.5rem; box-shadow: var(--tonavia-shadow); }
    .card { padding: 1.25rem; }
    .state-card { align-items: center; display: flex; gap: 1rem; margin-top: 20vh; padding: 1.5rem; }
    .state-card h1 { font-size: 1.5rem; margin: 0; }
    .state-card p, .profile-card p, .closed-card p { color: var(--tonavia-muted); line-height: 1.5; margin-top: 0.25rem; }
    .loader, .spinner { animation: spin 0.7s linear infinite; border: 2px solid var(--tonavia-border); border-radius: 50%; border-top-color: var(--tonavia-accent); }
    .loader { height: 2rem; width: 2rem; }
    .profile-card { display: grid; gap: 0.9rem; }
    .step { justify-self: start; }
    .field-label { color: var(--tonavia-ink); font-size: 0.8rem; font-weight: 750; }
    input { background: var(--tonavia-control); border: 1px solid var(--tonavia-border); border-radius: 0.9rem; color: var(--tonavia-ink); min-height: 3.1rem; padding: 0.8rem 0.95rem; transition: border-color 160ms ease, box-shadow 160ms ease; width: 100%; }
    input::placeholder { color: var(--tonavia-control-placeholder); }
    input:focus { border-color: var(--tonavia-accent); box-shadow: 0 0 0 4px rgba(169, 112, 255, 0.1); }
    button { border: 0; cursor: pointer; font: inherit; }
    button:disabled { cursor: wait; opacity: 0.5; }
    .primary-button { background: linear-gradient(135deg, var(--tonavia-accent-strong), var(--tonavia-accent)); border-radius: 999px; color: #fff; font-weight: 800; min-height: 3.1rem; padding: 0.8rem 1rem; }
    .search-card { display: grid; gap: 0.9rem; }
    .search-field { display: grid; position: relative; }
    .search-field input { padding-left: 2.8rem; padding-right: 2.8rem; }
    .search-icon { color: var(--tonavia-muted); font-size: 1.6rem; left: 0.85rem; line-height: 1; position: absolute; top: 50%; transform: translateY(-55%); }
    .spinner { height: 1.05rem; position: absolute; right: 0.95rem; top: calc(50% - 0.525rem); width: 1.05rem; }
    .search-status { color: var(--tonavia-accent); font-size: 0.82rem; font-weight: 700; }
    .results { display: grid; gap: 0.55rem; }
    .results.is-loading { opacity: 0.5; pointer-events: none; }
    .song { align-items: center; background: var(--tonavia-card-hover); border: 1px solid transparent; border-radius: 1rem; color: var(--tonavia-ink); display: grid; gap: 0.8rem; grid-template-columns: auto minmax(0, 1fr) auto; padding: 0.65rem; text-align: left; transition: background 160ms ease, border-color 160ms ease, transform 160ms ease; width: 100%; }
    .song:hover { background: var(--tonavia-surface-strong); border-color: var(--tonavia-border); transform: translateY(-1px); }
    .song-art, .queue-art, .art-placeholder { align-items: center; background: #2e263b; border-radius: 0.75rem; color: var(--tonavia-accent); display: inline-flex; flex: none; height: 3rem; justify-content: center; object-fit: cover; width: 3rem; }
    .song-copy, .track-copy { min-width: 0; }
    strong, small { display: block; }
    .song strong, .track-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    small { color: var(--tonavia-muted); font-size: 0.8rem; margin-top: 0.18rem; }
    .add { align-items: center; background: rgba(169, 112, 255, 0.15); border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; font-size: 1.35rem; font-weight: 700; height: 2rem; justify-content: center; width: 2rem; }
    .empty-state { color: var(--tonavia-muted); line-height: 1.5; padding: 1.5rem 0 0.5rem; text-align: center; }
    .error-state { color: var(--tonavia-danger); }
    .feedback { align-items: center; background: rgba(74, 222, 128, 0.11); border: 1px solid rgba(74, 222,128,0.28); border-radius: 1rem; color: var(--tonavia-success); display: grid; gap: 0.7rem; grid-template-columns: auto 1fr auto; padding: 0.85rem; position: sticky; top: 0.75rem; z-index: 2; }
    .feedback > span { align-items: center; background: rgba(74, 222, 128, 0.14); border-radius: 50%; display: inline-flex; font-weight: 900; height: 1.8rem; justify-content: center; width: 1.8rem; }
    .feedback p { color: var(--tonavia-ink); font-size: 0.83rem; font-weight: 650; line-height: 1.4; }
    .feedback button { background: transparent; color: var(--tonavia-success); font-size: 0.78rem; font-weight: 800; }
    .feedback.is-warning { background: rgba(255,181,71,0.1); border-color: rgba(255,181,71,0.24); color: #ffbd59; }
    .feedback.is-warning > span { background: rgba(255,181,71,0.14); }
    .now-playing-card { align-items: center; background: linear-gradient(135deg, rgba(139,77,244,0.24), rgba(31,27,40,0.9)); display: grid; gap: 0.9rem; grid-template-columns: auto auto 1fr; padding: 0.85rem; }
    .now-playing-card img { border-radius: 0.8rem; height: 3.5rem; object-fit: cover; width: 3.5rem; }
    .now-playing-card p { color: var(--tonavia-success); font-size: 0.68rem; font-weight: 850; letter-spacing: 0.1em; text-transform: uppercase; }
    .sound-bars { align-items: end; display: flex; gap: 2px; height: 1rem; }
    .sound-bars i { animation: pulse 0.8s ease-in-out infinite alternate; background: var(--tonavia-success); border-radius: 2px; height: 45%; width: 3px; }
    .sound-bars i:nth-child(2) { animation-delay: 0.2s; height: 100%; }
    .sound-bars i:nth-child(3) { animation-delay: 0.4s; height: 70%; }
    .closed-card { align-items: center; display: flex; gap: 1rem; }
    .closed-icon { align-items: center; background: var(--tonavia-card-hover); border-radius: 50%; color: var(--tonavia-muted); display: inline-flex; flex: none; height: 2.8rem; justify-content: center; width: 2.8rem; }
    ol { display: grid; gap: 0.4rem; list-style: none; margin: 1rem 0 0; padding: 0; }
    li { align-items: center; border-radius: 1rem; display: grid; gap: 0.7rem; grid-template-columns: 1.8rem auto minmax(0, 1fr); padding: 0.55rem; transition: background 180ms ease; }
    li.is-highlighted { animation: reveal 700ms ease both; background: rgba(169,112,255,0.13); outline: 1px solid rgba(169,112,255,0.38); }
    li.is-playing { background: rgba(74,222,128,0.08); }
    .queue-art { height: 2.65rem; width: 2.65rem; }
    .position { align-items: center; color: var(--tonavia-muted); display: inline-flex; font-size: 0.76rem; font-weight: 850; justify-content: center; }
    .requested { font-size: 0.72rem; }
    .now-playing { color: var(--tonavia-success); font-weight: 800; }
    .just-added { color: var(--tonavia-accent); font-weight: 800; }
    .empty-queue { color: var(--tonavia-muted); display: grid; gap: 0.75rem; justify-items: center; line-height: 1.55; padding: 2.4rem 1rem 1.4rem; text-align: center; }
    .empty-queue > span { align-items: center; background: rgba(169,112,255,0.1); border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; height: 3rem; justify-content: center; width: 3rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { to { height: 20%; opacity: 0.5; } }
    @keyframes reveal { from { opacity: 0; transform: translateY(0.6rem); } }
    @media (max-width: 28rem) { .page-shell { padding-inline: 1rem; } .theme-toggle { margin-left: 0; } .room-code { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .section-heading { align-items: flex-start; } .queue-count { white-space: nowrap; } .feedback { grid-template-columns: auto 1fr; } .feedback button { grid-column: 2; justify-self: start; padding: 0; } }
  `
})
export class RoomPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(RoomSessionStore);
  private readonly spotify = inject(SpotifySearchService);
  private readonly theme = inject(ThemeService);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private highlightTimer?: ReturnType<typeof setTimeout>;

  protected readonly room = this.store.room;
  protected readonly queue = this.store.queue;
  protected readonly nowPlaying = this.store.nowPlaying;
  protected readonly guestName = this.store.guestName;
  protected readonly isActive = this.store.isActive;
  protected readonly loadingRoom = signal(true);
  protected readonly joining = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<SpotifyTrack[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');
  protected readonly feedback = signal('');
  protected readonly feedbackKind = signal<'added' | 'duplicate' | 'closed' | ''>('');
  protected readonly highlightedId = signal('');
  protected readonly addingId = signal('');
  protected readonly themePreference = this.theme.preference;

  constructor() {
    void this.loadRoom();
    const refreshTimer = setInterval(() => void this.store.refreshQueue(), 10_000);
    inject(DestroyRef).onDestroy(() => { clearInterval(refreshTimer); clearTimeout(this.searchTimer); clearTimeout(this.highlightTimer); });
  }

  protected emptySearchLabel(): string {
    if (this.searching()) return 'Buscando coincidencias…';
    return this.query().trim().length < 2 ? 'Escribe al menos 2 letras para empezar.' : 'No encontramos canciones con esa búsqueda.';
  }

  protected updateName(event: Event): void { this.nameDraft.set((event.target as HTMLInputElement).value); }
  protected setTheme(preference: ThemePreference): void { this.theme.setPreference(preference); }

  protected async saveName(): Promise<void> {
    if (!this.nameDraft().trim() || this.joining()) return;
    this.joining.set(true);
    try { await this.store.joinRoom(this.roomCode(), this.nameDraft()); } finally { this.joining.set(false); }
  }

  protected updateQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.feedback.set('');
    const term = value.trim();
    this.searching.set(term.length >= 2);
    this.searchError.set('');
    if (term.length < 2) this.results.set([]);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.search(value), 350);
  }

  protected requestAnother(): void {
    this.query.set(''); this.results.set([]); this.feedback.set('');
    setTimeout(() => document.getElementById('song-search')?.focus(), 0);
  }

  protected async requestSong(song: SpotifyTrack): Promise<void> {
    this.addingId.set(song.spotifyTrackId);
    this.feedbackKind.set('added');
    this.feedback.set(`Agregando “${song.title}”…`);
    try {
      const result = await this.store.addSong(this.toQueueSong(song));
      if (result.status === 'closed') { this.feedbackKind.set('closed'); this.feedback.set(result.message); return; }
      this.feedbackKind.set(result.status);
      this.feedback.set(result.status === 'added' ? `“${result.title}” quedó en la posición ${result.position}.` : `“${result.title}” ya está en la posición ${result.position}.`);
      if (result.itemId) this.revealQueuedSong(result.itemId);
    } catch {
      this.feedbackKind.set('closed'); this.feedback.set('No pudimos agregar la canción. Inténtalo de nuevo.');
    } finally { this.addingId.set(''); }
  }

  private async loadRoom(): Promise<void> { try { await this.store.openRoom(this.roomCode()); } finally { this.loadingRoom.set(false); } }
  private roomCode(): string { return this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código'; }

  private revealQueuedSong(itemId: string): void {
    this.highlightedId.set(itemId);
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => { if (this.highlightedId() === itemId) this.highlightedId.set(''); }, 8000);
    setTimeout(() => document.getElementById(`queue-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  private async search(value: string): Promise<void> {
    const term = value.trim();
    if (term.length < 2) { this.results.set([]); this.searchError.set(''); this.searching.set(false); return; }
    this.searching.set(true); this.searchError.set('');
    try { this.results.set(await this.spotify.search(term)); }
    catch { this.results.set([]); this.searchError.set('No pudimos buscar en Spotify. Inténtalo de nuevo.'); }
    finally { this.searching.set(false); }
  }

  private toQueueSong(song: SpotifyTrack): Omit<QueueItem, 'id' | 'requestedBy'> {
    return { albumImageUrl: song.albumImageUrl, artist: song.artist, spotifyTrackId: song.spotifyTrackId, title: song.title };
  }
}
