import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../shared/components/header/header.component";
import { RpcService } from '../../../shared/services/rpc.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})

export class ProfilePage implements OnInit {

  constructor(
    private rpcService: RpcService,
  ) { }

  async ngOnInit() {
    const info = await this.rpcService.info();
    console.log('info', info);
  }

}
