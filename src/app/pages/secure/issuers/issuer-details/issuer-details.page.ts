import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

@Component({
  selector: 'app-issuer-details',
  templateUrl: './issuer-details.page.html',
  styleUrls: ['./issuer-details.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class IssuerDetailsPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
