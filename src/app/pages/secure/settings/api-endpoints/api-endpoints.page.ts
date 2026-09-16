import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { ApiEndpointItem } from '../../../../shared/models/data.model';
import { sectionLabelKey } from '../../../../shared/constants/api-endpoint-labels';
import { LicensePillComponent, LicenseStatus } from '../../../../shared/components/license-pill/license-pill.component';
import { TabsComponent, TabDef } from '../../../../shared/components/tabs/tabs.component';
import { SubTabRailComponent } from '../../../../shared/components/sub-tab-rail/sub-tab-rail.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';

/** The tenant's ONE integration VPN peer, as reconciled against the host by the API. */
interface IntegrationPeer {
  peerName: string;
  person: string;
  kind: 'user' | 'integration';
  cn: string;
  address: string;
  label: string | null;
  createdAt: number;
  notAfter: number | null;
  revokedAt: number | null;
  status: 'active' | 'stale' | 'revoked' | 'unknown';
}

/**
 * Settings → API Management (Phase 26.7; tabbed 2026-09-16).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO TABS, BECAUSE AN INTEGRATION NEEDS TWO DIFFERENT THINGS AND THEY WERE IN TWO PLACES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   Connectivity — HOW an external system reaches this tenant at all: its VPN peer (the only
 *                  route to the API, which is not on the public internet) and the bearer token
 *                  it presents once connected.
 *   Permissions  — WHAT it may drive once it is in: the per-endpoint switches (unchanged).
 *
 * Before this, the integration VPN peer had a working API and NO UI anywhere, and the access
 * token existed only in the host's `credentials.txt` — so the two halves of "stand up an
 * integration" lived in a file on a VM and a page that never mentioned them. An admin could see
 * which endpoints they had allowed while having no way to see, or issue, the credentials that
 * make those endpoints reachable.
 *
 * ⚠️ THE ROUTE PATH IS STILL `settings/api-endpoints` AND THE CLASS IS STILL `ApiEndpointsPage`.
 * Only the LABEL became "API Management". The rename is deliberate-ly cosmetic: the path is
 * bookmarked and appears in the sidebar template, and renaming identifiers to match a label buys
 * nothing while risking a dangling route. (It is safe on the other axis — `api-endpoints` is an
 * admin settings ROUTE, never a `MENU_ITEMS` key, so no stored menu override is orphaned by the
 * label change.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE GOVERNS, AND WHY THE COPY SAYS IT THAT WAY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ These switches control **what our EXTERNAL SYSTEMS may drive** — nothing else. A disabled
 * endpoint 403s NON-HUMAN principals only; a logged-in Vault user is never affected.
 *
 * That is not a softening of the feature, it is what makes it safe to hand an admin. Integration
 * routes serve BOTH populations: `GET /assets` backs the Vault's own assets page as well as a
 * partner's nightly sync. A switch that blocked everyone would let an admin brick a Vault page
 * from a settings toggle, with nothing in the UI able to explain why the page they were just
 * looking at went blank. So the title and description say "external systems", never "disable
 * endpoint" — the latter would be a promise this does not keep.
 *
 * ⚠️ THERE IS DELIBERATELY NO `FeaturesService` CHANGE AND NO `features/me` FIELD. Nothing in
 * this UI needs to hide, because the Vault is never blocked by these toggles. A `features` field
 * would imply a page → endpoint dependency map, which is exactly the hand-maintained coupling
 * that drifts the moment a page adds a call.
 */
@Component({
  selector: 'app-settings-api-endpoints',
  templateUrl: './api-endpoints.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent, LicensePillComponent,
    TabsComponent, SubTabRailComponent, LoadingStateComponent],
})
export class ApiEndpointsPage implements OnInit {
  private apiService     = inject(ApiService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private features       = inject(FeaturesService);

  sections = signal<{ section: string; items: ApiEndpointItem[]; license?: LicenseStatus | null }[]>([]);
  loading  = signal(false);
  saving   = signal<string | null>(null);   // endpoint key currently saving
  filter   = signal('');                    // free-text over label + raw key

  readonly sectionLabelKey = sectionLabelKey;

  // ── Tabs ────────────────────────────────────────────────────────────────────
  // Connectivity first: it is the thing an admin standing up an integration needs
  // before the permission switches mean anything — there is nothing to permit until
  // the system can reach the API.
  activeTab = signal<'connectivity' | 'permissions'>('connectivity');

  setTab(tab: 'connectivity' | 'permissions') {
    this.activeTab.set(tab);
    if (tab === 'permissions' && !this.sections().length) this.load();
  }

  readonly TABS: TabDef[] = [
    { key: 'connectivity', label: 'settings.apiManagement.tabs.connectivity' },
    { key: 'permissions',  label: 'settings.apiManagement.tabs.permissions' },
  ];

  // ── Connectivity rail (Standard 2.1) ────────────────────────────────────────
  // Two genuinely separate objects with their own actions — a bearer token you
  // reveal and rotate, and a VPN peer you grant and revoke — and each was a tall
  // card, so the tab was a scroll with the second object below the fold.
  //
  // ⚠️ TWO items is BELOW Standard 2.1's ≥3 threshold, and this is a deliberate
  // exception: the threshold exists to stop a rail being added over two short
  // sections, where it only adds a click. These two are full-height panels, so
  // the rail removes scrolling rather than adding a step. Do not read this as
  // licence to rail every two-section tab.
  //
  // The VPN item is CONDITIONAL on showVpn() — a tenant whose API is on a
  // network needing no peer has no VPN pane, and a rail item opening an empty
  // pane is worse than no item. With it hidden the rail is a single item, which
  // renders as one selected pill; that is honest (there IS one thing here) and
  // costs nothing.
  connectivityRail = computed<TabDef[]>(() => {
    const out: TabDef[] = [{ key: 'token', label: 'settings.apiManagement.token.title' }];
    if (this.showVpn()) out.push({ key: 'vpn', label: 'settings.apiManagement.vpn.title' });
    return out;
  });

  private _connRail = signal('token');

  /** Falls back to 'token' if the chosen pane (vpn) stops being available. */
  connRail = computed(() => {
    const rail = this.connectivityRail();
    const chosen = this._connRail();
    return rail.some(r => r.key === chosen) ? chosen : 'token';
  });

  setConnRail(key: string) { this._connRail.set(key); }

  // ── Permissions rail (Standard 2.1, grouped-list case) ──────────────────────
  // ~39 sections were rendered as 39 stacked cards — several hundred rows in one
  // scroll, with no way to reach a domain except by dragging past the others.
  // The rail is one item per section, carrying its endpoint count.
  //
  // Composes with the filter exactly as the System Functions rail does: the
  // filter narrows the sections, and the rail is rebuilt from the survivors, so
  // a rail item never opens an empty pane.
  permRail = signal<string | null>(null);

  permRailTabs = computed<TabDef[]>(() =>
    this.filteredSections().map(s => ({
      key: s.section,
      label: sectionLabelKey(s.section),
      count: s.items.length,
    })));

  /**
   * The section actually shown. Falls back to the first surviving section, so a
   * filter that removes the chosen one cannot leave the pane blank with every
   * rail item unselected.
   */
  activePermSection = computed(() => {
    const tabs = this.permRailTabs();
    const chosen = this.permRail();
    if (chosen && tabs.some(t => t.key === chosen)) return chosen;
    return tabs.length ? tabs[0].key : null;
  });

  /** The single section the pane renders. */
  activeSection = computed(() => {
    const key = this.activePermSection();
    return key ? this.filteredSections().find(s => s.section === key) ?? null : null;
  });

  // ── Docs ────────────────────────────────────────────────────────────────────
  docsBusy = signal(false);

  /**
   * Open the Swagger reference in a new tab.
   *
   * Deliberately NOT a tab that swaps content and NOT an iframe: the Regulator API serves
   * `helmet.frameguard()`, so framing is refused outright, and an iframe could not carry our
   * bearer to the docs' own asset requests anyway. So this is a link — and because a link
   * carries no Authorization header, the API first converts the admin session into a
   * short-lived HttpOnly cookie. Without that cookie /api-docs answers 404.
   *
   * ⚠️ THE WINDOW IS OPENED SYNCHRONOUSLY, BEFORE THE AWAIT. Popup blockers allow
   * `window.open` only while a user gesture is still on the stack; opening it after the
   * session call resolves puts it outside that window and the browser silently swallows it —
   * which presents as "the Docs tab does nothing", with no error anywhere.
   */
  async openDocs() {
    if (this.docsBusy()) return;
    const win = window.open('', '_blank');
    this.docsBusy.set(true);
    try {
      const res = await this.apiService.vaultApiDocsSession();
      const url = res?.url;
      if (res?.error || !url) {
        win?.close();
        await this.alertService.info(
          this.translate.instant('alerts.error'),
          res?.error || this.translate.instant('settings.apiManagement.docs.failed'));
        return;
      }
      // A blocked popup leaves `win` null — navigate this tab rather than losing the click.
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      await this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('settings.apiManagement.docs.failed'));
    } finally {
      this.docsBusy.set(false);
    }
  }

  // ── Connectivity: the access token ──────────────────────────────────────────
  // Held as a fingerprint until an admin asks for the value. Opening the tab must not
  // put a credential on screen — someone is often screen-sharing a settings page.
  tokenConfigured  = signal(false);
  tokenFingerprint = signal<string | null>(null);
  tokenLength      = signal(0);
  tokenValue       = signal<string | null>(null);   // only after an explicit reveal
  tokenBusy        = signal(false);
  tokenCopied      = signal(false);

  // ── Connectivity: the integration VPN peer ──────────────────────────────────
  integrationPeer  = signal<IntegrationPeer | null>(null);
  vpnLoading       = signal(false);
  vpnBusy          = signal(false);
  vpnHostReachable = signal(true);
  vpnHostError     = signal<string | null>(null);
  integrationLabel = signal('');

  /**
   * The VPN half is behind the default-deny `user-vpn-manage` System Function, so an admin
   * without it sees the token but not the peer.
   *
   * ⚠️ Hidden, not disabled — and NOT an error. A section that renders an explanatory empty
   * state for a capability the admin was never granted reads as a fault in the page; the
   * platform's standing rule for a closed capability is to hide the surface.
   */
  showVpn(): boolean {
    return this.features.systemFunctionEnabled('user-vpn-manage');
  }

  /**
   * Sections narrowed by the free-text filter, matching SUMMARY, PATH or RAW KEY.
   *
   * ⚠️ A FILTER IS MANDATORY HERE, NOT A CONVENIENCE — 357 rows across 39 sections. Copied from
   * the users-details `sysFnFilter` / `filteredSysFnRows` pair so the two admin surfaces behave
   * identically.
   *
   * ⚠️ Sections with no surviving row are DROPPED rather than rendered empty: an empty card
   * under a heading reads as "this section has no endpoints", which is a different and false
   * statement from "nothing here matched your filter".
   */
  filteredSections = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.sections();
    if (!q) return all;
    return all
      .map(s => ({
        section: s.section,
        license: s.license,
        items: s.items.filter(i =>
          (i.summary || '').toLowerCase().includes(q) ||
          i.path.toLowerCase().includes(q) ||
          i.key.toLowerCase().includes(q)),
      }))
      .filter(s => s.items.length > 0);
  });

  totalCount    = computed(() => this.sections().reduce((n, s) => n + s.items.length, 0));
  disabledCount = computed(() =>
    this.sections().reduce((n, s) => n + s.items.filter(i => !i.enabled).length, 0));

  ngOnInit() {}

  async ionViewDidEnter() {
    // Both tabs load up front. The endpoint registry is ~357 rows and the two connectivity
    // reads are trivial, so deferring either would only buy a visible stall on the first tab
    // switch — and the Permissions tab's summary line is rendered in the tab bar itself.
    await Promise.all([this.load(), this.loadConnectivity()]);
  }

  async loadConnectivity() {
    // The token is READ ON EVERY ENTRY, but the revealed value is NOT carried across —
    // re-opening the page should not still be showing a secret revealed ten minutes ago.
    this.tokenValue.set(null);
    this.tokenCopied.set(false);
    try {
      const c = await this.apiService.vaultApiCredentials();
      this.tokenConfigured.set(c.configured);
      this.tokenFingerprint.set(c.fingerprint);
      this.tokenLength.set(c.length);
    } catch {
      // Unreadable is not "absent". Claiming the tenant has no token because one request
      // failed would send an admin to mint a credential that already exists.
      this.tokenConfigured.set(false);
      this.tokenFingerprint.set(null);
    }
    if (this.showVpn()) await this.loadVpn();
  }

  async loadVpn() {
    this.vpnLoading.set(true);
    try {
      const res = await this.apiService.vaultVpnList();
      // ONE integration peer per tenant (ruling 34.0 #2). A revoked one is kept as history
      // by the API, so prefer a LIVE row and fall back to the most recent revoked one —
      // otherwise a tenant that revoked and re-granted would show the dead row.
      const integrations = (res.peers as IntegrationPeer[]).filter(p => p.kind === 'integration');
      const live = integrations.find(p => p.status !== 'revoked');
      const newest = integrations.slice().sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
      this.integrationPeer.set(live ?? newest);
      this.vpnHostReachable.set(res.hostReachable);
      this.vpnHostError.set(res.hostError);
    } catch {
      this.integrationPeer.set(null);
      this.vpnHostReachable.set(false);
      this.vpnHostError.set(this.translate.instant('settings.apiManagement.vpn.loadFailed'));
    } finally {
      this.vpnLoading.set(false);
    }
  }

  /** Reveal the access token. Audited server-side; the value is never logged here. */
  async revealToken() {
    if (this.tokenBusy()) return;
    this.tokenBusy.set(true);
    try {
      const res = await this.apiService.vaultApiCredentialsReveal();
      if (res?.error || !res?.token) {
        await this.alertService.info(
          this.translate.instant('alerts.error'),
          res?.error || this.translate.instant('settings.apiManagement.token.revealFailed'));
        return;
      }
      this.tokenValue.set(res.token);
    } catch {
      await this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('settings.apiManagement.token.revealFailed'));
    } finally {
      this.tokenBusy.set(false);
    }
  }

  hideToken() {
    this.tokenValue.set(null);
    this.tokenCopied.set(false);
  }

  async copyToken() {
    const v = this.tokenValue();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      this.tokenCopied.set(true);
      setTimeout(() => this.tokenCopied.set(false), 2000);
    } catch {
      // Clipboard access is denied in some embedded browsers. Say so rather than
      // silently doing nothing — the admin can still select the text by hand.
      await this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('settings.apiManagement.token.copyFailed'));
    }
  }

  /**
   * Grant THE integration peer. The response carries the only copy of the private key that
   * will ever exist — downloaded immediately, never held in a signal.
   */
  async grantIntegration() {
    if (this.vpnBusy()) return;
    const okToGo = await this.alertService.show(
      this.translate.instant('settings.apiManagement.vpn.grantConfirmTitle'),
      this.translate.instant('settings.apiManagement.vpn.grantConfirmMsg'),
      this.translate.instant('common.confirm'));
    if (!okToGo) return;

    this.vpnBusy.set(true);
    try {
      const label = this.integrationLabel().trim();
      const res: any = await this.apiService.vaultVpnGrantIntegration(label || undefined);
      if (res?.error) {
        await this.alertService.info(
          this.translate.instant('settings.apiManagement.vpn.grantFailedTitle'), res.error);
        return;
      }
      const fileName = res.profileFileName || 'integration.ovpn';
      this.downloadProfile(fileName, res.profile);
      this.integrationLabel.set('');
      await this.loadVpn();
      await this.alertService.info(
        this.translate.instant('settings.apiManagement.vpn.grantedTitle'),
        this.translate.instant('settings.apiManagement.vpn.grantedMsg', { file: fileName }));
    } catch {
      await this.alertService.info(
        this.translate.instant('settings.apiManagement.vpn.grantFailedTitle'),
        this.translate.instant('settings.apiManagement.vpn.grantFailedMsg'));
    } finally {
      this.vpnBusy.set(false);
    }
  }

  async revokeIntegration() {
    const peer = this.integrationPeer();
    if (!peer || this.vpnBusy()) return;
    // `show`, not `info` — info hides Cancel, and cutting an integration's only route to the
    // API must be refusable.
    const confirmed = await this.alertService.show(
      this.translate.instant('settings.apiManagement.vpn.revokeConfirmTitle'),
      this.translate.instant('settings.apiManagement.vpn.revokeConfirmMsg'),
      this.translate.instant('settings.apiManagement.vpn.revokeConfirmAction'));
    if (!confirmed) return;

    this.vpnBusy.set(true);
    try {
      const res: any = await this.apiService.vaultVpnRevoke(peer.person);
      if (res?.error) {
        await this.alertService.info(
          this.translate.instant('settings.apiManagement.vpn.revokeFailedTitle'), res.error);
        return;
      }
      await this.loadVpn();
    } catch {
      await this.alertService.info(
        this.translate.instant('settings.apiManagement.vpn.revokeFailedTitle'),
        this.translate.instant('settings.apiManagement.vpn.revokeFailedMsg'));
    } finally {
      this.vpnBusy.set(false);
    }
  }

  /** dd/MM/yyyy HH:mm:ss over a MILLISECOND epoch, per the platform date standard. */
  formatTime(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    const d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '—';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
         + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** Save the .ovpn. Blob + object URL, revoked at once — the profile must not linger. */
  private downloadProfile(fileName: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-openvpn-profile' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async load() {
    this.loading.set(true);
    try {
      // ⚠️ REGISTRY ORDER IS SERVER ORDER — do NOT sort or re-group here. The registry is
      // generated from the API spec's own domain tags and is the REVIEWED order; re-sorting a
      // 357-row list a human is expected to scan would quietly discard that review.
      const res = await this.apiService.vaultApiEndpointsList();
      // A section the regulator's licences do not cover is HIDDEN (2026-09-10 — the same rule as the
      // sidebar; user ruling: hidden, not locked). Its routes answer 403 to every external caller
      // at the licence ceiling whatever the toggle says, so a switch here would control nothing.
      // `undetermined` stays visible: "we could not read the licences" is not a refusal.
      this.sections.set((res?.sections ?? []).filter(s => s.license?.state !== 'not-covered'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Per-toggle immediate save behind a confirm — no dirty buffer, no Save button, matching the
   * menu page. The confirm text names the DIRECTION, because "are you sure?" over a 357-row list
   * is not a question anyone can answer.
   */
  async toggle(item: ApiEndpointItem, enabled: boolean) {
    const okToGo = await this.alertService.show(
      this.translate.instant(enabled
        ? 'settings.apiEndpoints.confirmEnableTitle'
        : 'settings.apiEndpoints.confirmDisableTitle'),
      this.translate.instant(enabled
        ? 'settings.apiEndpoints.confirmEnableMsg'
        : 'settings.apiEndpoints.confirmDisableMsg', { name: item.summary || item.key }),
      this.translate.instant('common.confirm'));
    if (!okToGo) {
      // Re-render from state so the checkbox springs back — the DOM already moved.
      this.sections.set([...this.sections()]);
      return;
    }

    this.saving.set(item.key);
    try {
      const res = await this.apiService.vaultApiEndpointSet(item.key, enabled);
      if (res?.error) {
        // ⚠️ `show`, not `info` — the Vault's AlertService exposes only `show`. (The Regulator
        // Dashboard has `info`; the two apps' alert services are NOT the same surface.)
        await this.alertService.info(this.translate.instant('alerts.error'), res.error);
        this.sections.set([...this.sections()]);
        return;
      }
      item.enabled = enabled;
      item.overridden = true;
      this.sections.set([...this.sections()]);
    } finally {
      this.saving.set(null);
    }
  }

  /**
   * Clear the override, returning the endpoint to its registry default.
   *
   * ⚠️ This is NOT "enable" — it removes the DECISION. A row means an admin chose; resetting
   * deletes that record rather than replacing it with a choice nobody made. The button only
   * appears on overridden rows, so a reader can see at a glance which switches were touched.
   */
  async reset(item: ApiEndpointItem) {
    const okToGo = await this.alertService.show(
      this.translate.instant('settings.apiEndpoints.confirmResetTitle'),
      this.translate.instant('settings.apiEndpoints.confirmResetMsg', { name: item.summary || item.key }),
      this.translate.instant('common.confirm'));
    if (!okToGo) return;

    this.saving.set(item.key);
    try {
      const res = await this.apiService.vaultApiEndpointReset(item.key);
      if (res?.error) {
        await this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      // Re-load rather than guessing the default: the registry default is the server's to state,
      // and assuming `true` here would be this page inventing the very value it is meant to read.
      await this.load();
    } finally {
      this.saving.set(null);
    }
  }
}
