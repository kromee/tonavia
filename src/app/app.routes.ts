import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page').then((module) => module.AdminPage)
  },
  {
    path: 's/:roomCode',
    loadComponent: () => import('./features/room/room-page').then((module) => module.RoomPage)
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'admin'
  },
  {
    path: '**',
    redirectTo: 'admin'
  }
];
