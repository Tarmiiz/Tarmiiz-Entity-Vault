import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonList, IonItem, IonLabel, IonInput, IonButton} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule, IonList, IonItem, IonLabel, IonInput, IonButton, RouterLink, TranslatePipe]
})
export class ForgotPasswordPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
