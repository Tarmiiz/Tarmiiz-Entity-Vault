import { Routes } from '@angular/router';
import { AuthGuard } from './shared/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/public/login/login.page').then( m => m.LoginPage)
  },  
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/public/forgot-password/forgot-password.page').then( m => m.ForgotPasswordPage)
  },
  {
    path: 'authorized',
    loadComponent: () => import('./shared/layouts/authorized-layout/authorized-layout.component').then(m => m.AuthorizedLayoutComponent),
    canActivate: [AuthGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/secure/dashboard/dashboard.page').then( m => m.DashboardPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'issuers',
        loadComponent: () => import('./pages/secure/issuers/issuers-list/issuers.page').then( m => m.IssuersPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'issuer-details',
        loadComponent: () => import('./pages/secure/issuers/issuer-details/issuer-details.page').then( m => m.IssuerDetailsPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'assets',
        loadComponent: () => import('./pages/secure/assets/assets-list/assets.page').then( m => m.AssetsPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'asset-details/:address',
        loadComponent: () => import('./pages/secure/assets/asset-details/asset-details.page').then( m => m.AssetDetailsPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/secure/users/users-list/users.page').then( m => m.UsersPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'user-details',
        loadComponent: () => import('./pages/secure/users/user-details/user-details.page').then( m => m.UserDetailsPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'logs',
        loadComponent: () => import('./pages/secure/logs/logs.page').then( m => m.LogsPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'system',
        loadComponent: () => import('./pages/secure/system/system.page').then( m => m.SystemPage),
        canActivate: [AuthGuard]
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/secure/profile/profile.page').then( m => m.ProfilePage),
        canActivate: [AuthGuard]
      },
      {
        path: '',
        redirectTo: '/authorized/dashboard',
        pathMatch: 'full',
      },    
    ]
  },
];
