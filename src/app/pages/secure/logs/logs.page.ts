import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { LogEvent } from '../../../shared/models/data.model';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.page.html',
  styleUrls: ['./logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
  ]
})
export class LogsPage {

  loginEvents: LogEvent[] = [];

}
