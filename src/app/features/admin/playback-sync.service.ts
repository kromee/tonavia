import { Injectable, inject, signal } from '@angular/core';

import { SpotifyPlayback, SpotifyPlayerError, SpotifyPlayerService } from '../../core/spotify/spotify-player.service';
import { QueueItem, RoomSessionStore } from '../rooms/room-session.store';

const POLL_INTERVAL_MS = 5000;
const RATE_LIMIT_PAUSE_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class PlaybackSyncService {
  private readonly player = inject(SpotifyPlayerService);
  private readonly store = inject(RoomSessionStore);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private canControl = true;
  private lastTrackId: string | null = null;
  private lastTrackChangeAt = 0;
  private pausedUntil = 0;

  readonly playback = signal<SpotifyPlayback | null>(null);
  readonly error = signal('');

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async playQueue(): Promise<void> {
    const next = this.nextPlayable();
    if (!next) {
      this.error.set('No hay canciones de Spotify en la cola para reproducir.');
      return;
    }

    try {
      await this.player.play(next.spotifyTrackId!);
      this.canControl = true;
      await this.store.markSentToSpotify(next.id);
      this.error.set('');
      setTimeout(() => void this.tick(), 1500);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async tick(): Promise<void> {
    const room = this.store.room();
    if (this.busy || !this.player.isConnected() || !room?.id || room.status !== 'active' || Date.now() < this.pausedUntil) {
      return;
    }

    this.busy = true;
    try {
      const state = await this.player.playback();
      this.playback.set(state);
      this.error.set('');

      const trackId = state?.trackId ?? null;
      if (trackId && trackId !== this.lastTrackId) {
        await this.store.syncPlayback(trackId);
        if (this.lastTrackId) this.lastTrackChangeAt = Date.now();
        this.lastTrackId = trackId;
      }

      if (state && this.canControl) {
        await this.feedNext();
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.busy = false;
    }
  }

  private async feedNext(): Promise<void> {
    const waitingInSpotify = this.store
      .queue()
      .some((item) => !item.startedAt && item.sentToSpotifyAt && Date.parse(item.sentToSpotifyAt) > this.lastTrackChangeAt);
    if (waitingInSpotify) return;

    const next = this.nextPlayable();
    if (!next) return;

    await this.player.addToQueue(next.spotifyTrackId!);
    await this.store.markSentToSpotify(next.id);
  }

  private nextPlayable(): QueueItem | undefined {
    return this.store.queue().find((item) => !item.startedAt && SpotifyPlayerService.isSpotifyTrackId(item.spotifyTrackId));
  }

  private handleError(error: unknown): void {
    if (error instanceof SpotifyPlayerError) {
      switch (error.kind) {
        case 'premium':
          this.canControl = false;
          this.error.set('Tu cuenta de Spotify necesita Premium para que Tonavia agregue canciones a la reproducción.');
          return;
        case 'no-device':
          this.error.set('Abre la app de Spotify en tu teléfono, computadora o bocina y vuelve a intentarlo.');
          return;
        case 'rate-limit':
          this.pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
          this.error.set('Spotify pidió una pausa breve; la sincronización seguirá en unos segundos.');
          return;
        case 'auth':
          this.error.set('La conexión con Spotify expiró. Vuelve a conectarla.');
          return;
        default:
          this.error.set(`Spotify: ${error.message}`);
          return;
      }
    }

    const message = (error as { message?: string } | null)?.message ?? '';
    this.error.set(
      message.includes('only the room owner')
        ? 'Esta sala se creó desde otro dispositivo; solo ese dispositivo puede sincronizarla con Spotify.'
        : 'No se pudo actualizar la cola con lo que suena en Spotify.'
    );
  }
}
