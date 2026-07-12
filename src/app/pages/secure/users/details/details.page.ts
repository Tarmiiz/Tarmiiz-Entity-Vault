import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../shared/components/live-indicator/live-indicator.component";

import { ApiService } from '../../../../shared/services/api.service';
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
import { SocketService } from '../../../../shared/services/socket.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { menuLabelFor } from '../../../../shared/constants/menu-labels';
import { systemFunctionLabelFor } from '../../../../shared/constants/system-function-labels';

interface UserMenuRow {
  menuKey: string;
  tenantEnabled: boolean;
  userEnabled: boolean | null; // null ⇒ inherit
  effective: boolean;
}

interface UserSystemFunctionRow {
  functionKey: string;
  defaultEnabled: boolean;
  userEnabled: boolean | null; // null ⇒ inherit
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
    ModalUserApprovalRoleComponent, TranslatePipe,
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private userEditService = inject(ModalUserEditService);
  private userStateService = inject(ModalUserStateService);
  private userCredentialsService = inject(ModalUserCredentialsService);
  private userRoleService = inject(ModalUserRoleService);
  private userApprovalRoleService = inject(ModalUserApprovalRoleService);
  private socketService = inject(SocketService);
  private features = inject(FeaturesService);

  private _socketSub: Subscription | null = null;
  private _isBusy = false;

  private readonly stateNames: Record<number, string> = {
    1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated'
  };
  private readonly roleNames: Record<number, string> = {
    1: 'Admin', 2: 'Executive', 3: 'Viewer', 4: 'Security'
  };

  loadingData: boolean = false;
  refreshing = signal(false);

  userId = signal<number>(0);
  user = signal<User | undefined>(undefined);

  approvalRole       = signal<'none' | 'maker' | 'checker'>('none');
  approvalRoleSaving = signal(false);

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

  constructor() { }

  labelFor(key: string): string { return menuLabelFor(key); }
  fnLabelFor(key: string): string { return systemFunctionLabelFor(key); }

  /** Per-user Menu Access applies only to non-admin targets (admins bypass menu gating). */
  showMenuTab(): boolean {
    const role = Number(this.user()?.role);
    return role === 2 || role === 3;
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
    const verb = enabled ? 'available to this user' : 'hidden from this user and blocked';
    const ok = await this.alertService.show(
      'Confirm per-user function change',
      `${this.fnLabelFor(row.functionKey)} will be ${verb}. It takes effect on the user's next login. Continue?`,
      'Save',
    );
    if (!ok) return;
    this.sysFnSaving.set(row.functionKey);
    this.loadingService.show('Saving...');
    try {
      const res = await this.apiService.vaultUserSystemFunctionConfigSet(u.userId, row.functionKey, enabled);
      if (res?.error) {
        this.alertService.show('Error', res.error);
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
    const verb = enabled ? 'shown in this user\'s menu' : 'hidden from this user\'s menu and blocked';
    const ok = await this.alertService.show(
      'Confirm per-user menu change',
      `${this.labelFor(row.menuKey)} will be ${verb}. It takes effect on the user's next login. Continue?`,
      'Save',
    );
    if (!ok) return;
    this.menuSaving.set(row.menuKey);
    this.loadingService.show('Saving...');
    try {
      const res = await this.apiService.vaultUserMenuConfigSet(u.userId, row.menuKey, enabled);
      if (res?.error) {
        this.alertService.show('Error', res.error);
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
    await this.getUserDetails();
    await this.loadApprovalRole();
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

  isExecutive(role: number | string | undefined): boolean {
    return Number(role) === 2;
  }

  async openChangeApprovalRoleModal() {
    const u = this.user();
    if (!u) return;
    if (!this.isExecutive(u.role)) {
      this.alertService.show('Cannot assign role', 'Only executive (role=2) users can be configured as maker or checker. Change the user role to Executive first.');
      return;
    }

    const newRole = await this.userApprovalRoleService.show(this.approvalRole());
    if (newRole === null || newRole === this.approvalRole()) return;

    this.approvalRoleSaving.set(true);
    this.loadingService.show('Updating approval role...');
    try {
      const res = await this.apiService.vaultUserApprovalRoleSet(u.userId, newRole);
      if (res?.error) {
        this.alertService.show('Error', res.error);
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
      case 'maker':   return 'Maker';
      case 'checker': return 'Checker';
      default:        return 'None';
    }
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  async getUserDetails(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show('Loading data...');
    try {
      const data = await this.apiService.vaultGetUser(String(this.userId()));
      if (data) this.user.set({
        ...data,
        stateName: this.stateNames[data.state] ?? String(data.state ?? ''),
        roleName:  this.roleNames[data.role]   ?? String(data.role  ?? ''),
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
      this.loadingService.show('Updating user...');
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
        name: result.name,
        email: result.email,
        username: currentUser.username,
        did: result.did,
      });
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.show('Update Failed', 'There was an error updating the user details.');
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
      this.loadingService.show('Changing state...');
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
      this.loadingService.show('Changing role...');
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateUserRole(String(currentUser.userId), newRole);
    } catch (error) {
      console.error('Failed to change role', error);
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
      await this.loadApprovalRole();
    }
  }

  async openCredentialsModal() {
    const currentUser = this.user();
    if (!currentUser) return;

    const result = await this.userCredentialsService.show(currentUser);
    if (!result) return;

    this._isBusy = true;
    try {
      this.loadingService.show('Updating user credentials...');
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

        this.loadingService.show('Updating user data...');
        await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
          name: currentUser.name,
          email: currentUser.email,
          username: result.username,
          did: currentUser.did,
        });
      }
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.show('Update Failed', 'There was an error updating the user credentials.');
    } finally {
      this._isBusy = false;
      this.loadingService.hide();
      await this.getUserDetails();
    }
  }
}
