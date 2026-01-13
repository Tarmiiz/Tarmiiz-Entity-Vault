import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Operator } from '../../../../shared/models/data.model';

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
    private route = inject(ActivatedRoute);
    private rpcService = inject(RpcService);
    private alertService = inject(AlertService);
    private loadingService = inject(LoadingService);

  operator = signal<Operator | undefined>(undefined);
  address = '';

  constructor(

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
    const data = await this.rpcService.operatorInfo(address);
    this.operator.set(data.result?.operator);
  }


}
