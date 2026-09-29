import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SpotifyTrack {
  albumImageUrl: string | null;
  artist: string;
  spotifyTrackId: string;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class SpotifySearchService {
  private readonly http = inject(HttpClient);

  async search(query: string): Promise<SpotifyTrack[]> {
    const term = query.trim();
    if (term.length < 2) {
      return [];
    }

    const response = await firstValueFrom(
      this.http.get<{ tracks?: SpotifyTrack[] }>('/api/spotify/search', {
        params: { q: term }
      })
    );

    return response.tracks ?? [];
  }
}
