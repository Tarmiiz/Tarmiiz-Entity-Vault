import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

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
  imports: [ReactiveFormsModule, FormsModule],
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
      await this.alertService.show('Invalid Form', 'Please enter your email and the 6-digit activation code.');
      return;
    }
    const { email, otp } = this.formActivation.value;
    this.isSubmitting.set(true);
    this.loadingService.show('Verifying activation code...');
    let alertTitle = '';
    let alertMessage = '';
    try {
      const config = await this.apiService.vaultGetConfig();
      if (!config) throw new Error('Failed to fetch entity configuration');
      if (!config.bootstrapSalt || /^0x0+$/.test(config.bootstrapSalt)) {
        alertTitle = 'Already Claimed';
        alertMessage = 'This entity has already been claimed. Please log in normally.';
        return;
      }
      this.ethersService.configure(config.rpcNode, config.entityContract, config.globalVariablesProxyContract, config.globalSalt);
      await this.ethersService.init();

      // Real ZK login against the placeholder commitment, using the bootstrap salt.
      const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes — short, claim is expected to be quick
      const result: any = await this.apiService.entityLogin(email, otp, SESSION_DURATION, config.bootstrapSalt, true);
      if (!result.success) {
        const err = String(result.error ?? '');
        alertTitle = 'Activation Failed';
        if (/commitment mismatch|invalid zk proof/i.test(err)) {
          alertMessage = 'The activation code is incorrect or expired. Please ask your regulator to regenerate the code.';
        } else {
          alertMessage = err || 'Could not verify the activation code.';
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
      alertTitle = 'Activation Error';
      alertMessage = err?.message || 'An unexpected error occurred.';
    } finally {
      this.loadingService.hide();
      this.isSubmitting.set(false);
      if (alertTitle) await this.alertService.show(alertTitle, alertMessage);
    }
  }

  async submitPassword() {
    if (!this.formPassword.valid) {
      await this.alertService.show('Invalid Form', 'Name, username are required and password must be at least 8 characters.');
      return;
    }
    const { name, username, password, confirm } = this.formPassword.value;
    if (password !== confirm) {
      await this.alertService.show('Password Mismatch', 'Password and confirmation do not match.');
      return;
    }
    this.isSubmitting.set(true);
    this.loadingService.show('Setting your new password...');
    let alertTitle = '';
    let alertMessage = '';
    try {
      // Compute the rotated commitment using the entity API's own globalSalt (already loaded
      // into ethersService from /vault/config in step 1).
      const newCommitment = await this.ethersService.computeCommitment(this.email(), password);
      if (!newCommitment) throw new Error('Failed to compute new commitment');

      const claimRes = await this.apiService.vaultUserAdminClaim(newCommitment, { name, username, email: this.email() });
      if (!claimRes) throw new Error('Claim transaction failed');

      // adminClaim only rotates the COMMITMENT (still keyed to email's loginHash). If the user
      // chose a username different from email, rotate loginHash too so they can log in with the
      // chosen username. Need a fresh JWT (placeholder session ended), so log in with the new
      // password against the rotated commitment, then call PUT /vault/users/1/credentials.
      if (username && String(username).trim() && String(username).trim() !== this.email()) {
        try {
          const REKEY_SESSION = 5 * 60 * 1000;
          const loginRes: any = await this.apiService.entityLogin(this.email(), password, REKEY_SESSION);
          if (loginRes?.success && loginRes.token) {
            await this.sessionService.setSession(loginRes.token, loginRes.expiresAt, loginRes.refreshExpiresAt);
            // Server computes loginHash + commitment from (username, password) using its own
            // GLOBAL_SALT — same salt the next login will use, so the rotated credentials match.
            await this.apiService.vaultUpdateUserCredentials('1', { username: String(username).trim(), password });
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
          const DID_SESSION_DURATION = 5 * 60 * 1000; // 5 minutes — only used to bridge claim()
          const idPayload = await this.ethersService.createIdentityLoginPayload(
            didAddress, this.email(), this.otp(), DID_SESSION_DURATION, this.bootstrapSalt(), true
          );
          if (idPayload) {
            const didRes = await this.apiService.vaultIdentityAdminClaim({ ...idPayload, newCommitment });
            if (didRes && didRes.error) console.warn('DID claim returned error:', didRes.error);
          }
        }
      } catch (didErr: any) {
        console.warn('DID claim skipped:', didErr?.message);
      }

      this.step.set('done');
    } catch (err: any) {
      alertTitle = 'Claim Failed';
      alertMessage = err?.message || 'Could not complete the claim.';
    } finally {
      this.loadingService.hide();
      this.isSubmitting.set(false);
      if (alertTitle) await this.alertService.show(alertTitle, alertMessage);
    }
  }

  goToLogin() {
    this.router.navigate(['/public/user/login']);
  }
}
