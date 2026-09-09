import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { ApiService } from '../../../../shared/services/api.service';
import { EthersService } from '../../../../shared/services/ethers.service';
import { SessionService } from '../../../../shared/services/session.service';

// Bootstrap-admin claim wizard. Reached when AuthService.login() detects that the loginHash
// belongs to an unclaimed bootstrap admin — i.e. the regulator has registered the entity but the
// admin has never set their own password.
//
// Two steps:
//   1. Enter the 6-digit activation code (from the email Regulator API sent at registration time).
//      We use it as the password for a real ZK login against EntityTemplate's placeholder
//      commitment. The placeholder was computed with the regulator API's salt, which the entity
//      contract recorded at creation time as `bootstrapSalt` and exposes via /vault/config.
//   2. Set + confirm a new password. We compute the new commitment with the entity API's salt
//      and submit it via POST /vault/users/admin-claim. The contract rotates the commitment,
//      flips `claimed` to true, zeroes `_bootstrapSalt`, and ends the placeholder session.
// After success the user is sent back to /public/user/login to sign in normally.

@Component({
  selector: 'app-claim',
  templateUrl: './claim.page.html',
  styleUrls: ['./claim.page.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, TranslatePipe],
})
export class ClaimPage implements OnInit {
  private alertService   = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb             = inject(FormBuilder);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private apiService     = inject(ApiService);
  private ethersService  = inject(EthersService);
  private sessionService = inject(SessionService);
  private translate      = inject(TranslateService);

  // signals so the template can react without a separate change-detection cycle
  step           = signal<1 | 2 | 'done'>(1);
  email          = signal<string>('');
  otp            = signal<string>('');
  bootstrapSalt  = signal<string>('');
  isSubmitting   = signal<boolean>(false);

  formActivation!: FormGroup;
  formPassword!:   FormGroup;

  constructor() {
    this.formActivation = this.fb.group({
      email: new FormControl('', [Validators.required, Validators.email]),
      otp:   new FormControl('', [Validators.required, Validators.pattern(/^\d{6}$/)]),
    });
    this.formPassword = this.fb.group({
      name:     new FormControl('', [Validators.required, Validators.minLength(2)]),
      username: new FormControl('', [Validators.required, Validators.minLength(2)]),
      password: new FormControl('', [Validators.required, Validators.minLength(8)]),
      confirm:  new FormControl('', [Validators.required]),
    });
  }

  ngOnInit() {
    const emailParam = this.route.snapshot.queryParamMap.get('email') ?? '';
    if (emailParam) {
      this.email.set(emailParam);
      this.formActivation.patchValue({ email: emailParam });
    }
  }

  async submitActivation() {
    if (!this.formActivation.valid) {
      await this.alertService.info(this.translate.instant('claim.errors.invalidFormTitle'), this.translate.instant('claim.errors.activationFormMessage'));
      return;
    }
    const { email, otp } = this.formActivation.value;
    this.isSubmitting.set(true);
    this.loadingService.show(this.translate.instant('claim.loading.verifyingActivation'));
    let alertTitle = '';
    let alertMessage = '';
    try {
      const config = await this.apiService.vaultGetConfig();
      if (!config) throw new Error('Failed to fetch entity configuration');
      if (!config.bootstrapSalt || /^0x0+$/.test(config.bootstrapSalt)) {
        alertTitle = this.translate.instant('claim.errors.alreadyClaimedTitle');
        alertMessage = this.translate.instant('claim.errors.alreadyClaimedMessage');
        return;
      }
      this.ethersService.configure(config.rpcNode, config.entityContract, config.globalVariablesProxyContract, config.globalSalt);
      await this.ethersService.init();

      // Real ZK login against the placeholder commitment, using the bootstrap salt.
      const SESSION_DURATION = 30 * 60; // 30 minutes, in SECONDS — short, claim is expected to be quick
      const result: any = await this.apiService.entityLogin(email, otp, SESSION_DURATION, config.bootstrapSalt, true);
      if (!result.success) {
        const err = String(result.error ?? '');
        alertTitle = this.translate.instant('claim.errors.activationFailedTitle');
        if (/commitment mismatch|invalid zk proof/i.test(err)) {
          alertMessage = this.translate.instant('claim.errors.activationCodeInvalid');
        } else {
          alertMessage = err || this.translate.instant('claim.errors.activationVerifyFailed');
        }
        return;
      }
      // Persist the JWT so the authenticated POST /vault/users/admin-claim in step 2 carries
      // the Authorization header — otherwise the API returns 401.
      if (result.token && result.expiresAt && result.refreshExpiresAt) {
        await this.sessionService.setSession(result.token, result.expiresAt, result.refreshExpiresAt);
      }
      this.email.set(email);
      this.otp.set(otp);
      this.bootstrapSalt.set(config.bootstrapSalt);
      this.step.set(2);
    } catch (err: any) {
      alertTitle = this.translate.instant('claim.errors.activationErrorTitle');
      alertMessage = err?.message || this.translate.instant('claim.errors.unexpectedError');
    } finally {
      this.loadingService.hide();
      this.isSubmitting.set(false);
      if (alertTitle) await this.alertService.info(alertTitle, alertMessage);
    }
  }

  async submitPassword() {
    if (!this.formPassword.valid) {
      await this.alertService.info(this.translate.instant('claim.errors.invalidFormTitle'), this.translate.instant('claim.errors.passwordFormMessage'));
      return;
    }
    const { name, username, password, confirm } = this.formPassword.value;
    if (password !== confirm) {
      await this.alertService.info(this.translate.instant('claim.errors.passwordMismatchTitle'), this.translate.instant('claim.errors.passwordMismatchMessage'));
      return;
    }
    this.isSubmitting.set(true);
    this.loadingService.show(this.translate.instant('claim.loading.settingPassword'));
    let alertTitle = '';
    let alertMessage = '';
    try {
      // 18.B4: mint the admin's OWN per-user salt and derive the rotated commitment over it
      // (Argon2id + the in-circuit stretch). The placeholder was committed under the regulator's
      // bootstrap salt, which is shared by every entity that regulator creates and must not
      // outlive the claim; `adminClaim(newCommitment, newSalt)` stores the pair.
      const newSalt = this.ethersService.newSalt();
      const newCommitment = await this.ethersService.computeCommitment(this.email(), password, newSalt);
      if (!newCommitment) throw new Error('Failed to compute new commitment');

      const claimRes = await this.apiService.vaultUserAdminClaim(newCommitment, newSalt, { name, username, email: this.email() });
      if (!claimRes) throw new Error('Claim transaction failed');

      // adminClaim only rotates the COMMITMENT (still keyed to email's loginHash). If the user
      // chose a username different from email, rotate loginHash too so they can log in with the
      // chosen username. Need a fresh JWT (placeholder session ended), so log in with the new
      // password against the rotated commitment, then call PUT /vault/users/1/credentials.
      if (username && String(username).trim() && String(username).trim() !== this.email()) {
        try {
          const REKEY_SESSION = 5 * 60; // 5 minutes, in SECONDS — one-shot login to rotate the username
          const loginRes: any = await this.apiService.entityLogin(this.email(), password, REKEY_SESSION);
          if (loginRes?.success && loginRes.token) {
            await this.sessionService.setSession(loginRes.token, loginRes.expiresAt, loginRes.refreshExpiresAt);
            // 18.5 — hashes only: derive { loginHash, commitment, salt } for the chosen username
            // HERE (fresh salt, Argon2id); the API rejects a plaintext password.
            const rekeyed = await this.ethersService.deriveCredential(String(username).trim(), password);
            if (!rekeyed) throw new Error('Failed to derive the rotated credential');
            await this.apiService.vaultUpdateUserCredentials('1', { username: String(username).trim(), ...rekeyed });
          } else {
            console.warn('rekey login failed:', loginRes?.error);
          }
        } catch (rekeyErr: any) {
          console.warn('username rotation skipped:', rekeyErr?.message);
        }
      }

      // Best-effort: also claim the entity DID. Uses the same OTP captured in step 1 — the DID's
      // placeholder commitment was set to the SAME (loginHash, loginSecret) as the entity admin
      // user 1 at registration time. If the entity has no DID linked (legacy), the API returns
      // { skipped: true } and we silently move on. Errors here do NOT fail the claim — the
      // regulator can re-trigger from a separate maintenance flow if needed.
      try {
        const entityInfo = await this.apiService.vaultGetEntityInfo();
        const didAddress = entityInfo?.didAddress;
        if (didAddress && !/^0x0+$/.test(didAddress)) {
          const DID_SESSION_DURATION = 5 * 60; // 5 minutes, in SECONDS — only used to bridge claim()
          // Fetch the DID's nonce + commitment via the API so proof generation never reads the RPC node.
          const idCredentials = await this.apiService.vaultIdentityCredentialsData(didAddress);
          const idPayload = idCredentials ? await this.ethersService.createIdentityLoginPayload(
            didAddress, this.email(), this.otp(), DID_SESSION_DURATION, this.bootstrapSalt(), true, idCredentials
          ) : null;
          if (idPayload) {
            // The entity DID stores NO salt until Phase 22.0, so its commitment is derived over the
            // entity API's globalSalt (the value the DID App logs into it with) — NOT `newSalt`.
            const didCommitment = await this.ethersService.computeCommitment(this.email(), password, this.ethersService.globalSalt);
            if (!didCommitment) throw new Error('Failed to compute the DID commitment');
            const didRes = await this.apiService.vaultIdentityAdminClaim({ ...idPayload, newCommitment: didCommitment });
            if (didRes && didRes.error) console.warn('DID claim returned error:', didRes.error);
          }
        }
      } catch (didErr: any) {
        console.warn('DID claim skipped:', didErr?.message);
      }

      this.step.set('done');
    } catch (err: any) {
      alertTitle = this.translate.instant('claim.errors.claimFailedTitle');
      alertMessage = err?.message || this.translate.instant('claim.errors.claimFailedMessage');
    } finally {
      this.loadingService.hide();
      this.isSubmitting.set(false);
      if (alertTitle) await this.alertService.info(alertTitle, alertMessage);
    }
  }

  goToLogin() {
    this.router.navigate(['/public/user/login']);
  }
}
