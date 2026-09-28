import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <section class="hero">
        <p class="eyebrow">Tonavia para anfitriones</p>
        <h1>Tu reunión, en el ritmo de todos.</h1>
        <p class="lead">
          Crea una sala, comparte el QR y deja que tus invitados construyan la lista.
        </p>
        <button type="button" (click)="createRoom()">Crear sala</button>
      </section>

      <section class="room-card" aria-live="polite">
        <div>
          <p class="eyebrow">Sala de prueba</p>
          <h2>{{ roomName() }}</h2>
          <p>La conexión con Spotify y la generación real de QR llegan en el siguiente módulo.</p>
        </div>
        <a [routerLink]="['/s', roomCode()]">Abrir vista de invitados</a>
      </section>
    </main>
  `,
  styles: `
    .page-shell {
      display: grid;
      gap: 2rem;
      margin: 0 auto;
      max-width: 68rem;
      min-height: 100dvh;
      padding: 4rem 1.5rem;
    }

    .hero {
      max-width: 42rem;
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    h1 {
      font-size: clamp(2.8rem, 8vw, 5rem);
      letter-spacing: -0.06em;
      line-height: 0.95;
    }

    h2 {
      font-size: 1.5rem;
    }

    .eyebrow {
      color: var(--tonavia-accent);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .lead {
      color: var(--tonavia-muted);
      font-size: 1.15rem;
      line-height: 1.6;
      margin-top: 1.25rem;
      max-width: 35rem;
    }

    button,
    a {
      border-radius: 999px;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      margin-top: 2rem;
      padding: 0.8rem 1.15rem;
      text-decoration: none;
    }

    button {
      background: var(--tonavia-accent);
      border: 0;
      color: #fff;
      cursor: pointer;
    }

    a {
      color: var(--tonavia-accent);
      padding-inline: 0;
    }

    .room-card {
      align-items: center;
      background: var(--tonavia-surface);
      border: 1px solid var(--tonavia-border);
      border-radius: 1.25rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem 2rem;
      justify-content: space-between;
      padding: 1.5rem;
    }

    .room-card p:not(.eyebrow) {
      color: var(--tonavia-muted);
      margin-top: 0.5rem;
    }
  `
})
export class AdminPage {
  protected readonly roomCode = signal('tonavia-demo');
  protected readonly roomName = signal('Noche en casa');

  protected createRoom(): void {
    this.roomName.set('Nueva sala Tonavia');
  }
}
