import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../shared/components/live-indicator/live-indicator.component";

import { ApiService } from '../../../../shared/services/api.service';
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
import { systemFunctionLabelFor } from '../../../../shared/constants/system-function-labels';

interface UserMenuRow {
  menuKey: string;
  tenantEnabled: boolean;
  userEnabled: boolean | null;  // null ⇒ inherit (group setting, else role default)
  groupEnabled: boolean | null; // null ⇒ no group row / group inert
  effective: boolean;
}

interface UserSystemFunctionRow {
  functionKey: string;
  defaultEnabled: boolean;
  userEnabled: boolean | null;  // null ⇒ inherit (group setting, else role default)
  groupEnabled: boolean | null; // null ⇒ no group row / group inert
  effective: boolean;
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
    ModalUserGroupComponent, TranslatePipe,
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
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
  activeTab   = signal<'details' | 'menu' | 'system-functions'>('details');
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

  constructor() { }

  labelFor(key: string): string { return this.translate.instant(menuLabelFor(key)); }
  fnLabelFor(key: string): string { return this.translate.instant(systemFunctionLabelFor(key)); }

  /** Per-user Menu Access applies only to non-admin targets (admins bypass menu gating). */
  showMenuTab(): boolean {
    const role = Number(this.user()?.role);
    return role === 2 || role === 3;
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
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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

  setTab(tab: 'details' | 'menu' | 'system-functions') {
    this.activeTab.set(tab);
    if (tab === 'menu' && !this.menuLoaded) this.loadMenuConfig();
  }

  /** Content-driven: the tab shows only when a function applies to this user's role. */
  showSystemFunctionsTab(): boolean {
    return this.sysFnRows().length > 0;
  }

  async loadSystemFunctionsConfig() {
    this.sysFnLoading.set(true);
    try {
      const rows = await this.apiService.vaultUserSystemFunctionConfigList(this.userId());
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
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
        // tenant-enabled + mode-allowed keys are actionable here. The rest are hidden
        // for everyone regardless.
        .filter(r => r.tenantEnabled && this.features.modeAllows(r.menuKey));
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
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      this.alertService.show(this.translate.instant('users.details.handle.invalidTitle'), this.translate.instant('users.details.handle.invalidMsg'));
      return;
    }
    this.handleSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.handle.saving'));
    try {
      const res = await this.apiService.vaultUserHandleSet(this.userId(), h);
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      this.alertService.show(this.translate.instant('users.details.approvalRole.cannotAssignTitle'), this.translate.instant('users.details.approvalRole.cannotAssignMsg'));
      return;
    }

    const newRole = await this.userApprovalRoleService.show(this.approvalRole());
    if (newRole === null || newRole === this.approvalRole()) return;

    this.approvalRoleSaving.set(true);
    this.loadingService.show(this.translate.instant('users.details.approvalRole.updating'));
    try {
      const res = await this.apiService.vaultUserApprovalRoleSet(u.userId, newRole);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
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
      this.alertService.show(this.translate.instant('users.details.updateFailedTitle'), this.translate.instant('users.details.updateFailedMsg'));
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

      if (result.username === null) {
        // password-only change
        const pwResult = await this.apiService.vaultUpdateUserPassword(String(currentUser.userId), currentUser.username, result.password);
        if (!pwResult) throw new Error('Failed to update password');
      } else {
        // full credentials change (username + password)
        const credResult = await this.apiService.vaultUpdateUserCredentials(String(currentUser.userId), {
          username: result.username,
          password: result.password,
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
      this.alertService.show(this.translate.instant('users.details.updateFailedTitle'), this.translate.instant('users.details.updateFailedCredentialsMsg'));
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
    }
  }
}
