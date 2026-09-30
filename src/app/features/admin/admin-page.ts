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
      <header class="topbar">
        <a class="brand" routerLink="/admin"><span class="brand-mark">T</span>Tonavia</a>
        <span class="host-label">Panel del anfitrión</span>
      </header>

      <section class="hero">
        <p class="eyebrow">Música compartida</p>
        <h1>{{ room() ? 'La noche está en tus manos.' : 'Tu reunión, en el ritmo de todos.' }}</h1>
        <p class="lead">{{ room() ? 'Comparte, reproduce y mantén el pulso de tu sala desde un solo lugar.' : 'Crea una sala, comparte el QR y deja que tus invitados construyan la lista.' }}</p>
      </section>

      @if (restoring()) {
        <section class="loading-card" aria-live="polite"><span class="loader" aria-hidden="true"></span><div><h2>Buscando tu sala</h2><p>Esto tomará solo un momento.</p></div></section>
      } @else if (!room()) {
        <div class="setup-grid">
          <section class="setup-card primary-card">
            <span class="card-number">01</span><div><h2>Crea tu sala</h2><p>Elige un nombre memorable. El enlace y el QR se generan al instante.</p></div>
            <label for="room-name">Nombre de la reunión</label>
            <input id="room-name" [value]="roomName()" (input)="updateRoomName($event)" (keydown.enter)="createRoom()" maxlength="48" />
            <button type="button" (click)="createRoom()" [disabled]="creating()">{{ creating() ? 'Creando sala…' : 'Crear sala y QR' }}</button>
          </section>

          <section class="setup-card secondary-card">
            <span class="card-number">02</span><div><h2>Vuelve a tu sala</h2><p>Escribe el código que aparece debajo del QR para recuperar su cola.</p></div>
            <label for="room-code">Código de la sala</label>
            <input id="room-code" [value]="roomCode()" (input)="updateRoomCode($event)" (keydown.enter)="openExistingRoom()" placeholder="Ej. 2BWB1LHFWALQ" autocomplete="off" />
            <button class="secondary" type="button" (click)="openExistingRoom()" [disabled]="opening() || !roomCode().trim()">{{ opening() ? 'Buscando…' : 'Abrir sala existente' }}</button>
            @if (openError()) { <p class="error" role="alert">{{ openError() }}</p> }
          </section>
        </div>
      } @else {
        <section class="room-card" aria-live="polite">
          <div class="room-summary">
            <div class="live-status" [class.is-closed]="room()!.status !== 'active'"><span></span>{{ room()!.status === 'active' ? 'En vivo' : 'Finalizada' }}</div>
            <h2>{{ room()!.name }}</h2>
            <p>Invita a todos a elegir la música. El código también sirve para volver a esta sala.</p>
            <div class="actions">
              <button type="button" (click)="copyLink()">{{ copyLabel() }}</button>
              <a [routerLink]="['/s', room()!.code]">Vista de invitado</a>
            </div>
          </div>

          <div class="qr-panel">
            <div class="qr-frame">@if (qrDataUrl()) { <img [src]="qrDataUrl()" alt="Código QR para entrar a la sala" /> } @else { <span class="loader" aria-hidden="true"></span> }</div>
            <span>CÓDIGO · {{ room()!.code }}</span>
          </div>
        </section>

        @if (room()!.status === 'active') {
          <section class="spotify-card" [class.is-connected]="spotifyConnected()">
            <div class="spotify-icon" aria-hidden="true">●</div>
            <div class="spotify-copy">
              <p class="eyebrow">Spotify</p>
              @if (!spotifyConfigured) { <h2>Spotify no está configurado</h2><p>Agrega SPOTIFY_CLIENT_ID al despliegue para activar la reproducción.</p> }
              @else if (!spotifyConnected()) { <h2>Conecta el sonido</h2><p>Sincroniza la cola con tu dispositivo. Necesitas Spotify Premium.</p> }
              @else if (playback()?.title) {
                <h2>{{ playback()!.isPlaying ? 'Sonando ahora' : 'Reproducción en pausa' }}</h2><p><strong>{{ playback()!.title }}</strong> · {{ playback()!.artist }}</p>
                @if (playback()!.deviceName) { <p class="hint">En {{ playback()!.deviceName }}</p> }
                <div class="progress" role="progressbar" [attr.aria-valuenow]="progressPercent()" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="progressPercent()"></span></div>
              } @else { <h2>Spotify conectado</h2><p>Abre Spotify en tu dispositivo y comienza con la primera canción de la cola.</p> }
              @if (spotifyError()) { <p class="error" role="alert">{{ spotifyError() }}</p> }
            </div>
            <div class="spotify-actions">
              @if (spotifyConfigured && !spotifyConnected()) { <button type="button" (click)="connectSpotify()">Conectar Spotify</button> }
              @else if (spotifyConnected()) { <button type="button" (click)="playQueue()" [disabled]="!queue().length">{{ playback()?.title ? 'Reproducir siguiente' : 'Reproducir la cola' }}</button><button class="text-button" type="button" (click)="disconnectSpotify()">Desconectar</button> }
            </div>
          </section>
        }

        <section class="queue-card">
          <div class="queue-heading">
            <div><p class="eyebrow">Cola en tiempo real</p><h2>Lo que piden tus invitados</h2></div>
            <div class="queue-stat"><strong>{{ queue().length }}</strong><span>canciones</span></div>
          </div>
          @if (queue().length) {
            <ol>
              @for (item of queue(); track item.id; let index = $index) {
                <li [class.is-playing]="item.startedAt">
                  <span class="position">{{ item.startedAt ? '▶' : index + 1 }}</span>
                  @if (item.albumImageUrl) { <img class="track-art" [src]="item.albumImageUrl" alt="" /> } @else { <span class="track-art art-placeholder">♫</span> }
                  <span class="track-copy"><strong>{{ item.title }}</strong><small>{{ item.artist }}</small><small class="requested">Pedida por {{ item.requestedBy }}</small>@if (item.startedAt) { <small class="now-playing">Sonando ahora</small> }</span>
                  <button class="remove" type="button" (click)="removeItem(item.id)" [disabled]="removingId() === item.id" [attr.aria-label]="'Quitar ' + item.title">{{ removingId() === item.id ? 'Quitando…' : 'Quitar' }}</button>
                </li>
              }
            </ol>
          } @else { <div class="empty-state"><span aria-hidden="true">♫</span><h3>La cola está esperando</h3><p>Las canciones aparecerán aquí en cuanto alguien haga una petición.</p></div> }
        </section>

        @if (room()!.status === 'active') {
          <section class="danger-zone">
            @if (!confirmClosing()) {
              <div><h2>Cuando termine la reunión</h2><p>Cierra la sala para detener nuevas solicitudes.</p></div><button type="button" (click)="confirmClosing.set(true)">Cerrar evento</button>
            } @else {
              <div><h2>¿Cerrar la sala ahora?</h2><p>Los invitados conservarán la vista de la cola, pero ya no podrán pedir canciones.</p></div>
              <div class="confirm-actions"><button class="secondary" type="button" (click)="confirmClosing.set(false)">Cancelar</button><button class="danger" type="button" (click)="closeRoom()" [disabled]="closing()">{{ closing() ? 'Cerrando…' : 'Sí, cerrar evento' }}</button></div>
            }
          </section>
        }
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .page-shell { display: grid; gap: 2rem; margin: 0 auto; max-width: 72rem; min-height: 100dvh; padding: 1.5rem 1.5rem 5rem; }
    .topbar { align-items: center; display: flex; justify-content: space-between; }
    .brand { align-items: center; color: var(--tonavia-ink); display: inline-flex; font-size: 1.15rem; font-weight: 800; gap: 0.6rem; letter-spacing: -0.04em; text-decoration: none; }
    .brand-mark { align-items: center; background: linear-gradient(145deg, var(--tonavia-accent), #d3b7ff); border-radius: 0.55rem; color: #160d24; display: inline-flex; height: 2rem; justify-content: center; width: 2rem; }
    .host-label { border: 1px solid var(--tonavia-border); border-radius: 999px; color: var(--tonavia-muted); font-size: 0.72rem; font-weight: 750; padding: 0.45rem 0.75rem; }
    .hero { max-width: 50rem; padding: 5rem 0 1.5rem; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(3rem, 7vw, 5.8rem); letter-spacing: -0.075em; line-height: 0.91; text-wrap: balance; }
    h2 { font-size: 1.45rem; letter-spacing: -0.04em; }
    .eyebrow { color: var(--tonavia-accent); font-size: 0.75rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
    .lead { color: var(--tonavia-muted); font-size: 1.12rem; line-height: 1.6; margin-top: 1.3rem; max-width: 38rem; }
    .setup-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .setup-card, .room-card, .spotify-card, .queue-card, .loading-card, .danger-zone { backdrop-filter: blur(18px); background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.6rem; box-shadow: var(--tonavia-shadow); }
    .setup-card { display: grid; gap: 1rem; padding: 1.5rem; }
    .primary-card { background: linear-gradient(145deg, rgba(139,77,244,0.19), var(--tonavia-surface)); }
    .card-number { color: var(--tonavia-accent); font-size: 0.7rem; font-weight: 850; letter-spacing: 0.12em; }
    .setup-card p, .loading-card p, .room-summary p, .danger-zone p { color: var(--tonavia-muted); line-height: 1.5; margin-top: 0.35rem; }
    label { color: #d9d4e1; font-size: 0.8rem; font-weight: 750; margin-top: 0.3rem; }
    input { background: rgba(10,8,13,0.72); border: 1px solid var(--tonavia-border); border-radius: 0.9rem; color: var(--tonavia-ink); min-height: 3.1rem; padding: 0.8rem 0.95rem; }
    input::placeholder { color: #777181; }
    input:focus { border-color: var(--tonavia-accent); box-shadow: 0 0 0 4px rgba(169,112,255,0.1); }
    button, a { align-items: center; border-radius: 999px; display: inline-flex; font: inherit; font-weight: 750; justify-content: center; min-height: 2.9rem; padding: 0.75rem 1.15rem; text-decoration: none; }
    button { background: linear-gradient(135deg, var(--tonavia-accent-strong), var(--tonavia-accent)); border: 0; color: #fff; cursor: pointer; }
    button:disabled { cursor: wait; opacity: 0.46; }
    a, .secondary { background: rgba(255,255,255,0.045); border: 1px solid var(--tonavia-border); color: var(--tonavia-ink); }
    .loading-card { align-items: center; display: flex; gap: 1rem; padding: 1.5rem; }
    .loader { animation: spin 0.7s linear infinite; border: 2px solid var(--tonavia-border); border-radius: 50%; border-top-color: var(--tonavia-accent); display: inline-block; height: 2rem; width: 2rem; }
    .room-card { align-items: center; background: linear-gradient(145deg, rgba(139,77,244,0.18), rgba(31,27,40,0.9)); display: grid; gap: 2rem; grid-template-columns: minmax(0, 1fr) auto; padding: 1.6rem; }
    .room-summary h2 { font-size: clamp(2rem, 4vw, 3.5rem); margin-top: 0.7rem; }
    .live-status { align-items: center; color: var(--tonavia-success); display: flex; font-size: 0.72rem; font-weight: 850; gap: 0.5rem; letter-spacing: 0.1em; text-transform: uppercase; }
    .live-status span { background: var(--tonavia-success); border-radius: 50%; box-shadow: 0 0 0.8rem rgba(74,222,128,0.8); height: 0.5rem; width: 0.5rem; }
    .live-status.is-closed { color: var(--tonavia-muted); }
    .live-status.is-closed span { background: var(--tonavia-muted); box-shadow: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.65rem; margin-top: 1.25rem; }
    .qr-panel { align-items: center; display: grid; gap: 0.65rem; justify-items: center; }
    .qr-frame { align-items: center; background: #fff; border-radius: 1.2rem; display: flex; height: 11rem; justify-content: center; padding: 0.65rem; width: 11rem; }
    .qr-frame img { height: 100%; width: 100%; }
    .qr-panel > span { color: var(--tonavia-muted); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.11em; }
    .spotify-card { align-items: center; display: grid; gap: 1.1rem; grid-template-columns: auto minmax(0, 1fr) auto; padding: 1.4rem; }
    .spotify-card.is-connected { background: linear-gradient(135deg, rgba(29,185,84,0.12), var(--tonavia-surface)); border-color: rgba(74,222,128,0.22); }
    .spotify-icon { align-items: center; background: #1db954; border-radius: 50%; color: #0d0b11; display: flex; font-size: 2.1rem; height: 3.1rem; justify-content: center; width: 3.1rem; }
    .spotify-card .eyebrow { color: var(--tonavia-success); }
    .spotify-copy > p:not(.eyebrow) { color: var(--tonavia-muted); line-height: 1.5; margin-top: 0.3rem; }
    .spotify-copy strong { color: var(--tonavia-ink); display: inline; }
    .spotify-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: flex-end; }
    .spotify-actions button:not(.text-button) { background: #1db954; color: #07190d; }
    .text-button { background: transparent; color: var(--tonavia-muted); font-size: 0.78rem; min-height: auto; padding: 0.5rem; }
    .hint { font-size: 0.8rem; }
    .progress { background: rgba(255,255,255,0.08); border-radius: 99px; height: 0.25rem; margin-top: 0.85rem; overflow: hidden; width: min(22rem, 100%); }
    .progress span { background: var(--tonavia-success); display: block; height: 100%; transition: width 500ms linear; }
    .queue-card { padding: 1.5rem; }
    .queue-heading { align-items: end; display: flex; gap: 1rem; justify-content: space-between; }
    .queue-stat { align-items: baseline; display: flex; gap: 0.4rem; }
    .queue-stat strong { color: var(--tonavia-accent); font-size: 2rem; }
    .queue-stat span { color: var(--tonavia-muted); font-size: 0.75rem; }
    ol { display: grid; gap: 0.35rem; list-style: none; margin: 1.25rem 0 0; padding: 0; }
    li { align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); border-radius: 0.8rem; display: grid; gap: 0.8rem; grid-template-columns: 2rem auto minmax(0, 1fr) auto; padding: 0.7rem; }
    li.is-playing { background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.16); }
    .position { color: var(--tonavia-muted); font-size: 0.78rem; font-weight: 850; text-align: center; }
    .track-art { background: #2e263b; border-radius: 0.75rem; color: var(--tonavia-accent); height: 3rem; object-fit: cover; width: 3rem; }
    .art-placeholder { align-items: center; display: flex; justify-content: center; }
    .track-copy { min-width: 0; }
    .track-copy strong, .track-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track-copy small { color: var(--tonavia-muted); font-size: 0.8rem; margin-top: 0.18rem; }
    .track-copy .requested { font-size: 0.7rem; }
    .track-copy .now-playing { color: var(--tonavia-success); font-weight: 800; }
    .remove { background: transparent; border: 1px solid var(--tonavia-border); color: var(--tonavia-muted); font-size: 0.75rem; min-height: 2.2rem; padding: 0.35rem 0.75rem; }
    .empty-state { align-items: center; color: var(--tonavia-muted); display: grid; justify-items: center; padding: 4rem 1rem 3rem; text-align: center; }
    .empty-state > span { align-items: center; background: rgba(169,112,255,0.1); border-radius: 50%; color: var(--tonavia-accent); display: flex; height: 3.5rem; justify-content: center; margin-bottom: 0.9rem; width: 3.5rem; }
    .empty-state h3 { color: var(--tonavia-ink); }
    .empty-state p { line-height: 1.5; margin-top: 0.35rem; }
    .danger-zone { align-items: center; box-shadow: none; display: flex; gap: 1rem; justify-content: space-between; padding: 1.25rem 1.5rem; }
    .danger-zone h2 { font-size: 1rem; }
    .danger-zone p { font-size: 0.82rem; }
    .danger-zone > button { background: transparent; border: 1px solid rgba(255,107,129,0.3); color: var(--tonavia-danger); }
    .confirm-actions { display: flex; gap: 0.55rem; }
    .danger { background: #b83d55; }
    .error { color: var(--tonavia-danger) !important; font-size: 0.82rem; font-weight: 700; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 46rem) {
      .page-shell { padding-inline: 1rem; }
      .hero { padding-top: 3.5rem; }
      .setup-grid, .room-card, .spotify-card { grid-template-columns: 1fr; }
      .qr-panel { justify-items: start; }
      .spotify-actions { justify-content: flex-start; }
      .danger-zone { align-items: flex-start; flex-direction: column; }
    }
    @media (max-width: 32rem) {
      .host-label { display: none; }
      .queue-heading { align-items: flex-start; }
      .queue-stat { display: grid; gap: 0; justify-items: end; }
      li { grid-template-columns: 1.5rem auto minmax(0, 1fr); }
      li .remove { grid-column: 3; justify-self: start; }
      .confirm-actions { width: 100%; }
      .confirm-actions button { flex: 1; }
    }
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
  protected readonly creating = signal(false);
  protected readonly opening = signal(false);
  protected readonly closing = signal(false);
  protected readonly confirmClosing = signal(false);
  protected readonly removingId = signal('');
  protected readonly roomCode = signal('');
  protected readonly openError = signal('');
  protected readonly roomName = signal('Noche en casa');
  protected readonly qrDataUrl = signal('');
  protected readonly copyLabel = signal('Copiar enlace');
  protected readonly shareUrl = computed(() => this.room() ? `${window.location.origin}/s/${this.room()!.code}` : '');
  protected readonly progressPercent = computed(() => {
    const state = this.playback();
    return state?.durationMs ? Math.min(100, Math.round((state.progressMs / state.durationMs) * 100)) : 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => { clearInterval(this.refreshTimer); this.sync.stop(); });
    const room = this.room();
    if (room) { void this.generateQr(); void this.store.hydrate(room.code); } else { void this.restoreRoom(); }
    void this.startSpotifySync();
  }

  protected connectSpotify(): Promise<void> { return this.spotify.connect(); }
  protected disconnectSpotify(): void { this.sync.stop(); this.spotify.disconnect(); this.playback.set(null); this.spotifyError.set(''); }
  protected playQueue(): Promise<void> { return this.sync.playQueue(); }

  protected async removeItem(itemId: string): Promise<void> {
    if (this.removingId()) return;
    this.removingId.set(itemId);
    try { await this.store.removeItem(itemId); }
    catch { this.spotifyError.set('No se pudo quitar la canción. Solo el dispositivo que creó la sala puede hacerlo.'); }
    finally { this.removingId.set(''); }
  }

  private async startSpotifySync(): Promise<void> {
    if (!this.spotify.isConfigured) return;
    try {
      const result = await this.spotify.completeConnectionFromUrl();
      if (result === 'denied') this.spotifyError.set('No se completó la conexión con Spotify. Inténtalo de nuevo.');
    } catch { this.spotifyError.set('Spotify rechazó la conexión. Revisa que tu cuenta esté autorizada.'); }
    if (this.spotify.isConnected()) this.sync.start();
  }

  protected updateRoomName(event: Event): void { this.roomName.set((event.target as HTMLInputElement).value); }
  protected updateRoomCode(event: Event): void { this.roomCode.set((event.target as HTMLInputElement).value.toUpperCase()); this.openError.set(''); }

  protected async openExistingRoom(): Promise<void> {
    if (!this.roomCode().trim() || this.opening()) return;
    this.opening.set(true);
    try {
      const opened = await this.store.openRoomByCode(this.roomCode());
      if (!opened) { this.openError.set('No encontramos una sala con ese código.'); return; }
      await this.generateQr();
    } finally { this.opening.set(false); }
  }

  private async restoreRoom(): Promise<void> {
    this.restoring.set(true);
    try { if (await this.store.restoreOwnedRoom()) await this.generateQr(); }
    finally { this.restoring.set(false); }
  }

  protected async createRoom(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    try { await this.store.createRoom(this.roomName()); await this.generateQr(); }
    finally { this.creating.set(false); }
  }

  protected async closeRoom(): Promise<void> {
    if (this.closing()) return;
    this.closing.set(true);
    try { await this.store.closeRoom(); this.confirmClosing.set(false); }
    finally { this.closing.set(false); }
  }

  protected async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.shareUrl());
    this.copyLabel.set('Enlace copiado ✓');
    setTimeout(() => this.copyLabel.set('Copiar enlace'), 2500);
  }

  private async generateQr(): Promise<void> { this.qrDataUrl.set(await QRCode.toDataURL(this.shareUrl(), { margin: 1, width: 320 })); }
}
