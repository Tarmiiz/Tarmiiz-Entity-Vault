import { Component, Input, OnInit } from '@angular/core';
import { 
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton
  ]
})
export class HeaderComponent  implements OnInit {
  @Input() title!: string;

  constructor() {}

  ngOnInit() {}


}
