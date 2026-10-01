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
  sentToSpotifyAt?: string | null;
  spotifyTrackId?: string;
  startedAt?: string | null;
  title: string;
}

const STORAGE_KEY = 'tonavia:room-session';
const GUEST_NAME_KEY_PREFIX = 'tonavia:guest-name:';

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
  readonly nowPlaying = computed(() => this.queue().find((item) => item.startedAt) ?? null);

  constructor() {
    if (this.supabase.isConfigured && this.room() && !this.room()!.id) {
      this.room.set(null);
      this.queue.set([]);
      this.guestName.set('');
      this.persist();
    }

    if (this.room()?.code && this.guestName()) {
      this.rememberGuestName(this.room()!.code, this.guestName());
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
      this.guestName.set(this.guestNameForRoom(code));
      this.persist();
    }

    await this.hydrate(code);
  }

  async restoreOwnedRoom(): Promise<boolean> {
    if (!this.supabase.isConfigured) return false;

    try {
      const ownerId = await this.supabase.ensureAnonymousSession();
      const { data, error } = await this.supabase.client
        .from('rooms')
        .select('code')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return false;

      return this.openRoomByCode(data.code);
    } catch {
      return false;
    }
  }

  async openRoomByCode(code: string): Promise<boolean> {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !this.supabase.isConfigured) return false;

    try {
      await this.supabase.ensureAnonymousSession();
      if (this.room()?.code !== normalized) {
        this.queue.set([]);
        this.guestName.set(this.guestNameForRoom(normalized));
      }

      const found = await this.loadPublicQueue(normalized);
      if (!found) return false;

      const roomId = this.room()?.id;
      if (roomId) {
        await this.subscribeToRoom(roomId);
      }
      this.syncMode.set('remote');
      this.persist();
      return true;
    } catch (error) {
      this.useLocalFallback(error);
      return false;
    }
  }

  async refreshQueue(): Promise<void> {
    const code = this.room()?.code;
    if (!this.supabase.isConfigured || !code) return;

    try {
      await this.loadPublicQueue(code);
      this.persist();
    } catch {
      // The next refresh or realtime event will retry.
    }
  }

  async syncPlayback(spotifyTrackId: string): Promise<void> {
    const roomId = this.room()?.id;
    if (!this.supabase.isConfigured || !roomId) return;

    const { error } = await this.supabase.client.rpc('sync_room_playback', {
      p_room_id: roomId,
      p_spotify_track_id: spotifyTrackId
    });
    if (error) throw error;
    await this.refreshQueue();
  }

  async markSentToSpotify(itemId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('mark_queue_item_sent', { p_item_id: itemId });
    if (error) throw error;
    await this.refreshQueue();
  }

  async removeItem(itemId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('remove_queue_item', { p_item_id: itemId });
    if (error) throw error;
    await this.refreshQueue();
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
        this.rememberGuestName(joined.room_code, trimmedName);
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
    const trimmedName = name.trim();
    this.guestName.set(trimmedName);
    const roomCode = this.room()?.code;
    if (roomCode && trimmedName) {
      this.rememberGuestName(roomCode, trimmedName);
    }
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

  findQueuedSong(song: Pick<QueueItem, 'artist' | 'spotifyTrackId' | 'title'>): { item: QueueItem; position: number } | null {
    const index = this.queue().findIndex((item) => {
      if (song.spotifyTrackId && item.spotifyTrackId === song.spotifyTrackId) {
        return true;
      }

      return (
        item.title.toLocaleLowerCase() === song.title.toLocaleLowerCase() &&
        item.artist.toLocaleLowerCase() === song.artist.toLocaleLowerCase()
      );
    });

    if (index < 0) {
      return null;
    }

    return { item: this.queue()[index], position: index + 1 };
  }

  async addSong(
    song: Omit<QueueItem, 'id' | 'requestedBy'>
  ): Promise<{ itemId: string; position: number; status: 'added' | 'duplicate'; title: string } | { status: 'closed'; message: string }> {
    if (!this.isActive()) return { status: 'closed', message: 'La sala ya fue cerrada.' };

    const room = this.room();
    if (this.supabase.isConfigured && room?.id) {
      let { error } = await this.requestRemoteSong(room.id, song);

      if (error?.message.toLocaleLowerCase().includes('join this room') && this.guestName() && room.code) {
        await this.joinRoom(room.code, this.guestName());
        ({ error } = await this.requestRemoteSong(room.id, song));
      }

      if (!error) {
        try {
          await this.loadQueue();
        } catch {
          await this.loadPublicQueue(room.code);
        }
        const queued = this.findQueuedSong(song);
        return {
          itemId: queued?.item.id ?? '',
          position: queued?.position ?? this.queue().length,
          status: 'added',
          title: queued?.item.title ?? song.title
        };
      }

      const message = error.message.toLocaleLowerCase();
      if (message.includes('already in the queue')) {
        const queued = this.findQueuedSong(song);
        return queued
          ? { itemId: queued.item.id, position: queued.position, status: 'duplicate', title: queued.item.title }
          : { status: 'closed', message: 'Esa canción ya está en la cola.' };
      }
      if (message.includes('room is closed')) {
        return { status: 'closed', message: 'La sala ya fue cerrada.' };
      }
      if (message.includes('request limit')) {
        return {
          status: 'closed',
          message: 'Ya tienes 3 canciones esperando turno. En cuanto empiece a sonar una de ellas, podrás pedir otra.'
        };
      }

      this.useLocalFallback(error);
      return { status: 'closed', message: 'No se pudo agregar la canción. Inténtalo de nuevo.' };
    }

    const existing = this.findQueuedSong(song);
    if (existing) {
      return { itemId: existing.item.id, position: existing.position, status: 'duplicate', title: existing.item.title };
    }

    const item: QueueItem = {
      ...song,
      id: crypto.randomUUID(),
      requestedBy: this.guestName() || 'Invitado'
    };
    this.queue.update((items) => [...items, item]);
    this.persist();
    return { itemId: item.id, position: this.queue().length, status: 'added', title: item.title };
  }

  private async requestRemoteSong(
    roomId: string,
    song: Omit<QueueItem, 'id' | 'requestedBy'>
  ): Promise<{ error: { message: string } | null }> {
    const { error } = await this.supabase.client.rpc('request_queue_item', {
      p_album_image_url: song.albumImageUrl ?? null,
      p_artist: song.artist,
      p_room_id: roomId,
      p_spotify_track_id: song.spotifyTrackId || this.trackId(song),
      p_title: song.title
    });
    return { error };
  }

  private async loadPublicQueue(code: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('get_room_queue', {
      p_room_code: code
    });

    if (!error && data) {
      const preview = data as Array<{
        album_image_url: string | null;
        artist: string | null;
        item_id: string | null;
        requested_by: string | null;
        room_code: string;
        room_id: string;
        room_name: string;
        room_status: Room['status'];
        sent_to_spotify_at: string | null;
        spotify_track_id: string | null;
        started_at: string | null;
        title: string | null;
      }>;
      const first = preview[0];
      if (!first) {
        return false;
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
            albumImageUrl: item.album_image_url,
            artist: item.artist ?? '',
            id: item.item_id as string,
            requestedBy: item.requested_by ?? 'Invitado',
            sentToSpotifyAt: item.sent_to_spotify_at,
            spotifyTrackId: item.spotify_track_id ?? undefined,
            startedAt: item.started_at,
            title: item.title ?? ''
          }))
      );
      return true;
    }

    await this.loadQueue();
    return Boolean(this.room()?.id);
  }

  private async loadQueue(): Promise<void> {
    const room = this.room();
    if (!room?.id) return;

    const { data, error } = await this.supabase.client
      .from('queue_items')
      .select('id, title, artist, album_image_url, spotify_track_id, position, started_at, sent_to_spotify_at, guests(nickname)')
      .eq('room_id', room.id)
      .eq('status', 'queued')
      .order('position');

    const rows = error
      ? (
          await this.supabase.client
            .from('queue_items')
            .select('id, title, artist, album_image_url, spotify_track_id, position, started_at, sent_to_spotify_at')
            .eq('room_id', room.id)
            .eq('status', 'queued')
            .order('position')
        ).data
      : data;

    if (!rows) {
      return;
    }

    this.queue.set(
      rows.map((item) => ({
        albumImageUrl: item.album_image_url,
        artist: item.artist,
        id: item.id,
        requestedBy:
          'guests' in item
            ? (Array.isArray(item.guests)
                ? item.guests[0]?.nickname
                : (item.guests as { nickname?: string } | null)?.nickname) ?? 'Invitado'
            : 'Invitado',
        sentToSpotifyAt: item.sent_to_spotify_at,
        spotifyTrackId: item.spotify_track_id,
        startedAt: item.started_at,
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

  private guestNameForRoom(code: string): string {
    return localStorage.getItem(`${GUEST_NAME_KEY_PREFIX}${code.trim().toUpperCase()}`) ?? '';
  }

  private rememberGuestName(code: string, name: string): void {
    localStorage.setItem(`${GUEST_NAME_KEY_PREFIX}${code.trim().toUpperCase()}`, name.trim());
  }

  private read(): { guestName: string; queue: QueueItem[]; room: Room | null } {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as { guestName: string; queue: QueueItem[]; room: Room | null };
    } catch {
      return { guestName: '', queue: [], room: null };
    }
  }
}
