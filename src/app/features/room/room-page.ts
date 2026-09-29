import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SpotifySearchService, SpotifyTrack } from '../../core/spotify/spotify-search.service';
import { QueueItem, RoomSessionStore } from '../rooms/room-session.store';

@Component({
  selector: 'app-room-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <a class="brand" routerLink="/admin">Tonavia</a>

      <section class="intro">
        <p class="eyebrow">{{ room()?.status === 'active' ? 'Sala activa' : 'Sala cerrada' }}</p>
        <h1>{{ room()?.name }}</h1>
        <p>Elige una canción y súmala a la música de la reunión.</p>
      </section>

      @if (!guestName()) {
        <section class="card profile-card">
          <h2>¿Cómo te llamamos?</h2>
          <p>Tu apodo aparecerá junto a cada canción que agregues.</p>
          <input [value]="nameDraft()" (input)="updateName($event)" placeholder="Tu apodo" maxlength="24" />
          <button type="button" (click)="saveName()" [disabled]="!nameDraft().trim()">Continuar</button>
        </section>
      } @else {
        <section class="card search-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Pide una canción</p>
              <h2>Hola, {{ guestName() }}</h2>
            </div>
            <span>{{ queue().length }} en cola</span>
          </div>
          <label class="search-field" [class.is-searching]="searching()">
            <input
              [value]="query()"
              (input)="updateQuery($event)"
              placeholder="Busca por canción o artista"
              [disabled]="!isActive()"
              [attr.aria-busy]="searching()"
            />
            @if (searching()) {
              <span class="spinner" aria-hidden="true"></span>
            }
          </label>
          @if (searching()) {
            <p class="search-status" aria-live="polite">Buscando “{{ query().trim() }}” en Spotify…</p>
          }
          <div class="results" [class.is-loading]="searching()">
            @if (searchError()) {
              <p class="empty-state">{{ searchError() }}</p>
            } @else {
              @for (song of results(); track song.spotifyTrackId) {
                <button class="song" type="button" (click)="requestSong(song)" [disabled]="!isActive() || searching() || addingId() === song.spotifyTrackId">
                  @if (song.albumImageUrl) {
                    <img class="song-art" [src]="song.albumImageUrl" [alt]="song.title" />
                  } @else {
                    <span class="song-art">♫</span>
                  }
                  <span><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span>
                  <span class="add">+</span>
                </button>
              } @empty {
                <p class="empty-state">{{ emptySearchLabel() }}</p>
              }
            }
          </div>
          @if (feedback()) {
            <p class="feedback" [class.is-warning]="feedbackKind() === 'duplicate'" aria-live="assertive">
              {{ feedback() }}
            </p>
          }
        </section>
      }

      <section class="card queue-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">En la cola</p>
            <h2>Lo que sigue</h2>
          </div>
          <span>{{ queue().length }} canciones</span>
        </div>
        @if (queue().length) {
          <ol>
            @for (item of queue(); track item.id; let index = $index) {
              <li [id]="'queue-item-' + item.id" [class.is-highlighted]="highlightedId() === item.id">
                <span class="position">{{ index + 1 }}</span>
                <span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.artist }} · {{ item.requestedBy }}</small>
                  @if (highlightedId() === item.id) {
                    <small class="just-added">Acabas de agregar esta canción</small>
                  }
                </span>
              </li>
            }
          </ol>
        } @else {
          <p class="empty-state">La lista está lista para su primera canción.</p>
        }
      </section>
    </main>
  `,
  styles: `
    .page-shell { display: grid; gap: 1.5rem; margin: 0 auto; max-width: 40rem; min-height: 100dvh; padding: 2rem 1.5rem 4rem; }
    .brand { color: var(--tonavia-ink); font-size: 1.25rem; font-weight: 800; letter-spacing: -0.05em; text-decoration: none; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(2.4rem, 12vw, 4.5rem); letter-spacing: -0.07em; line-height: 0.95; margin-top: 0.35rem; }
    h2 { font-size: 1.15rem; }
    .eyebrow { color: var(--tonavia-accent); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .intro > p:last-child { color: var(--tonavia-muted); line-height: 1.6; margin-top: 1rem; }
    .card { background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.25rem; padding: 1.25rem; }
    .profile-card { display: grid; gap: 0.85rem; }
    .profile-card p, .notice { color: var(--tonavia-muted); line-height: 1.5; }
    input { background: #fff; border: 1px solid var(--tonavia-border); border-radius: 0.75rem; padding: 0.8rem 0.9rem; width: 100%; }
    .search-field { display: grid; position: relative; }
    .search-field.is-searching input { padding-right: 2.75rem; }
    .spinner { animation: spin 0.7s linear infinite; border: 2px solid var(--tonavia-border); border-radius: 50%; border-top-color: var(--tonavia-accent); height: 1.1rem; position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); width: 1.1rem; }
    .search-status { color: var(--tonavia-accent); font-size: 0.88rem; font-weight: 700; }
    .results.is-loading { opacity: 0.45; pointer-events: none; }
    @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }
    button { border: 0; cursor: pointer; font: inherit; }
    .profile-card > button { background: var(--tonavia-ink); border-radius: 999px; color: #fff; font-weight: 700; padding: 0.85rem 1rem; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    .section-heading { align-items: center; display: flex; justify-content: space-between; gap: 1rem; }
    .section-heading span { color: var(--tonavia-muted); font-size: 0.85rem; }
    .search-card { display: grid; gap: 1rem; }
    .results { display: grid; gap: 0.5rem; }
    .song { align-items: center; background: #fff; border: 1px solid var(--tonavia-border); border-radius: 0.85rem; color: var(--tonavia-ink); display: grid; gap: 0.75rem; grid-template-columns: auto 1fr auto; padding: 0.65rem; text-align: left; }
    .song-art { align-items: center; background: #ece1ff; border-radius: 0.65rem; color: var(--tonavia-accent); display: inline-flex; font-size: 1.1rem; height: 2.5rem; justify-content: center; object-fit: cover; width: 2.5rem; }
    strong, small { display: block; }
    small { color: var(--tonavia-muted); font-size: 0.82rem; margin-top: 0.18rem; }
    .add { color: var(--tonavia-accent); font-size: 1.5rem; font-weight: 600; padding: 0 0.25rem; }
    .notice, .feedback { font-size: 0.83rem; }
    .feedback { background: #ece1ff; border-radius: 0.85rem; color: var(--tonavia-accent); font-weight: 700; line-height: 1.45; padding: 0.85rem 1rem; }
    .feedback.is-warning { background: #fff4e5; color: #8a5a12; }
    ol { display: grid; gap: 0.8rem; list-style: none; margin: 1.25rem 0 0; padding: 0; }
    li { align-items: center; border-radius: 0.85rem; display: grid; gap: 0.75rem; grid-template-columns: auto 1fr; padding: 0.35rem 0.45rem; }
    li.is-highlighted { background: #ece1ff; outline: 1px solid var(--tonavia-accent); }
    .just-added { color: var(--tonavia-accent); font-weight: 700; }
    .position { align-items: center; background: #ece1ff; border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; font-size: 0.8rem; font-weight: 800; height: 1.75rem; justify-content: center; width: 1.75rem; }
    .empty-state { color: var(--tonavia-muted); line-height: 1.5; padding: 2rem 0 0.5rem; text-align: center; }
  `
})
export class RoomPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(RoomSessionStore);
  private readonly spotify = inject(SpotifySearchService);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected readonly room = this.store.room;
  protected readonly queue = this.store.queue;
  protected readonly guestName = this.store.guestName;
  protected readonly isActive = this.store.isActive;
  protected readonly nameDraft = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<SpotifyTrack[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');
  protected readonly feedback = signal('');
  protected readonly feedbackKind = signal<'added' | 'duplicate' | 'closed' | ''>('');
  protected readonly highlightedId = signal('');
  protected readonly addingId = signal('');
  private highlightTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.store.openRoom(this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código');
  }

  protected emptySearchLabel(): string {
    if (this.searching()) {
      return 'Filtrando resultados…';
    }

    return this.query().trim().length < 2
      ? 'Escribe al menos 2 letras para buscar en Spotify.'
      : 'No encontramos canciones con esa búsqueda.';
  }

  protected updateName(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  protected async saveName(): Promise<void> {
    await this.store.joinRoom(this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código', this.nameDraft());
  }

  protected updateQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    const term = value.trim();
    this.searching.set(term.length >= 2);
    this.searchError.set('');
    if (term.length < 2) {
      this.results.set([]);
    }
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      void this.search(value);
    }, 350);
  }

  protected async requestSong(song: SpotifyTrack): Promise<void> {
    this.addingId.set(song.spotifyTrackId);
    const result = await this.store.addSong(this.toQueueSong(song));
    this.addingId.set('');

    if (result.status === 'closed') {
      this.feedbackKind.set('closed');
      this.feedback.set('La sala ya fue cerrada.');
      return;
    }

    this.feedbackKind.set(result.status);
    this.feedback.set(
      result.status === 'added'
        ? `Listo: “${result.title}” quedó en el lugar ${result.position} de la cola.`
        : `“${result.title}” ya estaba en la cola, en el lugar ${result.position}.`
    );
    this.revealQueuedSong(result.itemId);
  }

  private revealQueuedSong(itemId: string): void {
    this.highlightedId.set(itemId);
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      if (this.highlightedId() === itemId) {
        this.highlightedId.set('');
      }
    }, 8000);

    setTimeout(() => {
      document.getElementById(`queue-item-${itemId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 80);
  }

  private async search(value: string): Promise<void> {
    const term = value.trim();
    if (term.length < 2) {
      this.results.set([]);
      this.searchError.set('');
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.searchError.set('');

    try {
      this.results.set(await this.spotify.search(term));
    } catch {
      this.results.set([]);
      this.searchError.set('No se pudo buscar en Spotify. Inténtalo de nuevo.');
    } finally {
      this.searching.set(false);
    }
  }

  private toQueueSong(song: SpotifyTrack): Omit<QueueItem, 'id' | 'requestedBy'> {
    return {
      albumImageUrl: song.albumImageUrl,
      artist: song.artist,
      spotifyTrackId: song.spotifyTrackId,
      title: song.title
    };
  }
}
