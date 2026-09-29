import { Injectable, signal } from '@angular/core';

const AUTH_KEY = 'tonavia:spotify-auth';
const PKCE_KEY = 'tonavia:spotify-pkce';
const SCOPES = ['user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state'];
const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

interface SpotifyAuth {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
}

export interface SpotifyPlayback {
  artist: string;
  deviceName: string;
  durationMs: number;
  isPlaying: boolean;
  progressMs: number;
  title: string;
  trackId: string | null;
}

export type SpotifyPlayerErrorKind = 'auth' | 'no-device' | 'premium' | 'rate-limit' | 'unknown';

export class SpotifyPlayerError extends Error {
  constructor(
    readonly kind: SpotifyPlayerErrorKind,
    message: string
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class SpotifyPlayerService {
  private readonly clientId = globalThis.__tonaviaConfig?.spotifyClientId ?? '';
  private auth: SpotifyAuth | null = this.readAuth();

  readonly isConfigured = Boolean(this.clientId);
  readonly isConnected = signal(Boolean(this.auth));

  static isSpotifyTrackId(value: string | undefined | null): value is string {
    return Boolean(value && TRACK_ID_PATTERN.test(value));
  }

  async connect(): Promise<void> {
    const verifier = this.randomString(64);
    const state = this.randomString(16);
    localStorage.setItem(PKCE_KEY, JSON.stringify({ state, verifier }));

    const params = new URLSearchParams({
      client_id: this.clientId,
      code_challenge: await this.challengeFor(verifier),
      code_challenge_method: 'S256',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      state
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  }

  async completeConnectionFromUrl(): Promise<'connected' | 'denied' | 'none'> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const state = url.searchParams.get('state');
    if (!code && !error) return 'none';

    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('state');
    window.history.replaceState(null, '', url.pathname + url.search);

    const pending = this.readPkce();
    localStorage.removeItem(PKCE_KEY);
    if (error || !code || !pending || pending.state !== state) return 'denied';

    await this.requestToken({
      client_id: this.clientId,
      code,
      code_verifier: pending.verifier,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri()
    });
    return 'connected';
  }

  disconnect(): void {
    this.auth = null;
    localStorage.removeItem(AUTH_KEY);
    this.isConnected.set(false);
  }

  async playback(): Promise<SpotifyPlayback | null> {
    const response = await this.api('GET', '/me/player');
    if (response.status === 204) return null;

    const data = await response.json();
    const item = data?.item;
    const isTrack = item?.type === 'track';
    return {
      artist: isTrack ? (item.artists ?? []).map((artist: { name: string }) => artist.name).join(', ') : '',
      deviceName: data?.device?.name ?? '',
      durationMs: item?.duration_ms ?? 0,
      isPlaying: Boolean(data?.is_playing),
      progressMs: data?.progress_ms ?? 0,
      title: item?.name ?? '',
      trackId: isTrack ? (item.linked_from?.id ?? item.id) : null
    };
  }

  async addToQueue(trackId: string): Promise<void> {
    await this.api('POST', `/me/player/queue?uri=${encodeURIComponent(`spotify:track:${trackId}`)}`);
  }

  async play(trackId: string): Promise<void> {
    const body = JSON.stringify({ uris: [`spotify:track:${trackId}`] });
    try {
      await this.api('PUT', '/me/player/play', body);
    } catch (error) {
      if (!(error instanceof SpotifyPlayerError) || error.kind !== 'no-device') throw error;

      const deviceId = await this.firstAvailableDevice();
      if (!deviceId) throw error;
      await this.api('PUT', `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, body);
    }
  }

  private async firstAvailableDevice(): Promise<string | null> {
    const response = await this.api('GET', '/me/player/devices');
    const data = await response.json();
    const devices = (data?.devices ?? []) as Array<{ id: string | null; is_restricted: boolean }>;
    return devices.find((device) => device.id && !device.is_restricted)?.id ?? null;
  }

  private async api(method: string, path: string, body?: string, retried = false): Promise<Response> {
    const token = await this.accessToken();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      method
    });

    if (response.status === 401 && !retried && this.auth) {
      this.auth = { ...this.auth, expiresAt: 0 };
      return this.api(method, path, body, true);
    }
    if (response.ok) return response;

    const payload = await response.json().catch(() => null);
    const reason: string = payload?.error?.reason ?? '';
    const message: string = payload?.error?.message ?? `Spotify respondió ${response.status}`;
    if (response.status === 401) {
      this.disconnect();
      throw new SpotifyPlayerError('auth', message);
    }
    if (response.status === 404 || reason === 'NO_ACTIVE_DEVICE') {
      throw new SpotifyPlayerError('no-device', message);
    }
    if (response.status === 403) {
      throw new SpotifyPlayerError(reason === 'PREMIUM_REQUIRED' || /premium/i.test(message) ? 'premium' : 'unknown', message);
    }
    if (response.status === 429) {
      throw new SpotifyPlayerError('rate-limit', message);
    }
    throw new SpotifyPlayerError('unknown', message);
  }

  private async accessToken(): Promise<string> {
    if (!this.auth) throw new SpotifyPlayerError('auth', 'Spotify no está conectado.');
    if (Date.now() < this.auth.expiresAt - 60_000) return this.auth.accessToken;

    await this.requestToken({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: this.auth.refreshToken
    });
    return this.auth!.accessToken;
  }

  private async requestToken(params: Record<string, string>): Promise<void> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      body: new URLSearchParams(params),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.access_token) {
      this.disconnect();
      throw new SpotifyPlayerError('auth', data?.error_description ?? 'No se pudo conectar con Spotify.');
    }

    this.auth = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? this.auth?.refreshToken ?? ''
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(this.auth));
    this.isConnected.set(true);
  }

  private redirectUri(): string {
    return `${window.location.origin}/admin`;
  }

  private randomString(length: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)), (value) => alphabet[value % alphabet.length]).join('');
  }

  private async challengeFor(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }

  private readAuth(): SpotifyAuth | null {
    try {
      const auth = JSON.parse(localStorage.getItem(AUTH_KEY) ?? '') as SpotifyAuth;
      return auth.refreshToken ? auth : null;
    } catch {
      return null;
    }
  }

  private readPkce(): { state: string; verifier: string } | null {
    try {
      return JSON.parse(localStorage.getItem(PKCE_KEY) ?? '') as { state: string; verifier: string };
    } catch {
      return null;
    }
  }
}
