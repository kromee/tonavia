import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { QueueItem, RoomSessionStore } from '../rooms/room-session.store';

const SONGS: Omit<QueueItem, 'id' | 'requestedBy'>[] = [
  { title: 'DÁKITI', artist: 'Bad Bunny, Jhayco' },
  { title: 'Flowers', artist: 'Miley Cyrus' },
  { title: 'As It Was', artist: 'Harry Styles' },
  { title: 'Provenza', artist: 'KAROL G' },
  { title: 'Blinding Lights', artist: 'The Weeknd' }
];

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
          <input [value]="query()" (input)="updateQuery($event)" placeholder="Busca por canción o artista" [disabled]="!isActive()" />
          <div class="results">
            @for (song of results(); track song.title) {
              <button class="song" type="button" (click)="requestSong(song)" [disabled]="!isActive()">
                <span class="song-art">♫</span>
                <span><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span>
                <span class="add">+</span>
              </button>
            } @empty {
              <p class="empty-state">No encontramos canciones de muestra con esa búsqueda.</p>
            }
          </div>
          @if (feedback()) {
            <p class="feedback">{{ feedback() }}</p>
          }
          <p class="notice">El catálogo de Spotify se conectará en la siguiente fase. Estas canciones son una demostración del flujo.</p>
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
              <li>
                <span class="position">{{ index + 1 }}</span>
                <span><strong>{{ item.title }}</strong><small>{{ item.artist }} · {{ item.requestedBy }}</small></span>
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
    input { background: #fff; border: 1px solid var(--tonavia-border); border-radius: 0.75rem; padding: 0.8rem 0.9rem; }
    button { border: 0; cursor: pointer; font: inherit; }
    .profile-card > button { background: var(--tonavia-ink); border-radius: 999px; color: #fff; font-weight: 700; padding: 0.85rem 1rem; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    .section-heading { align-items: center; display: flex; justify-content: space-between; gap: 1rem; }
    .section-heading span { color: var(--tonavia-muted); font-size: 0.85rem; }
    .search-card { display: grid; gap: 1rem; }
    .results { display: grid; gap: 0.5rem; }
    .song { align-items: center; background: #fff; border: 1px solid var(--tonavia-border); border-radius: 0.85rem; color: var(--tonavia-ink); display: grid; gap: 0.75rem; grid-template-columns: auto 1fr auto; padding: 0.65rem; text-align: left; }
    .song-art { align-items: center; background: #ece1ff; border-radius: 0.65rem; color: var(--tonavia-accent); display: inline-flex; font-size: 1.1rem; height: 2.5rem; justify-content: center; width: 2.5rem; }
    strong, small { display: block; }
    small { color: var(--tonavia-muted); font-size: 0.82rem; margin-top: 0.18rem; }
    .add { color: var(--tonavia-accent); font-size: 1.5rem; font-weight: 600; padding: 0 0.25rem; }
    .notice, .feedback { font-size: 0.83rem; }
    .feedback { color: var(--tonavia-accent); font-weight: 700; }
    ol { display: grid; gap: 0.8rem; list-style: none; margin: 1.25rem 0 0; padding: 0; }
    li { align-items: center; display: grid; gap: 0.75rem; grid-template-columns: auto 1fr; }
    .position { align-items: center; background: #ece1ff; border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; font-size: 0.8rem; font-weight: 800; height: 1.75rem; justify-content: center; width: 1.75rem; }
    .empty-state { color: var(--tonavia-muted); line-height: 1.5; padding: 2rem 0 0.5rem; text-align: center; }
  `
})
export class RoomPage {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(RoomSessionStore);

  protected readonly room = this.store.room;
  protected readonly queue = this.store.queue;
  protected readonly guestName = this.store.guestName;
  protected readonly isActive = this.store.isActive;
  protected readonly nameDraft = signal('');
  protected readonly query = signal('');
  protected readonly feedback = signal('');
  protected readonly results = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return term ? SONGS.filter((song) => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(term)) : SONGS;
  });

  constructor() {
    void this.store.openRoom(this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código');
  }

  protected updateName(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  protected async saveName(): Promise<void> {
    await this.store.joinRoom(this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código', this.nameDraft());
  }

  protected updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected async requestSong(song: Omit<QueueItem, 'id' | 'requestedBy'>): Promise<void> {
    const result = await this.store.addSong(song);
    this.feedback.set(
      result === 'added'
        ? 'Tu canción ya está en la cola.'
        : result === 'duplicate'
          ? 'Esa canción ya está en la cola.'
          : 'La sala ya fue cerrada.'
    );
  }
}
