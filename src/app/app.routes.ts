import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthGuard } from './shared/guards/auth.guard';
import { RoleGuard } from './shared/guards/role.guard';
import { FeaturesService } from './shared/services/features.service';

// Factory: guards a route behind an admin menu toggle. Blocks (→ dashboard) when the
// tenant has the menu key disabled. Awaits the features fetch first so a hard-refresh
// on a deep URL doesn't race the flag load.
const menuFeatureGuard = (key: string): CanActivateFn => async () => {
  const features = inject(FeaturesService);
  const router   = inject(Router);
  if (!features.loaded()) await features.refresh();
  if (features.menuEnabled(key)) return true;
  router.navigate(['/authorized/dashboard']);
  return false;
};

// DEX has an extra env-level kill switch on top of the menu toggle (features.dex()
// folds both together).
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
            path: 'claim',
            loadComponent: () => import('./pages/public/user/claim/claim.page').then( m => m.ClaimPage)
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
      // dashboard — issuer vs service-provider variant chosen by vaultMode. Awaits the
      // features fetch first (same reason as menuFeatureGuard): the mode is server-owned
      // now, so a hard refresh here would otherwise pick the variant off the config.json
      // fallback. inject() runs before the first await, as an injection context requires.
      {
        path: 'dashboard',
        loadComponent: async () => {
          const features = inject(FeaturesService);
          if (!features.loaded()) await features.refresh();
          // Order matters: a clearing house IS a service provider, so its check runs first.
          if (features.isClearingHouse()) {
            return (await import('./pages/secure/dashboard/clearing-house/clearing-house-dashboard.page')).ClearingHouseDashboardPage;
          }
          return features.isServiceProvider()
            ? (await import('./pages/secure/dashboard/service-provider/service-provider-dashboard.page')).ServiceProviderDashboardPage
            : (await import('./pages/secure/dashboard/dashboard.page')).DashboardPage;
        },
        canActivate: [AuthGuard, RoleGuard],
        data: { allowedRoles: [1, 2, 3] }
      },
      // analytics — issuer-side multi-chart dashboards
      {
        path: 'analytics',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('analytics')],
        data: { allowedRoles: [2, 3] },
        children: [
          { path: 'aum',         loadComponent: () => import('./pages/secure/analytics/aum-performance/aum-performance.page').then(m => m.AumPerformancePage), canActivate: [AuthGuard] },
          { path: 'investors',   loadComponent: () => import('./pages/secure/analytics/investors/investors.page').then(m => m.InvestorsPage), canActivate: [AuthGuard] },
          { path: 'flows',       loadComponent: () => import('./pages/secure/analytics/flows/flows.page').then(m => m.FlowsPage), canActivate: [AuthGuard] },
          { path: 'credit',      loadComponent: () => import('./pages/secure/analytics/credit-liquidity/credit-liquidity.page').then(m => m.CreditLiquidityPage), canActivate: [AuthGuard] },
          { path: 'dex',         loadComponent: () => import('./pages/secure/analytics/dex-secondary/dex-secondary.page').then(m => m.DexSecondaryPage), canActivate: [AuthGuard, dexFeatureGuard] },
          { path: 'operational', loadComponent: () => import('./pages/secure/analytics/operational-risk/operational-risk.page').then(m => m.OperationalRiskPage), canActivate: [AuthGuard] },
          { path: '', redirectTo: 'aum', pathMatch: 'full' },
        ],
      },
      // services
      {
        path: 'services',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('services')],
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
      // service-providers — admin-curated subset of the regulator's authorised SPs that
      // the entity's services may select from (validators / payment processors / custodians)
      {
        path: 'service-providers',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('service-providers')],
        data: { allowedRoles: [1] },
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/service-providers/list/list.page').then(m => m.ListPage),
            canActivate: [AuthGuard]
          },
          {
            path: '',
            redirectTo: '/authorized/service-providers/list',
            pathMatch: 'full',
          },
        ]
      },
      // custody — service-provider custodian overview (folded in from Service Dashboard)
      {
        path: 'custody',
        loadComponent: () => import('./pages/secure/custody/custody.page').then(m => m.CustodyPage),
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('custody')],
        data: { allowedRoles: [2, 3] },
      },
      // assets
      {
        path: 'assets',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('assets')],
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
              { path: 'details/:ref', loadComponent: () => import('./pages/secure/dex/orders/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
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
            // Negotiated OTC deals — the bilateral surface (2026-08-07). Keyed by the
            // bytes32 deal key, not a numeric id like orders/trades.
            path: 'deals',
            children: [
              { path: 'list',         loadComponent: () => import('./pages/secure/dex/deals/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:key', loadComponent: () => import('./pages/secure/dex/deals/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            // RFQ — the competitive surface layered over deals (2026-08-08). Keyed by
            // the bytes32 request key. It sits under the same `dex` menu key as deals:
            // an RFQ is a fan-out over them, not a separate product.
            path: 'rfqs',
            children: [
              { path: 'list',         loadComponent: () => import('./pages/secure/dex/rfqs/list/list.page').then( m => m.ListPage), canActivate: [AuthGuard] },
              { path: 'details/:key', loadComponent: () => import('./pages/secure/dex/rfqs/details/details.page').then( m => m.DetailsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'order-book',
            children: [
              { path: 'view/:asset', loadComponent: () => import('./pages/secure/dex/order-book/view/view.page').then( m => m.ViewPage), canActivate: [AuthGuard] },
            ],
          },
          {
            path: 'offerings',
            children: [
              { path: 'list', loadComponent: () => import('./pages/secure/dex/offerings/offerings.page').then( m => m.OfferingsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          {
            path: 'memberships',
            children: [
              { path: 'list', loadComponent: () => import('./pages/secure/dex/memberships/memberships.page').then( m => m.MembershipsPage), canActivate: [AuthGuard] },
              { path: '', redirectTo: 'list', pathMatch: 'full' },
            ],
          },
          { path: '', redirectTo: '/authorized/dashboard', pathMatch: 'full' },
        ]
      },
      // subscriptions
      {
        path: 'subscriptions',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('subscriptions')],
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
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('credit')],
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
      // settlements — fiat obligations / net positions / settlement confirms
      {
        path: 'settlements',
        loadComponent: () => import('./pages/secure/settlements/settlements.page').then(m => m.SettlementsPage),
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('settlements')],
        data: { allowedRoles: [2, 3] },
      },
      // clearing — deferred DvP: the running clearing account, pending deliveries, netting
      // cycles, the pay-in board, and both sides of clearing membership. One page because a
      // tenant can be BOTH the clearing house and a member of another one.
      {
        path: 'clearing',
        loadComponent: () => import('./pages/secure/clearing/clearing.page').then(m => m.ClearingPage),
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('clearing')],
        data: { allowedRoles: [2, 3] },
      },
      // distribution — inbound distribution agreements + primary-market trade feed
      {
        path: 'distribution',
        loadComponent: () => import('./pages/secure/distribution/distribution.page').then(m => m.DistributionPage),
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('distribution')],
        data: { allowedRoles: [2, 3] },
      },
      // documents
      {
        path: 'documents',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('documents')],
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
            path: 'shared/:owner/:id',
            loadComponent: () => import('./pages/secure/documents/shared-details/shared-details.page').then(m => m.SharedDetailsPage),
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
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('signer-keys')],
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
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('messages')],
        data: { allowedRoles: [1, 2, 3, 4] }, // role 4 = Security officer, read-only full-audit view
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
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('transactions')],
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
            data: { allowedRoles: [1, 2, 3, 4] }
          },
          {
            path: '',
            redirectTo: '/authorized/users/list',
            pathMatch: 'full',
          },
        ]
      },
      // approvals — the approval-request queue (maker/checker workflow). The
      // policy/settings page moved to /authorized/settings/approval-policy.
      {
        path: 'approvals',
        canActivate: [AuthGuard, menuFeatureGuard('approvals')],
        children: [
          {
            path: 'list',
            loadComponent: () => import('./pages/secure/approvals/list/list.page').then( m => m.ListPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1, 2] },
          },
          {
            path: '',
            redirectTo: 'list',
            pathMatch: 'full',
          },
        ]
      },
      // logs (audit trail) — Security officer (4) only
      {
        path: 'logs',
        canActivate: [AuthGuard, menuFeatureGuard('logs')],
        children: [
          {
            path: 'my',
            loadComponent: () => import('./pages/secure/logs/my/my.page').then(m => m.MyPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [4] }
          },
          {
            path: 'system',
            loadComponent: () => import('./pages/secure/logs/system/system.page').then(m => m.SystemPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [4] }
          },
          {
            path: 'activity',
            loadComponent: () => import('./pages/secure/logs/activity/activity.page').then(m => m.ActivityPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [4] }
          },
          {
            path: 'details/:id',
            loadComponent: () => import('./pages/secure/logs/details/details.page').then(m => m.DetailsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [4] }
          },
          {
            path: '',
            redirectTo: 'system',
            pathMatch: 'full',
          },
        ]
      },
      // variables
      {
        path: 'variables',
        canActivate: [AuthGuard, RoleGuard, menuFeatureGuard('variables')],
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
      // settings (admin) — Menu Settings is a core page, never gated by a menu toggle
      {
        path: 'settings',
        canActivate: [AuthGuard],
        children: [
          {
            path: 'menu',
            loadComponent: () => import('./pages/secure/settings/menu/menu.page').then(m => m.MenuSettingsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            // Approval Settings — admin only, core page (never menu-gated); the
            // maker/checker policy toggles, decoupled from the 'approvals' module.
            path: 'approval-policy',
            loadComponent: () => import('./pages/secure/approvals/policy/policy.page').then(m => m.PolicyPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            path: 'user-groups',
            loadComponent: () => import('./pages/secure/settings/user-groups/list/user-groups.page').then(m => m.UserGroupsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            path: 'user-groups/details/:groupId',
            loadComponent: () => import('./pages/secure/settings/user-groups/details/details.page').then(m => m.UserGroupDetailsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            path: 'backup',
            loadComponent: () => import('./pages/secure/settings/backup/backup.page').then(m => m.SettingsBackupPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            path: 'external-integrations',
            loadComponent: () => import('./pages/secure/settings/external-integrations/external-integrations.page').then(m => m.ExternalIntegrationsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            path: 'app-config',
            loadComponent: () => import('./pages/secure/settings/app-config/app-config.page').then(m => m.AppConfigPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            // ⚠️ NO `menuFeatureGuard` — every `settings` child deliberately omits it, so an
            // admin cannot toggle away their own way back. That matters more here than on its
            // siblings: this is the page that governs the endpoints, and gating it behind a
            // switch it can itself flip would be a lock whose key is inside the box.
            //
            // ⚠️ Folder is `pages/secure/…`, URL is `/authorized/settings/…`. The two prefixes
            // differ across the whole app and the mismatch catches people.
            path: 'api-endpoints',
            loadComponent: () => import('./pages/secure/settings/api-endpoints/api-endpoints.page').then(m => m.ApiEndpointsPage),
            canActivate: [AuthGuard, RoleGuard],
            data: { allowedRoles: [1] },
          },
          {
            // Legacy alias for the pre-rename eKYC Providers page.
            path: 'ekyc-providers',
            redirectTo: 'external-integrations',
          },
          {
            path: '',
            redirectTo: 'menu',
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
