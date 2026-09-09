import { Component, Input, OnChanges, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UnreadMessagesService } from '../../services/unread-messages.service';
import { PageTitleService } from '../../services/page-title.service';
import { AlertService } from '../alerts/alert/alert.service';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/*
    Page header — now a REPORTER for the title, plus the entity-restricted banner.

    History: this was the app's top bar (toolbar + title + Welcome/messages/
    language/profile/logout). With the v4 shell the bar moved to
    AuthorizedLayoutComponent so it could span the window; then the title moved
    there too, so it sits beside the logo instead of in a strip on every page.

    ⚠️ ALL 59 PAGES STILL WRITE <app-header [title]="…"> AND MUST KEEP DOING SO.
    The tag is how the bar learns the page's title — deleting it from a page
    leaves that page's title blank in the bar. Only what this component RENDERS
    changed, which is why moving the bar cost no page edits.

    What still renders here: the entity-restricted banner, and nothing else.
*/
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [CommonModule, TranslatePipe],
})
export class HeaderComponent implements OnInit, OnChanges {
  @Input() title!: string;

  private authService = inject(AuthService);
  private unreadMessages = inject(UnreadMessagesService);
  private pageTitle = inject(PageTitleService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  get entityActive() {
    return this.authService.entityActive();
  }

  get entityStateName() {
    return this.authService.entityInfo?.stateName ?? '';
  }

  get entityStateReason() {
    return this.authService.entityStateReason();
  }

  ngOnChanges(): void {
    this.publishTitle();
  }

  ngOnInit() {
    // Covers a page whose [title] is a static string: Angular fires ngOnChanges
    // for bound inputs, but a page binding a constant still needs the first push.
    this.publishTitle();

    /*
        🔴 KEPT DELIBERATELY even though the unread badge now lives in the top bar.
        This component renders once per page, so it is what keeps the shared count
        fresh as the user navigates; the layout's own refresh runs on
        ionViewWillEnter, which does NOT fire on in-app navigation. Drop this and
        the top-bar badge goes stale until a full re-entry.

        Safe from 59 templates: the service debounces and de-duplicates, so N
        retained headers asking at once produce exactly one request. Do NOT give
        this component its own vaultUpdated$ subscription or its own
        connectInboxInfo() call — that is the 2026-09-08 regression.
    */
    this.unreadMessages.refresh();
  }

  private publishTitle(): void {
    this.pageTitle.register(this.router.url, this.title || this.translate.instant('header.title'));
  }

  showReasonAlert() {
    this.alertService.info(
      this.translate.instant('header.stateReasonAlert.title'),
      this.entityStateReason || this.translate.instant('header.stateReasonAlert.noReason'),
      this.translate.instant('alerts.ok'),
      'max-w-3xl'
    );
  }
}
