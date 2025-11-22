import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

@Component({
  selector: 'app-ckyc-operator-details',
  templateUrl: './ckyc-operator-details.page.html',
  styleUrls: ['./ckyc-operator-details.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class CkycOperatorDetailsPage implements OnInit {
  @Input() operator!: string | null;

  constructor() { }

  ngOnInit() {
    console.log('operator', this.operator);
  }

}
