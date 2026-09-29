import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';

import { SpotifyPlayerService } from '../../core/spotify/spotify-player.service';
import { RoomSessionStore } from '../rooms/room-session.store';
import { PlaybackSyncService } from './playback-sync.service';

@Component({
  selector: 'app-admin-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <section class="hero">
        <p class="eyebrow">Tonavia para anfitriones</p>
        <h1>Tu reunión, en el ritmo de todos.</h1>
        <p class="lead">Crea una sala, comparte el QR y deja que tus invitados construyan la lista.</p>
      </section>

      @if (restoring()) {
        <section class="setup-card">
          <p>Buscando tu sala…</p>
        </section>
      } @else if (!room()) {
        <section class="setup-card">
          <h2>Crea tu sala</h2>
          <p>Elige un nombre y tendrás un enlace único para compartir con tus invitados.</p>
          <label for="room-name">Nombre de la reunión</label>
          <input id="room-name" [value]="roomName()" (input)="updateRoomName($event)" />
          <button type="button" (click)="createRoom()">Crear sala y QR</button>
        </section>

        <section class="setup-card">
          <h2>¿Ya tienes una sala?</h2>
          <p>Escribe el código que aparece bajo el QR para volver a ver su cola.</p>
          <label for="room-code">Código de la sala</label>
          <input id="room-code" [value]="roomCode()" (input)="updateRoomCode($event)" placeholder="Ej. 2BWB1LHFWALQ" />
          <button class="secondary" type="button" (click)="openExistingRoom()">Abrir sala existente</button>
          @if (openError()) {
            <p class="error">{{ openError() }}</p>
          }
        </section>
      } @else {
        <section class="room-card" aria-live="polite">
          <div>
            <p class="eyebrow">{{ room()!.status === 'active' ? 'Sala activa' : 'Sala cerrada' }}</p>
            <h2>{{ room()!.name }}</h2>
            <p>Comparte el QR. Tus invitados podrán elegir canciones desde su navegador.</p>
          </div>

          <div class="qr-panel">
            @if (qrDataUrl()) {
              <img [src]="qrDataUrl()" alt="Código QR para entrar a la sala" />
            }
            <span>Código: {{ room()!.code }}</span>
          </div>

          <div class="actions">
            <a [routerLink]="['/s', room()!.code]">Abrir sala</a>
            <button class="secondary" type="button" (click)="copyLink()">{{ copyLabel() }}</button>
            @if (room()!.status === 'active') {
              <button class="danger" type="button" (click)="closeRoom()">Cerrar evento</button>
            }
          </div>
        </section>

        @if (room()!.status === 'active') {
          <section class="spotify-card">
            <div>
              <p class="eyebrow">Spotify</p>
              @if (!spotifyConfigured) {
                <h2>Spotify no está configurado</h2>
                <p>Falta la variable SPOTIFY_CLIENT_ID en el despliegue.</p>
              } @else if (!spotifyConnected()) {
                <h2>Conecta tu Spotify</h2>
                <p>Tonavia pondrá la cola en tu Spotify, marcará lo que está sonando y quitará cada canción cuando termine. Requiere Spotify Premium.</p>
              } @else if (playback()?.title) {
                <h2>{{ playback()!.isPlaying ? 'Sonando en Spotify' : 'En pausa en Spotify' }}</h2>
                <p><strong>{{ playback()!.title }}</strong> · {{ playback()!.artist }}</p>
                @if (playback()!.deviceName) {
                  <p class="hint">En {{ playback()!.deviceName }}</p>
                }
              } @else {
                <h2>Spotify conectado</h2>
                <p>Abre Spotify en tu dispositivo y pulsa “Reproducir la cola”. Deja esta pantalla abierta para que la lista se sincronice.</p>
              }
              @if (spotifyError()) {
                <p class="error">{{ spotifyError() }}</p>
              }
            </div>
            <div class="actions">
              @if (spotifyConfigured && !spotifyConnected()) {
                <button type="button" (click)="connectSpotify()">Conectar Spotify</button>
              } @else if (spotifyConnected()) {
                <button type="button" (click)="playQueue()" [disabled]="!queue().length">Reproducir la cola</button>
                <button class="secondary" type="button" (click)="disconnectSpotify()">Desconectar</button>
              }
            </div>
          </section>
        }

        <section class="queue-card">
          <div class="queue-heading">
            <div>
              <p class="eyebrow">En la cola</p>
              <h2>Lo que piden tus invitados</h2>
            </div>
            <span>{{ queue().length }} canciones</span>
          </div>
          @if (queue().length) {
            <ol>
              @for (item of queue(); track item.id; let index = $index) {
                <li [class.is-playing]="item.startedAt">
                  <span class="position">{{ item.startedAt ? '▶' : index + 1 }}</span>
                  <span>
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.artist }} · {{ item.requestedBy }}</small>
                    @if (item.startedAt) {
                      <small class="now-playing">Sonando ahora</small>
                    }
                  </span>
                  <button class="remove" type="button" (click)="removeItem(item.id)" [attr.aria-label]="'Quitar ' + item.title">Quitar</button>
                </li>
              }
            </ol>
          } @else {
            <p class="empty-state">Aún no hay canciones. Cuando alguien pida, aparecerá aquí.</p>
          }
        </section>
      }
    </main>
  `,
  styles: `
    .page-shell { display: grid; gap: 2rem; margin: 0 auto; max-width: 68rem; min-height: 100dvh; padding: 4rem 1.5rem; }
    .hero { max-width: 42rem; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(2.8rem, 8vw, 5rem); letter-spacing: -0.06em; line-height: 0.95; }
    h2 { font-size: 1.5rem; letter-spacing: -0.04em; }
    .eyebrow { color: var(--tonavia-accent); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .lead { color: var(--tonavia-muted); font-size: 1.15rem; line-height: 1.6; margin-top: 1.25rem; max-width: 35rem; }
    .setup-card, .room-card { background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.5rem; padding: 1.5rem; }
    .setup-card { display: grid; gap: 0.85rem; max-width: 34rem; }
    .setup-card p, .room-card p:not(.eyebrow) { color: var(--tonavia-muted); line-height: 1.5; }
    label { font-size: 0.88rem; font-weight: 700; margin-top: 0.5rem; }
    input { background: #fff; border: 1px solid var(--tonavia-border); border-radius: 0.75rem; color: var(--tonavia-ink); padding: 0.8rem 0.9rem; }
    button, a { align-items: center; border-radius: 999px; display: inline-flex; font: inherit; font-weight: 700; justify-content: center; padding: 0.8rem 1.15rem; text-decoration: none; }
    button { background: var(--tonavia-accent); border: 0; color: #fff; cursor: pointer; }
    .room-card { align-items: center; display: grid; gap: 1.5rem; grid-template-columns: 1fr auto; }
    .qr-panel { align-items: center; background: #fff; border-radius: 1rem; display: grid; gap: 0.45rem; padding: 0.75rem; text-align: center; }
    .qr-panel img { height: 9rem; width: 9rem; }
    .qr-panel span { color: var(--tonavia-muted); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.65rem; grid-column: 1 / -1; }
    a, .secondary { background: #fff; border: 1px solid var(--tonavia-border); color: var(--tonavia-ink); }
    .danger { background: #a52c43; }
    .setup-card .error, .spotify-card .error { color: #a52c43; font-weight: 700; }
    .spotify-card { align-items: center; background: #effaf2; border: 1px solid #bfe6c9; border-radius: 1.5rem; display: grid; gap: 1rem; grid-template-columns: 1fr auto; padding: 1.5rem; }
    .spotify-card .eyebrow { color: #1a8f4a; }
    .spotify-card p:not(.eyebrow) { color: var(--tonavia-muted); line-height: 1.5; margin-top: 0.4rem; }
    .spotify-card strong { color: var(--tonavia-ink); display: inline; }
    .spotify-card .actions { grid-column: auto; }
    .spotify-card button:not(.secondary) { background: #1db954; }
    .hint { font-size: 0.85rem; }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    li.is-playing { background: #effaf2; border-radius: 0.85rem; padding: 0.4rem; }
    .now-playing { color: #1a8f4a; font-weight: 700; }
    .remove { background: transparent; border: 1px solid var(--tonavia-border); color: var(--tonavia-muted); font-size: 0.8rem; padding: 0.4rem 0.8rem; }
    .queue-card { background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.5rem; padding: 1.5rem; }
    .queue-heading { align-items: center; display: flex; justify-content: space-between; gap: 1rem; }
    .queue-heading span, .empty-state, small { color: var(--tonavia-muted); }
    ol { display: grid; gap: 0.8rem; list-style: none; margin: 1.25rem 0 0; padding: 0; }
    li { align-items: center; display: grid; gap: 0.75rem; grid-template-columns: auto 1fr auto; }
    .position { align-items: center; background: #ece1ff; border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; font-size: 0.8rem; font-weight: 800; height: 1.75rem; justify-content: center; width: 1.75rem; }
    strong, small { display: block; }
    small { font-size: 0.82rem; margin-top: 0.18rem; }
    .empty-state { line-height: 1.5; margin-top: 1.25rem; }
    @media (max-width: 40rem) { .page-shell { padding-top: 2rem; } .room-card, .spotify-card { grid-template-columns: 1fr; } .qr-panel { justify-self: start; } }
  `
})
export class AdminPage {
  private readonly store = inject(RoomSessionStore);
  private readonly spotify = inject(SpotifyPlayerService);
  private readonly sync = inject(PlaybackSyncService);
  private readonly refreshTimer = setInterval(() => void this.store.refreshQueue(), 8000);

  protected readonly room = this.store.room;
  protected readonly queue = this.store.queue;
  protected readonly spotifyConfigured = this.spotify.isConfigured;
  protected readonly spotifyConnected = this.spotify.isConnected;
  protected readonly playback = this.sync.playback;
  protected readonly spotifyError = this.sync.error;
  protected readonly restoring = signal(false);
  protected readonly roomCode = signal('');
  protected readonly openError = signal('');
  protected readonly roomName = signal('Noche en casa');
  protected readonly qrDataUrl = signal('');
  protected readonly copyLabel = signal('Copiar enlace');
  protected readonly shareUrl = computed(() => {
    const room = this.room();
    return room ? `${window.location.origin}/s/${room.code}` : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.refreshTimer);
      this.sync.stop();
    });

    const room = this.room();
    if (room) {
      void this.generateQr();
      void this.store.hydrate(room.code);
    } else {
      void this.restoreRoom();
    }

    void this.startSpotifySync();
  }

  protected connectSpotify(): Promise<void> {
    return this.spotify.connect();
  }

  protected disconnectSpotify(): void {
    this.sync.stop();
    this.spotify.disconnect();
    this.playback.set(null);
    this.spotifyError.set('');
  }

  protected playQueue(): Promise<void> {
    return this.sync.playQueue();
  }

  protected async removeItem(itemId: string): Promise<void> {
    try {
      await this.store.removeItem(itemId);
    } catch {
      this.spotifyError.set('No se pudo quitar la canción. Solo el dispositivo que creó la sala puede hacerlo.');
    }
  }

  private async startSpotifySync(): Promise<void> {
    if (!this.spotify.isConfigured) return;

    try {
      const result = await this.spotify.completeConnectionFromUrl();
      if (result === 'denied') {
        this.spotifyError.set('No se completó la conexión con Spotify. Inténtalo de nuevo.');
      }
    } catch {
      this.spotifyError.set('Spotify rechazó la conexión. Revisa que tu cuenta esté autorizada en la app de Spotify.');
    }

    if (this.spotify.isConnected()) {
      this.sync.start();
    }
  }

  protected updateRoomName(event: Event): void {
    this.roomName.set((event.target as HTMLInputElement).value);
  }

  protected updateRoomCode(event: Event): void {
    this.roomCode.set((event.target as HTMLInputElement).value);
    this.openError.set('');
  }

  protected async openExistingRoom(): Promise<void> {
    const opened = await this.store.openRoomByCode(this.roomCode());
    if (!opened) {
      this.openError.set('No encontramos una sala con ese código.');
      return;
    }
    void this.generateQr();
  }

  private async restoreRoom(): Promise<void> {
    this.restoring.set(true);
    const restored = await this.store.restoreOwnedRoom();
    this.restoring.set(false);
    if (restored) {
      void this.generateQr();
    }
  }

  protected async createRoom(): Promise<void> {
    await this.store.createRoom(this.roomName());
    void this.generateQr();
  }

  protected async closeRoom(): Promise<void> {
    await this.store.closeRoom();
  }

  protected async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.shareUrl());
    this.copyLabel.set('Enlace copiado');
  }

  private async generateQr(): Promise<void> {
    this.qrDataUrl.set(await QRCode.toDataURL(this.shareUrl(), { margin: 1, width: 320 }));
  }
}
