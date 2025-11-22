import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { 
  IonContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { LoadingService } from '../../../../../shared/services/loading.service';
import { CkycOperatorEditService } from '../../../../../shared/services/ckyc-operator-edit.service';

import { cKYCOperator } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-ckyc-operator-details',
  templateUrl: './ckyc-operator-details.page.html',
  styleUrls: ['./ckyc-operator-details.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
  ]
})
export class CkycOperatorDetailsPage implements OnInit {

  operator = signal<cKYCOperator | undefined>(undefined);
  address = '';

  constructor(
    private route: ActivatedRoute,
    private rpcService: RpcService,
    private alertService: AlertService,
    private loadingService: LoadingService,
    private ckycOperatorEditService: CkycOperatorEditService

  ) { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.address = address;
    }    
  }

  async ngOnInit() {
    this.getOperatorDetails(this.address);
  }

  async getOperatorDetails(address: string) {
    const data = await this.rpcService.cKYCOperatorInfo(address);
    this.operator.set(data.result?.operator);
  }

  async changeState() {
    const currentOperator = this.operator();
    if (currentOperator) {
      const confirmed = await this.alertService.show(
        'Confirm State Change',
        `Are you sure you want to change the state for ${currentOperator.name}?`,
        `${currentOperator.state ? 'Deactivate' : 'Activate'}`
      );

      if (confirmed) {
        this.loadingService.show('Changing state...');
        const operatorAddress = this.operator()?.operator;
        const state = !this.operator()?.state;
        await this.rpcService.cKYCOperatorChangeState(operatorAddress!, state);
        await this.getOperatorDetails(this.address);
        this.loadingService.hide();
      }
    }
  }  

  async openEditModal() {
    const currentOperator = this.operator();
    if (!currentOperator) return;

    const result = await this.ckycOperatorEditService.show(currentOperator);
    
    if (result) {
      this.loadingService.show('Updating operator...');
      try {
        const updatePromises: Promise<any>[] = [];

        if (result.name !== currentOperator.name) {
          console.log('update name', result.name, currentOperator.name);
          // updatePromises.push(this.rpcService.updateOperatorName(currentOperator.symbol, result.name!));
        }
        
        const dataChanged = result.email !== currentOperator.email || result.mobile !== currentOperator.mobile;
        if (dataChanged) {
          // updatePromises.push(this.rpcService.updateOperatorData(currentOperator.symbol, { email: result.email!, mobile: result.mobile! }));
        }

        // Symbol update must be last as it might change the identifier
        if (result.symbol !== currentOperator.symbol) {
          // updatePromises.push(this.rpcService.updateOperatorSymbol(currentOperator.symbol, result.symbol!));
        }
        
        // await Promise.all(updatePromises);

        // // If symbol was changed, we need to navigate to the new URL and refresh
        // if (result.symbol !== currentOperator.symbol) {
        //    this.router.navigate(['/operator', result.symbol]).then(() => {
        //      this.getOperatorDetails(result.symbol!);
        //    });
        // } else {
        //    await this.getOperatorDetails(currentOperator.symbol);
        // }

      } catch (error) {
        console.error('Failed to update operator', error);
        this.alertService.show('Update Failed', 'There was an error updating the operator details.');
      } finally {
        this.loadingService.hide();
      }
    }
  }

}
