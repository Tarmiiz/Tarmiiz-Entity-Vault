import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthGuard } from './shared/guards/auth.guard';
import { RoleGuard } from './shared/guards/role.guard';
import { FeaturesService } from './shared/services/features.service';

// Functional guard that hides /authorized/dex/... routes when DEX is disabled at the API.
// Waits for the features service to load before deciding so a hard-refresh on a /authorized/dex/...
// URL doesn't race the flag fetch.
const dexFeatureGuard: CanActivateFn = async () => {
  const features = inject(FeaturesService);
  const router   = inject(Router);
  if (!features.loaded()) await features.refresh();
  if (features.dex()) return true;
  router.navigate(['/authorized/dashboard']);
  return false;
};

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
            path: 'documents/list/:address',
            loadComponent: () => import('./pages/secure/services/documents/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'documents/details/:address/:id',
            loadComponent: () => import('./pages/secure/services/documents/details/details.page').then(m => m.DetailsPage),
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
            path: 'documents/list/:address',
            loadComponent: () => import('./pages/secure/assets/documents/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'documents/details/:address/:id',
            loadComponent: () => import('./pages/secure/assets/documents/details/details.page').then(m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/assets/list',
            pathMatch: 'full',
          },
        ]
      },
      // dex
      {
        path: 'dex',
        canActivate: [AuthGuard, RoleGuard, dexFeatureGuard],
        data: { allowedRoles: [2, 3] },
        children: [
          {
            path: 'venues',
            children: [
              { path: 'list',             loadComponent: () => import('./pages/secure/dex/venues/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:address', loadComponent: () => import('./pages/secure/dex/venues/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'asset-listings',
            children: [
              { path: 'list',           loadComponent: () => import('./pages/secure/dex/asset-listings/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:asset', loadComponent: () => import('./pages/secure/dex/asset-listings/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'orders',
            children: [
              { path: 'list',             loadComponent: () => import('./pages/secure/dex/orders/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:orderId', loadComponent: () => import('./pages/secure/dex/orders/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'trades',
            children: [
              { path: 'list',             loadComponent: () => import('./pages/secure/dex/trades/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:tradeId', loadComponent: () => import('./pages/secure/dex/trades/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'order-book',
            children: [
              { path: 'view/:asset', loadComponent: () => import('./pages/secure/dex/order-book/view/view.page').then( m => m.ViewPage), canActivate: [AuthGuard] },
            ],
          },
          { path: '', redirectTo: '/authorized/dashboard', pathMatch: 'full' },
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
      // credit
      {
        path: 'credit',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2, 3] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/credit/credit.page').then(m => m.CreditPage),
            canActivate: [AuthGuard],
          },
          { path: '', redirectTo: '/authorized/credit/list', pathMatch: 'full' },
        ],
      },
      // documents
      {
        path: 'documents',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [1, 2] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/documents/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/documents/details/details.page').then(m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/dashboard',
            pathMatch: 'full',
          },
        ]
      },
      // signer-keys (issuer-only — used for document signing)
      {
        path: 'signer-keys',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [2] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/signer-keys/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/signer-keys/list',
            pathMatch: 'full',
          },
        ]
      },
      // messages
      {
        path: 'messages',
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [1, 2, 3] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/messages/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/messages/details/details.page').then(m => m.DetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/messages/list',
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
      // logs (audit trail)
      {
        path: 'logs',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'my',
            loadComponent: () => import('./pages/secure/logs/my/my.page').then(m => m.MyPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1, 2, 3] }
          },
          {
            path: 'system',
            loadComponent: () => import('./pages/secure/logs/system/system.page').then(m => m.SystemPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] }
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/logs/details/details.page').then(m => m.DetailsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1, 2, 3] }
          },
          {
            path: '',
            redirectTo: 'my',
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
