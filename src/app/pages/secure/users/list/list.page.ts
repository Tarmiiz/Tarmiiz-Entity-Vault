import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { User } from '../../../../shared/models/data.model';

import { ModalUserAddComponent } from "../modals/modal-user-add/modal-user-add.component";
import { ModalUserAddService } from '../modals/modal-user-add/modal-user-add.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalUserAddComponent
]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private userAddService = inject(ModalUserAddService);

  loadingData: boolean = false;

  usersCount = 0
  users = signal<User[]>([]);
  usersSearchTerm = signal('');

  constructor() {}

  ngOnInit() {}


  async ionViewWillEnter() {
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
    const result = await this.rpcService.usersList(1, 10);
    if(result.result) {
      this.usersCount = result.result.count;
      this.users.set(result.result.users);
      // console.log('users', this.users());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(user: User) {
    this.router.navigate(['/authorized/users/details/' + user.userId]);  
  }

  filteredUsers = computed(() => {
    const term = this.usersSearchTerm().toLowerCase();
    if (!term) return this.users();
    return this.users().filter(c => c.name.toLowerCase().includes(term) ||
      c.username.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) || 
      c.stateName.toLowerCase().includes(term) || 
      c.roleName.toLowerCase().includes(term)
    );
  });  

  onUsersSearch(event: Event) {
    this.usersSearchTerm.set((event.target as HTMLInputElement).value);
  }  

  async openAddModal() {
    const result = await this.userAddService.show();
    console.log('result', result);
    if (result) {
      this.loadingService.show('Adding new user...');
      try {
        const data = {
          name: result.name,
          email: result.email,
          username: result.username,
          did: result.did
        };
        await this.rpcService.userAdd(result.username, result.password, Number(result.role), JSON.stringify(data));
        await this.listUsers();
        this.loadingService.hide();
      } catch (error) {
        console.error('Failed to add new user', error);
      } finally {
        this.loadingService.hide();
      }
    }
  }

}
