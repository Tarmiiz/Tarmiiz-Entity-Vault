import { Routes } from '@angular/router';
import { AuthGuard } from './shared/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'public/user/login',
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
            path: 'forgot-password',
            loadComponent: () => import('./pages/public/user/forgot-password/forgot-password.page').then( m => m.ForgotPasswordPage)
          },
          {
            path: '',
            redirectTo: 'public/user/login',
            pathMatch: 'full',
          },
        ]
      },      
      {
        path: 'register',
        children: [
          {
            path: 'operator',
            loadComponent: () => import('./pages/public/register/operator/ckyc-operator.page').then( m => m.CkycOperatorPage)
          },
          {
            path: 'service',
            loadComponent: () => import('./pages/public/register/service/service-register.page').then( m => m.ServiceRegisterPage)
          },
          {
            path: 'validator',
            loadComponent: () => import('./pages/public/register/validator/validator-register.page').then( m => m.ValidatorRegisterPage)
          },
          {
            path: '',
            redirectTo: 'public/user/login',
            pathMatch: 'full',
          },
        ],
      },
      {
        path: '',
        redirectTo: 'public/user/login',
        pathMatch: 'full',
      },
    ]
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
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/issuers/issuers-list/issuers.page').then( m => m.IssuersPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details',
            loadComponent: () => import('./pages/secure/issuers/issuer-details/issuer-details.page').then( m => m.IssuerDetailsPage),
            canActivate: [AuthGuard]
          },
        ]
      },
      {
        path: 'identities',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/identities/list/list.page').then( m => m.UsersPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'details/:uid',
            loadComponent: () => import('./pages/secure/identities/details/details.page').then( m => m.UserDetailsPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/dashboard',
            pathMatch: 'full',
          },          
        ]
      },
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
            redirectTo: '/authorized/dashboard',
            pathMatch: 'full',
          },          
        ]
      },
      {
        path: 'ckyc',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'operators',
            canActivate: [AuthGuard],
            children: [
              {
                path: 'details/:address',
                loadComponent: () => import('./pages/secure/operators/details/ckyc-operator-details.page').then( m => m.CkycOperatorDetailsPage),
                canActivate: [AuthGuard]
              },
            ]
          },
          {
            path: 'validators',
            canActivate: [AuthGuard],
            children: [
              {
                path: 'list',
                loadComponent: () => import('./pages/secure/validators/list/list.page').then( m => m.ListPage),
                canActivate: [AuthGuard]
              },
              {
                path: 'details/:address',
                loadComponent: () => import('./pages/secure/validators/details/details.page').then( m => m.DetailsPage),
                canActivate: [AuthGuard]
              },
            ]
          },
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
            ]
          },
          {
            path: '',
            redirectTo: '/authorized/dashboard',
            pathMatch: 'full',
          },
        ]
      },
      {
        path: 'system',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'logs',
            loadComponent: () => import('./pages/secure/logs/logs.page').then( m => m.LogsPage),
            canActivate: [AuthGuard]
          },
          {
            path: 'variables',
            loadComponent: () => import('./pages/secure/variables/system.page').then( m => m.SystemPage),
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
            redirectTo: '/authorized/dashboard',
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
