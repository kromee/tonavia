import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';

import { RoomSessionStore } from '../rooms/room-session.store';

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

      @if (!room()) {
        <section class="setup-card">
          <h2>Crea tu sala</h2>
          <p>Elige un nombre y tendrás un enlace único para compartir con tus invitados.</p>
          <label for="room-name">Nombre de la reunión</label>
          <input id="room-name" [value]="roomName()" (input)="updateRoomName($event)" />
          <button type="button" (click)="createRoom()">Crear sala y QR</button>
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
                <li>
                  <span class="position">{{ index + 1 }}</span>
                  <span><strong>{{ item.title }}</strong><small>{{ item.artist }} · {{ item.requestedBy }}</small></span>
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
    .queue-card { background: var(--tonavia-surface); border: 1px solid var(--tonavia-border); border-radius: 1.5rem; padding: 1.5rem; }
    .queue-heading { align-items: center; display: flex; justify-content: space-between; gap: 1rem; }
    .queue-heading span, .empty-state, small { color: var(--tonavia-muted); }
    ol { display: grid; gap: 0.8rem; list-style: none; margin: 1.25rem 0 0; padding: 0; }
    li { align-items: center; display: grid; gap: 0.75rem; grid-template-columns: auto 1fr; }
    .position { align-items: center; background: #ece1ff; border-radius: 50%; color: var(--tonavia-accent); display: inline-flex; font-size: 0.8rem; font-weight: 800; height: 1.75rem; justify-content: center; width: 1.75rem; }
    strong, small { display: block; }
    small { font-size: 0.82rem; margin-top: 0.18rem; }
    .empty-state { line-height: 1.5; margin-top: 1.25rem; }
    @media (max-width: 40rem) { .page-shell { padding-top: 2rem; } .room-card { grid-template-columns: 1fr; } .qr-panel { justify-self: start; } }
  `
})
export class AdminPage {
  private readonly store = inject(RoomSessionStore);

  protected readonly room = this.store.room;
  protected readonly queue = this.store.queue;
  protected readonly roomName = signal('Noche en casa');
  protected readonly qrDataUrl = signal('');
  protected readonly copyLabel = signal('Copiar enlace');
  protected readonly shareUrl = computed(() => {
    const room = this.room();
    return room ? `${window.location.origin}/s/${room.code}` : '';
  });

  constructor() {
    const room = this.room();
    if (room) {
      void this.generateQr();
      void this.store.hydrate(room.code);
    }
  }

  protected updateRoomName(event: Event): void {
    this.roomName.set((event.target as HTMLInputElement).value);
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
