import { Component, OnInit, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AuthService } from '../../../../shared/services/auth.service';

import { User } from '../../../../shared/models/data.model';

import { ModalUserAddComponent } from "../modals/modal-user-add/modal-user-add.component";
import { ModalUserAddService } from '../modals/modal-user-add/modal-user-add.service';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    HeaderComponent,
    ModalUserAddComponent, TranslatePipe,
    PaginatorComponent,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private userAddService = inject(ModalUserAddService);
  private translate = inject(TranslateService);

  userInfo!: User;
  loadingData: boolean = false;

  usersCount = 0
  users = signal<User[]>([]);

  filterSearch = signal('');
  filterRole  = signal<string>('');
  filterState = signal<string>('');

  private readonly stateKeys: Record<number, string> = {
    1: 'state.initiated', 2: 'state.active', 3: 'state.suspended', 4: 'state.deactivated'
  };
  private readonly roleKeys: Record<number, string> = {
    1: 'role.admin', 2: 'users.roles.executive', 3: 'role.viewer', 4: 'users.roles.security'
  };

  constructor() {}

  ngOnInit() {}


  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.users.set([]);
    this.usersCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listUsers();
    this.loadingData = false;
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

  async listUsers() {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    const result = await this.apiService.vaultGetUsers(0, 100);
    if (result) {
      this.usersCount = result.count;
      this.users.set(result.users.map((u: any) => ({
        ...u,
        stateName: this.stateKeys[u.state] ? this.translate.instant(this.stateKeys[u.state]) : String(u.state ?? ''),
        roleName:  this.roleKeys[u.role]   ? this.translate.instant(this.roleKeys[u.role])   : String(u.role  ?? ''),
      })));
    }
    this.loadingService.hide();
  }

  viewDetails(user: User) {
    this.router.navigate(['/authorized/users/details/' + user.userId]);  
  }

  /** 1-based, per frontend Standard 1.5. */
  usersPage = signal(1);
  usersPageSize = signal(25);
  pagedUsers = computed(() => pageSlice(this.filteredUsers(), this.usersPage(), this.usersPageSize()));
  filteredUsers = computed(() => {
    const term  = this.filterSearch().toLowerCase();
    const role  = this.filterRole();
    const state = this.filterState();
    return this.users().filter(u => {
      if (role  && String(u.role)  !== role)  return false;
      if (state && String(u.state) !== state) return false;
      if (term  && !u.name.toLowerCase().includes(term) &&
                   !u.username.toLowerCase().includes(term) &&
                   !(u.email?.toLowerCase().includes(term)) &&
                   !(u.stateName?.toLowerCase().includes(term)) &&
                   !(u.roleName?.toLowerCase().includes(term))) return false;
      return true;
    });
  });

  clearFilters() {
    this.filterSearch.set('');
    this.filterRole.set('');
    this.filterState.set('');
    this.usersPage.set(1);
  }

  async openAddModal() {
    const result = await this.userAddService.show();
    if (result) {
      this.loadingService.show(this.translate.instant('users.list.addingUser'));
      try {
        const createRes = await this.apiService.vaultCreateUser({
          name: result.name,
          email: result.email,
          username: result.username,
          password: result.password,
          role: Number(result.role),
        });
        // Surface a create failure (e.g. the entity is not active — user creation is
        // blocked server-side by the entityActive gate) instead of silently no-op'ing.
        if (createRes?.error) {
          this.alertService.show(this.translate.instant('users.addModal.errorTitle'), createRes.error);
          return;
        }
        await this.listUsers();
        const created = this.users().find(u => u.username === result.username);
        if (created && Number(result.role) === 2 && result.approvalRole && result.approvalRole !== 'none') {
          try {
            await this.apiService.vaultUserApprovalRoleSet(created.userId, result.approvalRole);
            await this.listUsers();
          } catch (e) {
            console.error('Failed to set approval role', e);
          }
        }
        // Assign the picked User Group (same post-create follow-up pattern as approval role).
        if (created && result.groupId) {
          try {
            const res = await this.apiService.vaultUserGroupMembershipSet(created.userId, result.groupId);
            if (res?.error) console.error('Failed to assign user group', res.error);
          } catch (e) {
            console.error('Failed to assign user group', e);
          }
        }
        // Grant a Security officer (role 4) read-only Messages access (default is
        // OFF — only write an override when the admin ticked the toggle).
        if (created && Number(result.role) === 4 && result.messagesEnabled === true) {
          try {
            await this.apiService.vaultUserMenuConfigSet(created.userId, 'messages', true);
          } catch (e) {
            console.error('Failed to grant messages access', e);
          }
        }
        // Default the Connect handle to (a sanitized form of) the username so the
        // user can receive direct messages immediately. Best-effort / non-fatal —
        // a collision or invalid value just leaves the handle unset for the admin
        // to set manually on the User Details page.
        if (created && result.handle) {
          try {
            await this.apiService.vaultUserHandleSet(created.userId, result.handle);
          } catch (e) {
            console.error('Failed to set default handle', e);
            this.alertService.show(
              this.translate.instant('users.list.handleDefaultFailedTitle'),
              this.translate.instant('users.list.handleDefaultFailedMessage'),
            );
          }
        }
        this.loadingService.hide();
      } catch (error) {
        console.error('Failed to add new user', error);
      } finally {
        this.loadingService.hide();
      }
    }
  }

}
