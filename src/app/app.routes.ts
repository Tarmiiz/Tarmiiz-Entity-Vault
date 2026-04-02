import { Routes } from '@angular/router';
import { AuthGuard } from './shared/guards/auth.guard';
import { RoleGuard } from './shared/guards/role.guard';

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
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [1, 2, 3] }
      },
      // services
      {
        path: 'services',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2, 3] },
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
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2, 3] },
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
            redirectTo: '/authorized/assets/list',
            pathMatch: 'full',
          },
        ]
      },
      // subscriptions
      {
        path: 'subscriptions',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2, 3] },
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
            redirectTo: '/authorized/subscriptions/list',
            pathMatch: 'full',
          },
        ]
      },
      // transactions
      {
        path: 'transactions',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2, 3] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/transactions/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/transactions/list',
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
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] }
          },
          {
            path: '',
            redirectTo: '/authorized/dashboard',
            pathMatch: 'full',
          },
        ]
      },
      // users
      {
        path: 'users',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/users/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] }
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/users/details/details.page').then( m => m.DetailsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] }
          },
          {
            path: 'my-profile',
            loadComponent: () => import('./pages/secure/users/my-profile/my-profile.page').then( m => m.MyProfilePage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [2, 3] }
          },
          {
            path: '',
            redirectTo: '/authorized/users/list',
            pathMatch: 'full',
          },
        ]
      },
      // variables
      {
        path: 'variables',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [1, 2, 3] },
        children: [
          {
            path: 'system',
            loadComponent: () => import('./pages/secure/variables/system.page').then(m => m.SystemPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/variables/system',
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
