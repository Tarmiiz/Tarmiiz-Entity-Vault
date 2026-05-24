import { Component, OnInit, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AuthService } from '../../../../shared/services/auth.service';

import { User } from '../../../../shared/models/data.model';

import { ModalUserAddComponent } from "../modals/modal-user-add/modal-user-add.component";
import { ModalUserAddService } from '../modals/modal-user-add/modal-user-add.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    HeaderComponent,
    ModalUserAddComponent, TranslatePipe
]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private authService = inject(AuthService);
  private userAddService = inject(ModalUserAddService);

  userInfo!: User;
  loadingData: boolean = false;

  usersCount = 0
  users = signal<User[]>([]);

  filterSearch = signal('');
  filterRole  = signal<string>('');
  filterState = signal<string>('');

  private readonly stateNames: Record<number, string> = {
    1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated'
  };
  private readonly roleNames: Record<number, string> = {
    1: 'Admin', 2: 'Executive', 3: 'Viewer'
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
    this.loadingService.show('Loading data...');
    const result = await this.apiService.vaultGetUsers(0, 100);
    if (result) {
      this.usersCount = result.count;
      this.users.set(result.users.map((u: any) => ({
        ...u,
        stateName: this.stateNames[u.state] ?? String(u.state ?? ''),
        roleName:  this.roleNames[u.role]   ?? String(u.role  ?? ''),
      })));
    }
    this.loadingService.hide();
  }  

  viewDetails(user: User) {
    this.router.navigate(['/authorized/users/details/' + user.userId]);  
  }

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
  }

  async openAddModal() {
    const result = await this.userAddService.show();
    if (result) {
      this.loadingService.show('Adding new user...');
      try {
        await this.apiService.vaultCreateUser({
          name: result.name,
          email: result.email,
          username: result.username,
          password: result.password,
          role: Number(result.role),
          did: result.did,
        });
        await this.listUsers();
        if (Number(result.role) === 2 && result.approvalRole && result.approvalRole !== 'none') {
          const created = this.users().find(u => u.username === result.username);
          if (created) {
            try {
              await this.apiService.vaultUserApprovalRoleSet(created.userId, result.approvalRole);
              await this.listUsers();
            } catch (e) {
              console.error('Failed to set approval role', e);
            }
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
