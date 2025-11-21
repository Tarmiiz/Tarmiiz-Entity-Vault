import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent 
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

@Component({
  selector: 'app-users',
  templateUrl: './users.page.html',
  styleUrls: ['./users.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent
  ]
})
export class UsersPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
