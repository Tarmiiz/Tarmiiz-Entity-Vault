import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked, OnDestroy } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalFundImportService } from './modal-fund-import.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';

/** The wizard's three steps. `run` is the live job, which outlives the modal. */
type Step = 'pick' | 'review' | 'run';

/**
 * Fund-import wizard.
 *
 * THREE STEPS, AND THE MIDDLE ONE IS THE POINT. Upload validates without writing anything on
 * chain and returns the pre-flight report; the operator reads it and only then commits. An import
 * is not transactional — a half-finished one has to be reasoned about row by row — so the errors
 * this step catches are exactly the ones that are expensive after the fact.
 *
 * ⚠️ ID-SCAN FILES ARE NOT SUPPORTED HERE, and the API refuses rather than skips a row that names
 * one. A browser uploads files, not the folder an `idFront: images/x.jpg` path is relative to, so
 * such a path names nothing that reached the server — and an eKYC document is pinned once with its
 * recipients fixed, so onboarding "successfully" without the scans leaves the regulator's copy
 * permanently incomplete with no way to re-mint. Inline base64 in the cell still works, and the
 * CLI still reads an images/ folder.
 */
@Component({
  selector: 'app-modal-fund-import',
  templateUrl: './modal-fund-import.component.html',
  styleUrls: ['./modal-fund-import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class ModalFundImportComponent implements OnDestroy {

  fundImportService = inject(ModalFundImportService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  step = signal<Step>('pick');
  busy = signal(false);
  uploadPercent = signal<number | null>(null);

  // ── step 1 ──
  files = signal<File[]>([]);
  fundConfigText = signal('');
  configError = signal<string | null>(null);

  // ── step 2 ──
  jobId = signal<string | null>(null);
  report = signal<any>(null);
  fatal = signal<string[]>([]);
  errors = signal<string[]>([]);
  warnings = signal<string[]>([]);
  force = signal(false);

  // ── step 3 ──
  jobStatus = signal<string>('');
  counters = signal<{ ok: number; skipped: number; failed: number; partial: number } | null>(null);
  partialIds = signal<string[]>([]);
  logLines = signal<string[]>([]);
  jobError = signal<string | null>(null);
  private lastSeq = 0;
  private pollTimer: any = null;
  private started = false;

  /** The CSV filenames the API matches on. Anything else is refused, so they are listed up front. */
  readonly expectedFiles = computed(() =>
    this.fundImportService.mode() === 'subscribers'
      ? ['subscribers.csv']
      : ['subscribers.csv', 'snapshot-assets.csv', 'snapshot-credit.csv']);

  /** The run is over — the modal may close without abandoning anything in flight. */
  readonly finished = computed(() => ['done', 'failed', 'partial', 'error'].includes(this.jobStatus()));

  /*
      The report's `counts` and `pricing` are open-ended maps, so they are flattened here rather
      than piped through `json` / `keyvalue` in the template. Dumping `{"subscribers":12}` at an
      operator is not a report — and `| json` would also render the English key inside an Arabic
      page. Each key gets a translated label with the raw key as the fallback, so a new count added
      server-side still renders something honest instead of disappearing.
  */
  readonly countsList = computed(() =>
    Object.entries(this.report()?.counts ?? {}).map(([key, value]) => ({
      label: this.translate.instant('services.details.import.count.' + key) === 'services.details.import.count.' + key
        ? key
        : this.translate.instant('services.details.import.count.' + key),
      value,
    })));

  readonly pricingList = computed(() =>
    Object.entries(this.report()?.pricing ?? {}).map(([asset, p]: [string, any]) => ({ asset, ask: p?.ask })));

  constructor() {
    effect(() => {
      if (this.fundImportService.isVisible()) {
        // untracked: the reset reads the very signals it writes (files, step, …); tracked here,
        // the operator's first file selection would re-trigger this effect and wipe it.
        untracked(() => this._reset());
      }
    });
  }

  ngOnDestroy(): void { this._stopPolling(); }

  private _reset(): void {
    this._stopPolling();
    this.step.set('pick');
    this.busy.set(false);
    this.uploadPercent.set(null);
    this.files.set([]);
    this.configError.set(null);
    this.jobId.set(null);
    this.report.set(null);
    this.fatal.set([]);
    this.errors.set([]);
    this.warnings.set([]);
    this.force.set(false);
    this.jobStatus.set('');
    this.counters.set(null);
    this.partialIds.set([]);
    this.logLines.set([]);
    this.jobError.set(null);
    this.lastSeq = 0;
    this.started = false;
    // A sensible starting point the operator edits: only `service` is truly required, and it is
    // pinned to the page's own service — the API refuses a config naming a different one.
    this.fundConfigText.set(JSON.stringify({
      service: this.fundImportService.serviceAddress(),
      asset: '',
      paymentProcessor: '',
      provider: '',
      countryCodeDefault: 818,
      currencyCodeDefault: 818,
      verificationLevel: 2,
    }, null, 2));
  }

  // ── step 1 ───────────────────────────────────────────────────────────────────────────────────

  /** Hand the operator a blank CSV with the right header, rather than making them guess 37 columns. */
  async downloadTemplate(file: string): Promise<void> {
    const res = await this.apiService.vaultFundImportTemplate(this.fundImportService.serviceAddress(), file);
    if (res?.error) {
      this.alertService.info(this.translate.instant('alerts.error'), res.error);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files || []);
    if (picked.length) {
      // Merge rather than replace: the balances mode wants two or three files and an operator may
      // reasonably pick them in separate trips through the dialog.
      const byName = new Map(this.files().map((f) => [f.name.toLowerCase(), f]));
      for (const f of picked) byName.set(f.name.toLowerCase(), f);
      this.files.set([...byName.values()]);
    }
    // Reset so re-picking the SAME file still fires `change`.
    input.value = '';
  }

  removeFile(name: string): void {
    this.files.set(this.files().filter((f) => f.name !== name));
  }

  onConfigInput(event: Event): void {
    this.fundConfigText.set((event.target as HTMLTextAreaElement).value);
    this.configError.set(null);
  }

  async onValidate(): Promise<void> {
    let cfg: any;
    try {
      cfg = JSON.parse(this.fundConfigText());
    } catch (e: any) {
      this.configError.set(this.translate.instant('services.details.import.badConfigJson', { message: e?.message || '' }));
      return;
    }
    if (!this.files().length) return;

    this.busy.set(true);
    this.uploadPercent.set(0);
    try {
      const res = await this.apiService.vaultFundImportUpload(
        this.fundImportService.serviceAddress(),
        this.fundImportService.mode(),
        cfg,
        this.files(),
        (p) => this.uploadPercent.set(p),
      );
      this.uploadPercent.set(null);

      // A 400 still carries the findings — fatal/errors/warnings are the whole value of the
      // pre-flight, so they are rendered rather than collapsed into one alert.
      this.fatal.set(res?.fatal ?? []);
      this.errors.set(res?.errors ?? []);
      this.warnings.set(res?.warnings ?? []);
      this.report.set(res?.report ?? null);
      this.jobId.set(res?.jobId ?? null);

      if (!res?.jobId && !(res?.fatal?.length)) {
        // No job and no findings to explain why — surface whatever the transport said.
        this.alertService.info(
          this.translate.instant('alerts.updateFailed'),
          res?.error || this.translate.instant('services.details.import.validateFailed'),
        );
        return;
      }
      this.step.set('review');
    } finally {
      this.busy.set(false);
      this.uploadPercent.set(null);
    }
  }

  // ── step 2 ───────────────────────────────────────────────────────────────────────────────────

  async onExecute(): Promise<void> {
    const id = this.jobId();
    if (!id) return;

    const confirmed = await this.alertService.show(
      this.translate.instant('services.details.import.confirmTitle'),
      this.translate.instant(
        this.fundImportService.mode() === 'subscribers'
          ? 'services.details.import.confirmSubscribers'
          : 'services.details.import.confirmBalances',
      ),
      this.translate.instant('alerts.ok'),
    );
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const res = await this.apiService.vaultFundImportExecute(
        this.fundImportService.serviceAddress(), id, this.force(),
      );
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.updateFailed'), res.error);
        return;
      }
      this.started = true;
      this.jobStatus.set('running');
      this.step.set('run');
      this._startPolling();
    } finally {
      this.busy.set(false);
    }
  }

  // ── step 3 ───────────────────────────────────────────────────────────────────────────────────

  private _startPolling(): void {
    this._stopPolling();
    // 2s: an import row is an on-chain write of seconds, so anything tighter just adds requests.
    this.pollTimer = setInterval(() => this._poll(), 2000);
    this._poll();
  }

  private _stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async _poll(): Promise<void> {
    const id = this.jobId();
    if (!id) return;
    const svc = this.fundImportService.serviceAddress();

    const res = await this.apiService.vaultFundImportJob(svc, id);
    const job = res?.job;
    if (job) {
      this.jobStatus.set(job.status || '');
      this.counters.set(job.counters || null);
      this.partialIds.set(job.partialIds || []);
      this.jobError.set(job.error || null);
    }

    const logRes = await this.apiService.vaultFundImportLog(svc, id, this.lastSeq, 500);
    const lines = logRes?.lines || [];
    if (lines.length) {
      this.lastSeq = lines[lines.length - 1].seq;
      this.logLines.set([...this.logLines(), ...lines.map((l: any) => l.line)]);
    }

    if (this.finished()) this._stopPolling();
  }

  // ── close ────────────────────────────────────────────────────────────────────────────────────

  async onClose(): Promise<void> {
    // Closing mid-run does NOT cancel — the job is server-side and keeps going. Say so, rather
    // than letting the operator infer they have stopped it.
    if (this.step() === 'run' && !this.finished()) {
      const ok = await this.alertService.show(
        this.translate.instant('services.details.import.closeRunningTitle'),
        this.translate.instant('services.details.import.closeRunningMessage'),
        this.translate.instant('alerts.ok'),
      );
      if (!ok) return;
    }
    this._stopPolling();
    this.fundImportService.close(this.started);
  }
}
