import { Routes } from '@angular/router';
import { AuthGuard } from './shared/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'authorized/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'public',
    children: [
      {
        path: 'user',
        children: [
          {
            path: 'login',
            loadComponent: () => import('./pages/public/user/login/login.page').then( m => m.LoginPage)
          },
          {
            path: '',
            redirectTo: 'login',
            pathMatch: 'full',
          },
        ]
      },
      {
        path: '',
        redirectTo: 'user/login',
        pathMatch: 'full',
      },
    ]
  },
  {
    path: 'authorized',
    loadComponent: () => import('./shared/layouts/authorized-layout/authorized-layout.component').then(m => m.AuthorizedLayoutComponent),
    canActivate: [AuthGuard],
    children: [
      // dashboard
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/secure/dashboard/dashboard.page').then(m => m.DashboardPage),
        canActivate: [AuthGuard]
      },
      // services
      {
        path: 'services',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/services/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:address',
            loadComponent: () => import('./pages/secure/services/details/details.page').then( m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      // assets
      {
        path: 'assets',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/assets/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:address',
            loadComponent: () => import('./pages/secure/assets/details/details.page').then( m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      // subscriptions
      {
        path: 'subscriptions',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/subscriptions/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:address',
            loadComponent: () => import('./pages/secure/subscriptions/details/details.page').then( m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      // transactions
      {
        path: 'transactions',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/transactions/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      // system
      {
        path: 'system',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'profile',
            loadComponent: () => import('./pages/secure/profile/profile.page').then( m => m.ProfilePage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      // users (admin only)
      {
        path: 'users',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/users/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/users/details/details.page').then( m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/services/list',
            pathMatch: 'full',
          },
        ]
      },
      {
        path: '',
        redirectTo: '/authorized/dashboard',
        pathMatch: 'full',
      },
    ]
  },
];
