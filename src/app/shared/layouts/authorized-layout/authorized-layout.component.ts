import { Component } from '@angular/core';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonHeader, IonToolbar,
  IonContent, IonList, IonItem, IonIcon, IonLabel,
  IonButtons, IonMenuButton, MenuController, IonAccordionGroup, IonAccordion, IonFooter } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { addIcons } from 'ionicons';
import { homeOutline, logOutOutline, peopleOutline, layersOutline, searchOutline, cogOutline, personCircleOutline, globeOutline, idCardOutline, fingerPrintOutline, bookOutline, snowOutline } from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { RpcService } from '../../services/rpc.service';
import { Regulator } from '../../models/data.model';
import { AlertComponent } from '../../components/alerts/alert/alert.component';
import { LoadingComponent } from "../../components/alerts/loading/loading.component";
import { ModalcKYCOperatorEditComponent } from '../../components/modals/modal-ckyc-operator-edit/modal-ckyc-operator-edit.component';
import { ModalValidatorAddComponent } from '../../../pages/secure/ckyc/validators/modals/modal-validator-add/modal-validator-add.component';
import { ModalValidatorEditComponent } from '../../../pages/secure/ckyc/validators/modals/modal-validator-edit/modal-validator-edit.component';
import { ModalValidatorStateComponent } from "../../../pages/secure/ckyc/validators/modals/modal-validator-state/modal-validator-state.component";
import { ModalcKYCServiceAddComponent } from '../../../pages/secure/ckyc/services/modals/modal-ckyc-service-add/modal-ckyc-service-add.component';
import { ModalServiceStateComponent } from "../../../pages/secure/ckyc/services/modals/modal-service-state/modal-service-state.component";
import { ModalServiceEditComponent } from "src/app/pages/secure/ckyc/services/modals/modal-service-edit/modal-service-edit.component";

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
    ModalValidatorAddComponent,
    ModalValidatorEditComponent,
    ModalValidatorStateComponent,
    ModalcKYCServiceAddComponent, 
    ModalServiceStateComponent, 
    ModalServiceEditComponent
  ],
})
export class AuthorizedLayoutComponent {

  regulatorInfo!: Regulator;

  constructor(
    private authService: AuthService,
    private menuController: MenuController,
    private rpcService: RpcService,
    
  ) {
    addIcons({homeOutline,peopleOutline,fingerPrintOutline,snowOutline,globeOutline,layersOutline,personCircleOutline,idCardOutline,cogOutline,searchOutline,bookOutline,logOutOutline});
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