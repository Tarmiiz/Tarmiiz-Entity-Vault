import { Component } from '@angular/core';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonHeader, IonToolbar,
  IonContent, IonList, IonItem, IonIcon, IonLabel,
  IonButtons, IonMenuButton, MenuController, IonAccordionGroup, IonAccordion, IonFooter } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { addIcons } from 'ionicons';
import { homeOutline, logOutOutline, peopleOutline, layersOutline, searchOutline, cogOutline, personCircleOutline, globeOutline, idCardOutline, fingerPrintOutline, bookOutline } from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { RpcService } from '../../services/rpc.service';
import { Regulator } from '../../models/data.model';
import { AlertComponent } from '../../components/alerts/alert/alert.component';
import { LoadingComponent } from "../../components/alerts/loading/loading.component";
import { ModalcKYCOperatorEditComponent } from '../../components/modals/modal-ckyc-operator-edit/modal-ckyc-operator-edit.component';
import { ModalcKYCValidatorAddComponent } from '../../components/modals/modal-ckyc-validator-add/modal-ckyc-validator-add.component';
import { ModalcKYCValidatorEditComponent } from '../../components/modals/modal-ckyc-validator-edit/modal-ckyc-validator-edit.component';
import { ModalCkycValidatorStateComponent } from "../../components/modals/modal-ckyc-validator-state/modal-ckyc-validator-state.component";

@Component({
  selector: 'app-authorized-layout',
  templateUrl: './authorized-layout.component.html',
  styleUrls: ['./authorized-layout.component.scss'],
  standalone: true,
  imports: [IonFooter, 
    IonAccordion, IonAccordionGroup,
    IonRouterOutlet,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonButtons,
    IonMenuButton,
    RouterModule,
    AlertComponent,
    LoadingComponent,
    ModalcKYCOperatorEditComponent,
    ModalcKYCValidatorAddComponent,
    ModalcKYCValidatorEditComponent,
    ModalCkycValidatorStateComponent
],
})
export class AuthorizedLayoutComponent {

  regulatorInfo!: Regulator;

  constructor(
    private authService: AuthService,
    private menuController: MenuController,
    private rpcService: RpcService,
    
  ) {
    addIcons({homeOutline,globeOutline,layersOutline,peopleOutline,personCircleOutline,idCardOutline,fingerPrintOutline,cogOutline,searchOutline,bookOutline,logOutOutline});
    if(this.rpcService.regulatorInfo) this.regulatorInfo = this.rpcService.regulatorInfo;
  }

  async closeMenuOnMobile() {
    const splitPane = document.querySelector('ion-split-pane');
    const isDesktop = splitPane?.classList.contains('split-pane-visible');
    
    if (!isDesktop) {
      await this.menuController.close();
    }
  }

  async logout() {
    await this.authService.logout();
    await this.rpcService.logout(); 
    await this.menuController.close();
  }
}