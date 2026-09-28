import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-room-page',
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <a class="brand" routerLink="/admin">Tonavia</a>

      <section class="intro">
        <p class="eyebrow">Sala activa</p>
        <h1>La música de todos.</h1>
        <p>Estás en la sala <strong>{{ roomCode }}</strong>. Pronto podrás elegir un apodo y pedir tu canción.</p>
      </section>

      <section class="queue-card">
        <div class="queue-heading">
          <h2>En la cola</h2>
          <span>0 canciones</span>
        </div>
        <p class="empty-state">La lista está lista para su primera canción.</p>
      </section>

      <button type="button" disabled>Buscar una canción</button>
    </main>
  `,
  styles: `
    .page-shell {
      display: grid;
      gap: 2rem;
      margin: 0 auto;
      max-width: 40rem;
      min-height: 100dvh;
      padding: 2rem 1.5rem 4rem;
    }

    .brand {
      color: var(--tonavia-ink);
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.05em;
      text-decoration: none;
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    h1 {
      font-size: clamp(2.4rem, 12vw, 4.5rem);
      letter-spacing: -0.07em;
      line-height: 0.95;
      margin-top: 0.35rem;
    }

    h2 {
      font-size: 1.15rem;
    }

    .eyebrow {
      color: var(--tonavia-accent);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .intro p:last-child {
      color: var(--tonavia-muted);
      line-height: 1.6;
      margin-top: 1rem;
    }

    .queue-card {
      background: var(--tonavia-surface);
      border: 1px solid var(--tonavia-border);
      border-radius: 1.25rem;
      padding: 1.25rem;
    }

    .queue-heading {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }

    .queue-heading span {
      color: var(--tonavia-muted);
      font-size: 0.85rem;
    }

    .empty-state {
      color: var(--tonavia-muted);
      line-height: 1.5;
      padding: 3rem 0 1rem;
      text-align: center;
    }

    button {
      background: var(--tonavia-ink);
      border: 0;
      border-radius: 999px;
      color: #fff;
      font: inherit;
      font-weight: 700;
      padding: 0.9rem 1.15rem;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `
})
export class RoomPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly roomCode = this.route.snapshot.paramMap.get('roomCode') ?? 'sin-código';
}
