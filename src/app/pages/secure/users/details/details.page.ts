import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../shared/components/live-indicator/live-indicator.component";

import { ApiService } from '../../../../shared/services/api.service';
import { EthersService } from '../../../../shared/services/ethers.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { User } from '../../../../shared/models/data.model';
import { ModalUserStateService } from '../modals/modal-user-state/modal-user-state.service';
import { ModalUserStateComponent } from "../modals/modal-user-state/modal-user-state.component";
import { ModalUserEditService } from '../modals/modal-user-edit/modal-user-edit.service';
import { ModalUserEditComponent } from "../modals/modal-user-edit/modal-user-edit.component";

import { ModalUserEditCredentialsComponent } from "../modals/modal-user-edit-credentials/modal-user-edit-credentials.component";
import { ModalUserCredentialsService } from '../modals/modal-user-edit-credentials/modal-user-edit-credentials.service';
import { ModalUserRoleComponent } from '../modals/modal-user-role/modal-user-role.component';
import { ModalUserRoleService } from '../modals/modal-user-role/modal-user-role.service';
import { ModalUserApprovalRoleService, ApprovalRoleValue } from '../modals/modal-user-approval-role/modal-user-approval-role.service';
import { ModalUserApprovalRoleComponent } from '../modals/modal-user-approval-role/modal-user-approval-role.component';
import { ModalUserGroupService } from '../modals/modal-user-group/modal-user-group.service';
import { ModalUserGroupComponent } from '../modals/modal-user-group/modal-user-group.component';
import { UserGroup } from '../../../../shared/models/data.model';
import { SocketService } from '../../../../shared/services/socket.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { menuLabelFor } from '../../../../shared/constants/menu-labels';
import { systemFunctionLabelFor, systemFunctionGroupFor, systemFunctionGroupLabelFor, systemFunctionLabelInGroup } from '../../../../shared/constants/system-function-labels';
import { SubTabRailComponent } from '../../../../shared/components/sub-tab-rail/sub-tab-rail.component';
import { TabsComponent, TabDef } from '../../../../shared/components/tabs/tabs.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { LicensePillComponent, LicenseStatus } from '../../../../shared/components/license-pill/license-pill.component';

interface UserMenuRow {
  menuKey: string;
  tenantEnabled: boolean;
  userEnabled: boolean | null;  // null ⇒ inherit (group setting, else role default)
  groupEnabled: boolean | null; // null ⇒ no group row / group inert
  effective: boolean;
  // Surfaced by the Entity API (licenseSurfacing.js). OPTIONAL because an older API response
  // simply omits it, and the pill renders nothing for an absent value.
  license?: LicenseStatus | null;
}

/* One VPN grant, already reconciled against the host by the API (Phase 34.5/34.6).
   `status` IS that reconciliation and the four values are not interchangeable:
     active  — recorded here and present on the host
     stale   — recorded here but ABSENT on the host, so it confers no access
     revoked — revoked through the Vault; kept as history, never deleted
     unknown — the host broker could not be reached, which is NOT "no access" */
interface VpnPeerRow {
  peerName: string;
  person: string;
  userId: string | null;
  kind: 'user' | 'integration';
  cn: string;
  address: string;
  label: string | null;
  createdAt: number;
  notAfter: number | null;
  grantedBy: string | null;
  revokedAt: number | null;
  status: 'active' | 'stale' | 'revoked' | 'unknown';
}

interface UserSystemFunctionRow {
  functionKey: string;
  defaultEnabled: boolean;
  userEnabled: boolean | null;  // null ⇒ inherit (group setting, else role default)
  groupEnabled: boolean | null; // null ⇒ no group row / group inert
  effective: boolean;
  // Surfaced by the Entity API (licenseSurfacing.js). OPTIONAL because an older API response
  // simply omits it, and the pill renders nothing for an absent value.
  license?: LicenseStatus | null;
}


@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    LiveIndicatorComponent,
    RouterLink,
    ModalUserEditComponent,
    ModalUserStateComponent,
    ModalUserEditCredentialsComponent,
    ModalUserRoleComponent,
    ModalUserApprovalRoleComponent,
    ModalUserGroupComponent, TranslatePipe, LicensePillComponent,
    TabsComponent, SubTabRailComponent, LoadingStateComponent]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private ethersService = inject(EthersService);
  private authService = inject(AuthService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private userEditService = inject(ModalUserEditService);
  private userStateService = inject(ModalUserStateService);
  private userCredentialsService = inject(ModalUserCredentialsService);
  private userRoleService = inject(ModalUserRoleService);
  private userApprovalRoleService = inject(ModalUserApprovalRoleService);
  private userGroupService = inject(ModalUserGroupService);
  private socketService = inject(SocketService);
  private features = inject(FeaturesService);
  private translate = inject(TranslateService);

  private _socketSub: Subscription | null = null;
  private _isBusy = false;

  private readonly stateKeys: Record<number, string> = {
    1: 'state.initiated', 2: 'state.active', 3: 'state.suspended', 4: 'state.deactivated'
  };
  private readonly roleKeys: Record<number, string> = {
    1: 'role.admin', 2: 'users.roles.executive', 3: 'role.viewer', 4: 'users.roles.security'
  };

  loadingData: boolean = false;
  refreshing = signal(false);

  userId = signal<number>(0);
  user = signal<User | undefined>(undefined);

  // True when the admin is looking at their OWN record. Change Role is hidden then: the API
  // 403s a self-targeted role change (an admin excluded from a `roles: [2]` System Function
  // could otherwise demote themselves to collect it, and the last admin could lock the
  // tenant out of every admin surface). Hiding the button is UX — the server is the gate.
  isSelf = computed(() => Number(this.authService.userInfo?.userId) === this.userId());

  approvalRole       = signal<'none' | 'maker' | 'checker'>('none');
  approvalRoleSaving = signal(false);

  // User Group membership (roles 2/3 only). groupRoleMatch false ⇒ the assigned group
  // targets a different role than the user's current on-chain role — the group layer
  // is inert until cleared/reassigned (amber warning in the UI).
  userGroup       = signal<UserGroup | null>(null);
  groupRoleMatch  = signal(true);
  groupSaving     = signal(false);

  // Tabs: 'details' (default) + 'menu' (per-user Menu Access, role 2/3 only)
  // + 'system-functions' (per-user action-button gating; shown only when the target
  // user's role has applicable functions — the list drives visibility).
  // + 'vpn' (Phase 34.5/34.6 — this person's VPN access to the Vault).
  activeTab   = signal<'details' | 'menu' | 'system-functions' | 'vpn'>('details');
  menuRows    = signal<UserMenuRow[]>([]);
  menuLoading = signal(false);
  menuSaving  = signal<string | null>(null); // menu key currently saving
  private menuLoaded = false;

  sysFnRows    = signal<UserSystemFunctionRow[]>([]);
  sysFnLoading = signal(false);
  sysFnSaving  = signal<string | null>(null); // function key currently saving
  sysFnFilter  = signal('');                  // free-text filter over label + key

  /** sysFnRows narrowed by the free-text filter (matches label or raw key, case-insensitive). */
  filteredSysFnRows = computed(() => {
    const q = this.sysFnFilter().trim().toLowerCase();
    const rows = this.sysFnRows();
    if (!q) return rows;
    return rows.filter(r =>
      this.fnLabelFor(r.functionKey).toLowerCase().includes(q) ||
      r.functionKey.toLowerCase().includes(q));
  });

  /**
   * The top tab bar (Standard 2). Computed rather than a constant because three
   * of the four tabs are conditional — Menu Access and System Functions depend
   * on the TARGET user's role, and VPN on the feature being enabled.
   *
   * ⚠️ `activeTab` is NOT reconciled against this list. It does not need to be:
   * the default is 'details', which is always present, and the only way to
   * reach another tab is to click it. If a tab ever becomes reachable by URL,
   * that changes.
   */
  tabs = computed<TabDef[]>(() => {
    const out: TabDef[] = [{ key: 'details', label: 'users.details.tabs.details' }];
    if (this.showMenuTab())            out.push({ key: 'menu',             label: 'users.details.menu.title' });
    if (this.showSystemFunctionsTab()) out.push({ key: 'system-functions', label: 'users.details.sysfn.title' });
    if (this.showVpnTab())             out.push({ key: 'vpn',              label: 'users.details.vpn.title' });
    return out;
  });

  // ─── System Functions rail (Standard 2.1, grouped-list case) ───────────────
  //
  // 89 registry keys in one flat table is a scroll, not a control surface, so
  // the tab rails them by domain and shows one group at a time.
  //
  // THE RAIL AND THE FILTER COMPOSE, in this order: the filter narrows the
  // whole registry, and the rail is rebuilt from what SURVIVES it. So a filter
  // that matches nothing in the selected group makes that group disappear from
  // the rail rather than showing an empty pane — and `activeSysFnGroup()`
  // falls back to the first surviving group, which is why it is a computed over
  // a plain signal rather than the signal itself. The old flat table filtered
  // in place and had no such interaction to get wrong.
  sysFnGroup = signal<string | null>(null);

  /** Groups present in the filtered rows, in registry-count order (largest first). */
  sysFnGroups = computed(() => {
    const seen = new Map<string, number>();
    for (const r of this.filteredSysFnRows()) {
      const g = systemFunctionGroupFor(r.functionKey);
      seen.set(g, (seen.get(g) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, label: systemFunctionGroupLabelFor(key), count }));
  });

  /**
   * The group actually shown. Falls back to the first available group when
   * nothing is chosen yet, or when the chosen one has been filtered away —
   * without that fallback a filter could leave the pane blank with every rail
   * item looking unselected.
   */
  activeSysFnGroup = computed(() => {
    const groups = this.sysFnGroups();
    const chosen = this.sysFnGroup();
    if (chosen && groups.some(g => g.key === chosen)) return chosen;
    return groups.length ? groups[0].key : null;
  });

  /** The rows of the selected group only — what the pane renders. */
  sysFnRowsInGroup = computed(() => {
    const g = this.activeSysFnGroup();
    if (!g) return [];
    return this.filteredSysFnRows().filter(r => systemFunctionGroupFor(r.functionKey) === g);
  });

  constructor() { }

  labelFor(key: string): string { return this.translate.instant(menuLabelFor(key)); }
  fnLabelFor(key: string): string { return this.translate.instant(systemFunctionLabelFor(key)); }

  /**
   * The label as rendered in the group table — the rail item already names the
   * domain, so the prefix is dropped there and only there. `fnLabelFor` keeps the
   * full string for the filter, the sort and the confirm dialogs.
   */
  fnLabelInGroup(key: string): string {
    return systemFunctionLabelInGroup(
      this.fnLabelFor(key),
      this.translate.instant(systemFunctionGroupLabelFor(systemFunctionGroupFor(key))),
    );
  }

  /**
   * Per-user Menu Access — roles 1, 2 and 3. Twin of the Regulator Dashboard's; keep in step.
   *
   * ⚠️ ADMINS INCLUDED SINCE 2026-09-17, on an explicit request: a SUPER ADMIN alongside
   * admins who see only some modules. The old comment ("applies only to non-admin targets —
   * admins bypass menu gating") was never true of the server: `db.getEffectiveMenuForUser`
   * layers `user_override ?? group ?? role default` for every role, restrict-only for 1/2. The
   * overrides were always stored and honoured; only the tab to set them was missing.
   *
   * Role 4 (Auditor) stays out — the `/features/me` role-4 fold forces the audit surface on and
   * everything else off, so an override there would be overwritten and read as a dead control.
   *
   * 🔴 Self-restriction is blocked server-side (`menuConfigController.userSet` self guard, same
   * pass): hiding your own Menu Settings hides the page that would undo it. Admin A stripping
   * admin B is NOT floored — see TODO.md for the "last unrestricted admin" item.
   */
  showMenuTab(): boolean {
    const role = Number(this.user()?.role);
    return role === 1 || role === 2 || role === 3;
  }

  /** Viewer targets are allow-list: modules/functions start blocked and the admin grants them. */
  isViewerTarget(): boolean {
    return Number(this.user()?.role) === 3;
  }

  /** The target user is a Security officer / Auditor (role 4). */
  isAuditorTarget(): boolean {
    return Number(this.user()?.role) === 4;
  }

  // Security officer (role 4) read-only Messages access grant (the `messages`
  // per-user menu override; default OFF). Shown on the Details tab for auditors.
  messagesAccess       = signal(false);
  messagesAccessSaving = signal(false);

  async loadMessagesAccess() {
    try {
      const rows = await this.apiService.vaultUserMenuConfigList(this.userId());
      const row = (rows || []).find((r: any) => r.menuKey === 'messages');
      // Role-4 default is OFF, so the grant exists only as an explicit true override.
      this.messagesAccess.set(row?.userEnabled === true);
    } catch {
      this.messagesAccess.set(false);
    }
  }

  async toggleMessagesAccess(enabled: boolean) {
    const u = this.user();
    if (!u || this.messagesAccessSaving()) return;
    const ok = await this.alertService.show(
      this.translate.instant('users.details.messagesAccess.confirmTitle'),
      this.translate.instant(
        enabled ? 'users.details.messagesAccess.confirmGrant' : 'users.details.messagesAccess.confirmRevoke',
        { name: u.name },
      ),
      this.translate.instant('common.save'),
    );
    if (!ok) return;
    this.messagesAccessSaving.set(true);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserMenuConfigSet(u.userId, 'messages', enabled);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadMessagesAccess();
      }
    } finally {
      this.messagesAccessSaving.set(false);
      this.loadingService.hide();
    }
  }

  /** User Groups apply to roles 2/3 only (mirrors the server-side allowed group roles). */
  showGroupCard(): boolean {
    const role = Number(this.user()?.role);
    return role === 2 || role === 3;
  }

  /** Which layer decides this row: explicit override > group setting > role default. */
  rowSource(row: { userEnabled: boolean | null; groupEnabled: boolean | null }): 'override' | 'group' | 'default' {
    if (row.userEnabled !== null) return 'override';
    if (row.groupEnabled !== null) return 'group';
    return 'default';
  }

  setTab(tab: 'details' | 'menu' | 'system-functions' | 'vpn') {
    this.activeTab.set(tab);
    if (tab === 'menu' && !this.menuLoaded) this.loadMenuConfig();
    if (tab === 'vpn' && !this.vpnLoaded) this.loadVpn();
  }

  /* ── VPN access (Phase 34.5/34.6) ───────────────────────────────────────────
     This tenant's Vault is reachable only through the host's OpenVPN instance — the
     wildcard vhost listens on the tunnel address and nginx refuses any request whose
     peer address does not map to the hostname being asked for. So a grant on this tab
     is what lets this person reach the Vault at all, which is why the whole surface
     sits behind the default-deny `user-vpn-manage` System Function. */
  vpnPeers         = signal<VpnPeerRow[]>([]);
  vpnLoading       = signal(false);
  vpnBusy          = signal<string | null>(null);
  vpnHostReachable = signal(true);
  vpnHostError     = signal<string | null>(null);
  newPeerPerson    = signal('');
  newPeerLabel     = signal('');
  private vpnLoaded = false;

  /** Gated by the key, not by role alone — an admin without the grant sees no tab. */
  showVpnTab(): boolean {
    return this.features.systemFunctionEnabled('user-vpn-manage');
  }

  async loadVpn() {
    this.vpnLoading.set(true);
    try {
      const res = await this.apiService.vaultVpnList(this.userId());
      this.vpnPeers.set(res.peers as VpnPeerRow[]);
      this.vpnHostReachable.set(res.hostReachable);
      this.vpnHostError.set(res.hostError);
      this.vpnLoaded = true;
    } catch {
      this.vpnPeers.set([]);
      // An error is NOT "no access" — say the list could not be read rather than
      // rendering an empty table, which reads as "this person has none".
      this.vpnHostReachable.set(false);
      this.vpnHostError.set(this.translate.instant('users.details.vpn.loadFailed'));
    } finally {
      this.vpnLoading.set(false);
    }
  }

  /** 2-21 chars: the PERSON half only. The host prefixes the tenant itself. */
  peerNameValid(): boolean {
    return /^[a-z0-9][a-z0-9-]{1,20}$/.test(this.newPeerPerson().trim().toLowerCase());
  }

  async grantVpn() {
    const person = this.newPeerPerson().trim().toLowerCase();
    if (!this.peerNameValid() || this.vpnBusy()) return;
    this.vpnBusy.set(person);
    try {
      const res: any = await this.apiService.vaultVpnGrantUser(
        this.userId(), person, this.newPeerLabel().trim() || undefined);
      if (res?.error) {
        await this.alertService.info(this.translate.instant('users.details.vpn.grantFailedTitle'), res.error);
        return;
      }
      // 🔴 THE ONLY COPY. The API stored no key and the host kept none — if this
      // download does not happen the profile is gone and the peer must be revoked
      // and re-minted. So it is saved BEFORE anything else, the reload included.
      this.downloadProfile(res.profileFileName || `${person}.ovpn`, res.profile);
      await this.loadVpn();
      this.newPeerPerson.set('');
      this.newPeerLabel.set('');
      await this.alertService.info(
        this.translate.instant('users.details.vpn.grantedTitle'),
        this.translate.instant('users.details.vpn.grantedMsg', { file: res.profileFileName || `${person}.ovpn` }));
    } catch {
      await this.alertService.info(
        this.translate.instant('users.details.vpn.grantFailedTitle'),
        this.translate.instant('users.details.vpn.grantFailedMsg'));
    } finally {
      this.vpnBusy.set(null);
    }
  }

  async revokeVpn(person: string) {
    // `show`, not `info` — info hides Cancel, and cutting someone's only route to the
    // Vault must be refusable.
    const confirmed = await this.alertService.show(
      this.translate.instant('users.details.vpn.revokeConfirmTitle'),
      this.translate.instant('users.details.vpn.revokeConfirmMsg', { peer: person }),
      this.translate.instant('users.details.vpn.revokeConfirmAction'));
    if (!confirmed || this.vpnBusy()) return;
    this.vpnBusy.set(person);
    try {
      const res: any = await this.apiService.vaultVpnRevoke(person);
      if (res?.error) {
        await this.alertService.info(this.translate.instant('users.details.vpn.revokeFailedTitle'), res.error);
        return;
      }
      await this.loadVpn();
    } catch {
      await this.alertService.info(
        this.translate.instant('users.details.vpn.revokeFailedTitle'),
        this.translate.instant('users.details.vpn.revokeFailedMsg'));
    } finally {
      this.vpnBusy.set(null);
    }
  }

  /** dd/MM/yyyy HH:mm:ss over a MILLISECOND epoch, per the platform date standard. */
  formatTime(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
         + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** Save the .ovpn. Blob + object URL, revoked at once — the profile must not linger
   *  in memory or as a data: URL in the address bar. */
  private downloadProfile(fileName: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-openvpn-profile' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Content-driven: the tab shows only when a function applies to this user's role. */
  showSystemFunctionsTab(): boolean {
    return this.sysFnRows().length > 0;
  }

  async loadSystemFunctionsConfig() {
    this.sysFnLoading.set(true);
    try {
      // A function the regulator's licences or grants close controls nothing — hidden, not locked.
      const rows = (await this.apiService.vaultUserSystemFunctionConfigList(this.userId()))
        .filter(r => r.license?.state !== 'not-covered' && !r.grantDenied);
      rows.sort((a, b) => this.fnLabelFor(a.functionKey).localeCompare(this.fnLabelFor(b.functionKey)));
      this.sysFnRows.set(rows);
    } catch {
      this.sysFnRows.set([]);
    } finally {
      this.sysFnLoading.set(false);
    }
  }

  async toggleSystemFunction(row: UserSystemFunctionRow, enabled: boolean) {
    if (this.sysFnSaving()) return;
    const u = this.user();
    if (!u) return;
    const verb = this.translate.instant(enabled ? 'users.details.sysfn.confirmVerbAvailable' : 'users.details.sysfn.confirmVerbBlocked');
    const ok = await this.alertService.show(
      this.translate.instant('users.details.sysfn.confirmTitle'),
      this.translate.instant('users.details.sysfn.confirmMessage', { fn: this.fnLabelFor(row.functionKey), verb }),
      this.translate.instant('common.save'),
    );
    if (!ok) return;
    this.sysFnSaving.set(row.functionKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserSystemFunctionConfigSet(u.userId, row.functionKey, enabled);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadSystemFunctionsConfig();
      }
    } finally {
      this.loadingService.hide();
      this.sysFnSaving.set(null);
    }
  }

  async loadMenuConfig() {
    this.menuLoading.set(true);
    try {
      const rows = (await this.apiService.vaultUserMenuConfigList(this.userId()))
        // Restrict-only: a per-user override can only narrow the tenant menu, so only
        // tenant-enabled keys the regulator has licensed AND granted are actionable here. The
        // rest are hidden for everyone regardless (user ruling 2026-09-10: hidden, not locked).
        .filter(r => r.tenantEnabled && r.license?.state !== 'not-covered' && !r.grantDenied);
      rows.sort((a, b) => this.labelFor(a.menuKey).localeCompare(this.labelFor(b.menuKey)));
      this.menuRows.set(rows);
      this.menuLoaded = true;
    } finally {
      this.menuLoading.set(false);
    }
  }

  async toggleMenu(row: UserMenuRow, enabled: boolean) {
    if (this.menuSaving()) return;
    const u = this.user();
    if (!u) return;
    const verb = this.translate.instant(enabled ? 'users.details.menu.confirmVerbShown' : 'users.details.menu.confirmVerbBlocked');
    const ok = await this.alertService.show(
      this.translate.instant('users.details.menu.confirmTitle'),
      this.translate.instant('users.details.menu.confirmMessage', { menuItem: this.labelFor(row.menuKey), verb }),
      this.translate.instant('common.save'),
    );
    if (!ok) return;
    this.menuSaving.set(row.menuKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserMenuConfigSet(u.userId, row.menuKey, enabled);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadMenuConfig();
      }
    } finally {
      this.loadingService.hide();
      this.menuSaving.set(null);
    }
  }

  async ngOnInit() {}

  async ionViewWillEnter() {
    const userId = this.route.snapshot.paramMap.get('id');
    if (userId) {
      this.userId.set(Number(userId));
    }
    this.activeTab.set('details');
    this.menuLoaded = false;
    this.menuRows.set([]);
    this.sysFnRows.set([]);
    this.sysFnFilter.set('');
    this.messagesAccess.set(false);
    await this.getUserDetails();
    await this.loadApprovalRole();
    await this.loadUserGroup();
    await this.loadHandle();
    if (this.isAuditorTarget()) await this.loadMessagesAccess();
    // Eager-load so the tab can decide its own visibility (server returns only the
    // functions applicable to this user's role — empty ⇒ tab hidden).
    await this.loadSystemFunctionsConfig();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => {
      if (!this._isBusy) this.getUserDetails(true);
    });
  }

  async loadApprovalRole() {
    try {
      const res = await this.apiService.vaultUserApprovalRoleGet(this.userId());
      this.approvalRole.set((res?.approvalRole as any) || 'none');
    } catch { this.approvalRole.set('none'); }
  }

  // ── User Group membership ───────────────────────────────────────────────────
  async loadUserGroup() {
    try {
      const res = await this.apiService.vaultUserGroupMembershipGet(this.userId());
      this.userGroup.set(res.group);
      this.groupRoleMatch.set(res.roleMatch);
    } catch {
      this.userGroup.set(null);
      this.groupRoleMatch.set(true);
    }
  }

  async openChangeGroupModal() {
    const u = this.user();
    if (!u || this.groupSaving()) return;
    const picked = await this.userGroupService.show(this.userGroup()?.groupId ?? '', Number(u.role));
    if (picked === null || picked === (this.userGroup()?.groupId ?? '')) return;

    this.groupSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.group.updating'));
    try {
      const res = picked === ''
        ? await this.apiService.vaultUserGroupMembershipClear(u.userId)
        : await this.apiService.vaultUserGroupMembershipSet(u.userId, picked);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      await this.loadUserGroup();
      // The group layer shifts the effective values on both config tabs.
      this.menuLoaded = false;
      await this.loadSystemFunctionsConfig();
      if (this.activeTab() === 'menu') await this.loadMenuConfig();
    } finally {
      this.groupSaving.set(false);
      this.loadingService.hide();
    }
  }

  async clearGroup() {
    const u = this.user();
    if (!u || !this.userGroup() || this.groupSaving()) return;
    const ok = await this.alertService.show(
      this.translate.instant('users.details.group.clearTitle'),
      this.translate.instant('users.details.group.clearMsg', { name: this.userGroup()?.name }),
      this.translate.instant('common.clear'),
    );
    if (!ok) return;
    this.groupSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.group.updating'));
    try {
      const res = await this.apiService.vaultUserGroupMembershipClear(u.userId);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      await this.loadUserGroup();
      this.menuLoaded = false;
      await this.loadSystemFunctionsConfig();
      if (this.activeTab() === 'menu') await this.loadMenuConfig();
    } finally {
      this.groupSaving.set(false);
      this.loadingService.hide();
    }
  }

  /** Reset a per-user override row back to inherit (group setting, else role default). */
  async resetMenuOverride(row: UserMenuRow) {
    if (this.menuSaving()) return;
    this.menuSaving.set(row.menuKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserMenuConfigClear(this.userId(), row.menuKey);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.loadMenuConfig();
    } finally {
      this.loadingService.hide();
      this.menuSaving.set(null);
    }
  }

  async resetSystemFunctionOverride(row: UserSystemFunctionRow) {
    if (this.sysFnSaving()) return;
    this.sysFnSaving.set(row.functionKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserSystemFunctionConfigClear(this.userId(), row.functionKey);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.loadSystemFunctionsConfig();
    } finally {
      this.loadingService.hide();
      this.sysFnSaving.set(null);
    }
  }

  // ── Connect handle (the "alice" in alice@entityX — admin-assigned) ─────────
  handle       = signal<string | null>(null);
  handleFull   = signal<string | null>(null);
  handleInput  = signal('');
  handleSaving = signal(false);

  async loadHandle() {
    try {
      const res = await this.apiService.vaultUserHandleGet(this.userId());
      this.handle.set(res?.handle || null);
      this.handleFull.set(res?.fullAddress || null);
      this.handleInput.set(res?.handle || '');
    } catch {
      this.handle.set(null);
      this.handleFull.set(null);
    }
  }

  async saveHandle() {
    const h = this.handleInput().trim().toLowerCase();
    if (!h || this.handleSaving()) return;
    if (!/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(h)) {
      this.alertService.info(this.translate.instant('users.details.handle.invalidTitle'), this.translate.instant('users.details.handle.invalidMsg'));
      return;
    }
    this.handleSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.handle.saving'));
    try {
      const res = await this.apiService.vaultUserHandleSet(this.userId(), h);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.loadHandle();
    } finally {
      this.loadingService.hide();
      this.handleSaving.set(false);
    }
  }

  async clearHandle() {
    if (this.handleSaving() || !this.handle()) return;
    const ok = await this.alertService.show(
      this.translate.instant('users.details.handle.clearTitle'),
      this.translate.instant('users.details.handle.clearMsg', { handle: this.handle() }),
      this.translate.instant('common.clear'),
    );
    if (!ok) return;
    this.handleSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.handle.clearing'));
    try {
      const res = await this.apiService.vaultUserHandleClear(this.userId());
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.loadHandle();
    } finally {
      this.loadingService.hide();
      this.handleSaving.set(false);
    }
  }

  isExecutive(role: number | string | undefined): boolean {
    return Number(role) === 2;
  }

  async openChangeApprovalRoleModal() {
    const u = this.user();
    if (!u) return;
    if (!this.isExecutive(u.role)) {
      this.alertService.info(this.translate.instant('users.details.approvalRole.cannotAssignTitle'), this.translate.instant('users.details.approvalRole.cannotAssignMsg'));
      return;
    }

    const newRole = await this.userApprovalRoleService.show(this.approvalRole());
    if (newRole === null || newRole === this.approvalRole()) return;

    this.approvalRoleSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.approvalRole.updating'));
    try {
      const res = await this.apiService.vaultUserApprovalRoleSet(u.userId, newRole);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      this.approvalRole.set(newRole);
    } finally {
      this.approvalRoleSaving.set(false);
      this.loadingService.hide();
    }
  }

  approvalRoleLabel(role: ApprovalRoleValue): string {
    switch (role) {
      case 'maker':   return this.translate.instant('users.details.approvalRole.maker');
      case 'checker': return this.translate.instant('users.details.approvalRole.checker');
      default:        return this.translate.instant('common.none');
    }
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  async getUserDetails(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const data = await this.apiService.vaultGetUser(String(this.userId()));
      if (data) this.user.set({
        ...data,
        stateName: this.stateKeys[data.state] ? this.translate.instant(this.stateKeys[data.state]) : String(data.state ?? ''),
        roleName:  this.roleKeys[data.role]   ? this.translate.instant(this.roleKeys[data.role])   : String(data.role  ?? ''),
      });
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800'; // Initiated
      case 2: return 'bg-green-100 text-green-800';   // Active
      case 3: return 'bg-orange-100 text-orange-800'; // Suspended
      case 4: return 'bg-red-100 text-red-800';       // Deactivated
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  

  async openEditModal() {
    const currentUser = this.user();
    if (!currentUser) return;

    const result = await this.userEditService.show(currentUser);
    if (!result) return;

    this._isBusy = true;
    try {
      this.loadingService.show(this.translate.instant('users.details.updatingUser'));
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
        name: result.name,
        email: result.email,
        username: currentUser.username,
        did: result.did,
      });
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.info(this.translate.instant('users.details.updateFailedTitle'), this.translate.instant('users.details.updateFailedMsg'));
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
    }
  }

  async openChangeStateModal() {
    const currentUser = this.user();
    if (!currentUser) return;

    const newState = await this.userStateService.show(currentUser.state);
    if (newState === null || newState === currentUser.state) return;

    this._isBusy = true;
    try {
      this.loadingService.show(this.translate.instant('users.details.changingState'));
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateUserState(String(currentUser.userId), newState);
    } catch (error) {
      console.error('Failed to change state', error);
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
    }
  }

  async openChangeRoleModal() {
    const currentUser = this.user();
    if (!currentUser) return;

    const newRole = await this.userRoleService.show(currentUser.role);
    if (newRole === null || newRole === currentUser.role) return;

    this._isBusy = true;
    try {
      this.loadingService.show(this.translate.instant('users.details.changingRole'));
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateUserRole(String(currentUser.userId), newRole);
    } catch (error) {
      console.error('Failed to change role', error);
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
      await this.loadApprovalRole();
      // Role change can leave the assigned group inert (role mismatch) and changes
      // which system functions apply — refresh both.
      await this.loadUserGroup();
      this.menuLoaded = false;
      await this.loadSystemFunctionsConfig();
    }
  }

  async openCredentialsModal() {
    const currentUser = this.user();
    if (!currentUser) return;

    const result = await this.userCredentialsService.show(currentUser);
    if (!result) return;

    this._isBusy = true;
    try {
      this.loadingService.show(this.translate.instant('users.details.updatingCredentials'));
      await new Promise(resolve => setTimeout(resolve, 0));

      // 18.5 — HASHES ONLY: the new password becomes { loginHash, commitment, salt } HERE (Argon2id
      // over a fresh per-user salt + the in-circuit stretch); the API rejects a `password` field.
      if (result.username === null) {
        // password-only change — the commitment is bound to the target's CURRENT username
        const credential = await this.ethersService.deriveCredential(currentUser.username, result.password);
        if (!credential) throw new Error('Failed to derive the login credential');
        const pwResult = await this.apiService.vaultUpdateUserPassword(String(currentUser.userId), { commitment: credential.commitment, salt: credential.salt });
        if (!pwResult) throw new Error('Failed to update password');
      } else {
        // full credentials change (username + password)
        const credential = await this.ethersService.deriveCredential(result.username, result.password);
        if (!credential) throw new Error('Failed to derive the login credential');
        const credResult = await this.apiService.vaultUpdateUserCredentials(String(currentUser.userId), {
          username: result.username,
          ...credential,
        });
        if (!credResult) throw new Error('Failed to update credentials');

        this.loadingService.show(this.translate.instant('users.details.updatingUserData'));
        await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
          name: currentUser.name,
          email: currentUser.email,
          username: result.username,
          did: currentUser.did,
        });
      }
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.info(this.translate.instant('users.details.updateFailedTitle'), this.translate.instant('users.details.updateFailedCredentialsMsg'));
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
    }
  }
}
