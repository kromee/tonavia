import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { SupabaseClientService } from '../../core/supabase/supabase-client.service';

export interface Room {
  code: string;
  id?: string;
  name: string;
  status: 'active' | 'closed';
}

export interface QueueItem {
  albumImageUrl?: string | null;
  artist: string;
  id: string;
  requestedBy: string;
  spotifyTrackId?: string;
  title: string;
}

const STORAGE_KEY = 'tonavia:room-session';

@Injectable({ providedIn: 'root' })
export class RoomSessionStore {
  private readonly supabase = inject(SupabaseClientService);
  private subscription?: RealtimeChannel;

  readonly room = signal<Room | null>(this.read().room);
  readonly queue = signal<QueueItem[]>(this.read().queue);
  readonly guestName = signal(this.read().guestName);
  readonly remoteError = signal('');
  readonly syncMode = signal<'local' | 'remote'>(this.supabase.isConfigured ? 'remote' : 'local');
  readonly isActive = computed(() => this.room()?.status === 'active');

  constructor() {
    if (this.supabase.isConfigured && this.room() && !this.room()!.id) {
      this.room.set(null);
      this.queue.set([]);
      this.guestName.set('');
      this.persist();
    }

    void this.hydrate();
  }

  async createRoom(name: string): Promise<Room> {
    const localRoom: Room = {
      code: this.createCode(),
      name: name.trim() || 'Mi sala Tonavia',
      status: 'active'
    };

    if (this.supabase.isConfigured) {
      try {
        const ownerId = await this.supabase.ensureAnonymousSession();
        const { data, error } = await this.supabase.client
          .from('rooms')
          .insert({ code: localRoom.code, name: localRoom.name, owner_id: ownerId })
          .select('id, code, name, status')
          .single();
        if (error) throw error;

        localRoom.id = data.id;
        localRoom.code = data.code;
        localRoom.name = data.name;
        localRoom.status = data.status;
        this.syncMode.set('remote');
      } catch (error) {
        this.useLocalFallback(error);
      }
    }

    this.room.set(localRoom);
    this.queue.set([]);
    this.guestName.set('');
    this.persist();
    await this.hydrate();
    return localRoom;
  }

  async openRoom(code: string): Promise<void> {
    if (this.room()?.code !== code) {
      this.room.set({ code, name: 'Sala Tonavia', status: 'active' });
      this.queue.set([]);
      this.guestName.set('');
      this.persist();
    }

    await this.hydrate(code);
  }

  async joinRoom(code: string, nickname: string): Promise<void> {
    const trimmedName = nickname.trim();
    if (!trimmedName) return;

    if (this.supabase.isConfigured) {
      try {
        await this.supabase.ensureAnonymousSession();
        const { data, error } = await this.supabase.client.rpc('join_room', {
          p_nickname: trimmedName,
          p_room_code: code
        });
        if (error) throw error;

        const joined = data?.[0];
        if (!joined) throw new Error('No se encontró la sala.');

        this.room.set({
          code: joined.room_code,
          id: joined.room_id,
          name: joined.room_name,
          status: joined.room_status
        });
        this.guestName.set(trimmedName);
        this.syncMode.set('remote');
        this.persist();
        await this.loadQueue();
        await this.subscribeToRoom(joined.room_id);
        return;
      } catch (error) {
        this.useLocalFallback(error);
      }
    }

    this.setGuestName(trimmedName);
  }

  async closeRoom(): Promise<void> {
    const room = this.room();
    if (!room) return;

    if (this.supabase.isConfigured && room.id) {
      const { error } = await this.supabase.client
        .from('rooms')
        .update({ closed_at: new Date().toISOString(), status: 'closed' })
        .eq('id', room.id);
      if (error) {
        this.useLocalFallback(error);
      }
    }

    this.room.set({ ...room, status: 'closed' });
    this.persist();
  }

  setGuestName(name: string): void {
    this.guestName.set(name.trim());
    this.persist();
  }

  async hydrate(code = this.room()?.code): Promise<void> {
    if (!this.supabase.isConfigured || !code) {
      return;
    }

    try {
      await this.supabase.ensureAnonymousSession();
      await this.loadPublicQueue(code);
      const roomId = this.room()?.id;
      if (roomId) {
        await this.subscribeToRoom(roomId);
      }
      this.syncMode.set('remote');
      this.persist();
    } catch (error) {
      this.useLocalFallback(error);
    }
  }

  async addSong(song: Omit<QueueItem, 'id' | 'requestedBy'>): Promise<'added' | 'duplicate' | 'closed'> {
    if (!this.isActive()) return 'closed';

    const room = this.room();
    if (this.supabase.isConfigured && room?.id) {
      const { error } = await this.supabase.client.rpc('request_queue_item', {
        p_album_image_url: song.albumImageUrl ?? null,
        p_artist: song.artist,
        p_room_id: room.id,
        p_spotify_track_id: song.spotifyTrackId || this.trackId(song),
        p_title: song.title
      });

      if (!error) {
        await this.loadQueue();
        return 'added';
      }

      if (error.message.toLocaleLowerCase().includes('already in the queue')) return 'duplicate';
      if (error.message.toLocaleLowerCase().includes('room is closed')) return 'closed';
      this.useLocalFallback(error);
    }

    const duplicate = this.queue().some((item) =>
      song.spotifyTrackId
        ? item.spotifyTrackId === song.spotifyTrackId
        : item.title.toLocaleLowerCase() === song.title.toLocaleLowerCase() &&
          item.artist.toLocaleLowerCase() === song.artist.toLocaleLowerCase()
    );
    if (duplicate) return 'duplicate';

    this.queue.update((items) => [
      ...items,
      { ...song, id: crypto.randomUUID(), requestedBy: this.guestName() || 'Invitado' }
    ]);
    this.persist();
    return 'added';
  }

  private async loadPublicQueue(code: string): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('get_room_queue', {
      p_room_code: code
    });

    if (!error && data) {
      const preview = data as Array<{
        artist: string | null;
        item_id: string | null;
        requested_by: string | null;
        room_code: string;
        room_id: string;
        room_name: string;
        room_status: Room['status'];
        title: string | null;
      }>;
      const first = preview[0];
      if (!first) {
        return;
      }

      this.room.set({
        code: first.room_code,
        id: first.room_id,
        name: first.room_name,
        status: first.room_status
      });
      this.queue.set(
        preview
          .filter((item) => item.item_id)
          .map((item) => ({
            artist: item.artist ?? '',
            id: item.item_id as string,
            requestedBy: item.requested_by ?? 'Invitado',
            title: item.title ?? ''
          }))
      );
      return;
    }

    await this.loadQueue();
  }

  private async loadQueue(): Promise<void> {
    const room = this.room();
    if (!room?.id) return;

    const { data, error } = await this.supabase.client
      .from('queue_items')
      .select('id, title, artist, album_image_url, position, guests(nickname)')
      .eq('room_id', room.id)
      .eq('status', 'queued')
      .order('position');
    if (error) throw error;

    this.queue.set(
      (data ?? []).map((item) => ({
        albumImageUrl: item.album_image_url,
        artist: item.artist,
        id: item.id,
        requestedBy:
          (Array.isArray(item.guests)
            ? item.guests[0]?.nickname
            : (item.guests as { nickname?: string } | null)?.nickname) ?? 'Invitado',
        title: item.title
      }))
    );
    this.persist();
  }

  private async subscribeToRoom(roomId: string): Promise<void> {
    this.subscription?.unsubscribe();
    this.subscription = this.supabase.client
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, () => {
        void this.loadQueue();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const room = this.room();
        if (room) this.room.set({ ...room, status: payload.new['status'] as Room['status'] });
      })
      .subscribe();
  }

  private trackId(song: Omit<QueueItem, 'id' | 'requestedBy'>): string {
    return `${song.title}:${song.artist}`.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  }

  private useLocalFallback(error: unknown): void {
    this.syncMode.set('local');
    this.remoteError.set(error instanceof Error ? error.message : 'No fue posible conectar con Supabase.');
  }

  private createCode(): string {
    return Array.from(crypto.getRandomValues(new Uint32Array(3)))
      .map((value) => value.toString(36).slice(0, 4))
      .join('')
      .toUpperCase();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ guestName: this.guestName(), queue: this.queue(), room: this.room() }));
  }

  private read(): { guestName: string; queue: QueueItem[]; room: Room | null } {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as { guestName: string; queue: QueueItem[]; room: Room | null };
    } catch {
      return { guestName: '', queue: [], room: null };
    }
  }
}
