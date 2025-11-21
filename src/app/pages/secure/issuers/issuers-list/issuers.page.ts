import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

@Component({
  selector: 'app-issuers',
  templateUrl: './issuers.page.html',
  styleUrls: ['./issuers.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})

export class IssuersPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
