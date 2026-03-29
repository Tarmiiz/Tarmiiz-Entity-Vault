import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

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
import { SocketService } from '../../../../shared/services/socket.service';


@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalUserEditComponent,
    ModalUserStateComponent,
    ModalUserEditCredentialsComponent
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
  private socketService = inject(SocketService);

  private _socketSub: Subscription | null = null;

  activeTab = signal<'info' | 'logs'>('info');

  loadingData: boolean = false;

  userId = signal<number>(0);
  user = signal<User | undefined>(undefined);

  constructor() { }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    const userId = this.route.snapshot.paramMap.get('id');
    if (userId) {
      this.userId.set(Number(userId));
    }
    await this.getUserDetails();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.getUserDetails());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  setTab(tab: 'info' | 'logs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getUserDetails();
  }   

  async getUserDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetUser(String(this.userId()));
    if (data) this.user.set(data);
    this.loadingService.hide();
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

    try {
      const result = await this.userEditService.show(currentUser);
      // console.log('result', result);
      if (result) {
        this.loadingService.show('Updating user...');
        await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
          name: result.name,
          email: result.email,
          username: this.user()!.username,
          did: result.did,
        });
        await this.getUserDetails();
      }
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.show('Update Failed', 'There was an error updating the user details.');
    } finally {
      this.loadingService.hide();
    }
  }

  async openChangeStateModal(){
    const currentUser = this.user();
    if (!currentUser) return;

    const newState = await this.userStateService.show(currentUser.state);
    if (newState !== null && newState !== currentUser.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.apiService.vaultUpdateUserState(String(currentUser.userId), newState);
            await this.getUserDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async openCredentialsModal() {
    const currentUser = this.user();
    if (!currentUser) return;


    try {
      const result = await this.userCredentialsService.show(currentUser);
      if (result) {
        
        // update credentials
        this.loadingService.show('Updating user credentials...');
        const data = {
          username: result.username,
          password: result.password
        };
        await this.apiService.vaultUpdateUserCredentials(String(currentUser.userId), {
          username: data.username,
          password: data.password,
        });

        // update data
        this.loadingService.show('Updating user data...');
        await this.apiService.vaultUpdateUserData(String(currentUser.userId), {
          name: currentUser.name,
          email: currentUser.email,
          username: data.username,
          did: currentUser.did,
        });

        this.loadingService.show('Reloading user info...');
        await this.getUserDetails();
      }
    } catch (error) {
      console.error('Failed to update user', error);
      this.alertService.show('Update Failed', 'There was an error updating the user details.');
    } finally {
      this.loadingService.hide();
    }
  }
}
