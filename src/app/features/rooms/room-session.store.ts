import { Injectable, computed, signal } from '@angular/core';

export interface Room {
  code: string;
  name: string;
  status: 'active' | 'closed';
}

export interface QueueItem {
  artist: string;
  id: string;
  requestedBy: string;
  title: string;
}

const STORAGE_KEY = 'tonavia:room-session';

@Injectable({ providedIn: 'root' })
export class RoomSessionStore {
  readonly room = signal<Room | null>(this.read().room);
  readonly queue = signal<QueueItem[]>(this.read().queue);
  readonly guestName = signal(this.read().guestName);
  readonly isActive = computed(() => this.room()?.status === 'active');

  createRoom(name: string): Room {
    const room: Room = {
      code: this.createCode(),
      name: name.trim() || 'Mi sala Tonavia',
      status: 'active'
    };

    this.room.set(room);
    this.queue.set([]);
    this.guestName.set('');
    this.persist();
    return room;
  }

  ensureRoom(code: string): void {
    if (this.room()?.code === code) {
      return;
    }

    this.room.set({
      code,
      name: 'Sala Tonavia',
      status: 'active'
    });
    this.queue.set([]);
    this.guestName.set('');
    this.persist();
  }

  closeRoom(): void {
    const room = this.room();
    if (!room) {
      return;
    }

    this.room.set({ ...room, status: 'closed' });
    this.persist();
  }

  setGuestName(name: string): void {
    this.guestName.set(name.trim());
    this.persist();
  }

  addSong(song: Omit<QueueItem, 'id' | 'requestedBy'>): 'added' | 'duplicate' | 'closed' {
    if (!this.isActive()) {
      return 'closed';
    }

    const duplicate = this.queue().some(
      (item) =>
        item.title.toLocaleLowerCase() === song.title.toLocaleLowerCase() &&
        item.artist.toLocaleLowerCase() === song.artist.toLocaleLowerCase()
    );

    if (duplicate) {
      return 'duplicate';
    }

    this.queue.update((items) => [
      ...items,
      {
        ...song,
        id: crypto.randomUUID(),
        requestedBy: this.guestName() || 'Invitado'
      }
    ]);
    this.persist();
    return 'added';
  }

  private createCode(): string {
    return Array.from(crypto.getRandomValues(new Uint32Array(3)))
      .map((value) => value.toString(36).slice(0, 4))
      .join('')
      .toUpperCase();
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        guestName: this.guestName(),
        queue: this.queue(),
        room: this.room()
      })
    );
  }

  private read(): { guestName: string; queue: QueueItem[]; room: Room | null } {
    if (typeof localStorage === 'undefined') {
      return { guestName: '', queue: [], room: null };
    }

    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
        guestName: string;
        queue: QueueItem[];
        room: Room | null;
      };
    } catch {
      return { guestName: '', queue: [], room: null };
    }
  }
}
