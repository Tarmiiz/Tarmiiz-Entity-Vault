import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalUserAddService, AddUserData } from './modal-user-add.service';

import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UserGroup } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-modal-user-add',
  templateUrl: './modal-user-add.component.html',
  styleUrls: ['./modal-user-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalUserAddComponent {

  addUserService = inject(ModalUserAddService);
  private fb: FormBuilder = inject(FormBuilder);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private apiService = inject(ApiService);
  private translate = inject(TranslateService);

  isLoading = false;

  // Connect handle format (mirrors Handles.sol + the API): lowercase, 3-32 chars,
  // alphanumeric first/last, interior may include . _ -
  private static readonly HANDLE_REGEX = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

  // The Connect handle is auto-suggested from the username until the admin edits
  // it by hand — once touched we stop overwriting it.
  private handleTouched = false;

  addForm = this.fb.group({
    name:         ['', Validators.required],
    email:        ['', [Validators.required, Validators.email]],
    username:     ['', Validators.required],
    password:     ['', Validators.required],
    password2:    ['', Validators.required],
    role:         ['', Validators.required],
    approvalRole: ['none'],
    groupId:      [''],
    // Security officers (role 4) get read-only Messages access ONLY when the
    // admin grants it here (default OFF).
    messagesEnabled: [false],
    // Optional Connect direct-message handle; empty is allowed, non-empty must
    // match the handle format. Defaults to a sanitized form of the username.
    handle:       ['', Validators.pattern(ModalUserAddComponent.HANDLE_REGEX)],
  });

  readonly roles = [
    { variableId: 1, name: this.translate.instant('role.admin') },
    { variableId: 2, name: this.translate.instant('users.roles.executive') },
    { variableId: 3, name: this.translate.instant('role.viewer') },
    { variableId: 4, name: this.translate.instant('users.roles.security') },
  ];

  // User Groups applicable to the currently selected role (groups are role-scoped).
  roleGroups = signal<UserGroup[]>([]);

  constructor() {
    this.addForm.get('role')?.valueChanges.subscribe((role) => {
      if (Number(role) !== 2) this.addForm.get('approvalRole')?.setValue('none');
      if (Number(role) !== 4) this.addForm.get('messagesEnabled')?.setValue(false);
      this.addForm.get('groupId')?.setValue('');
      this.loadGroupsForRole(Number(role));
    });
    // Keep the handle in sync with the username until the admin edits it manually.
    this.addForm.get('username')?.valueChanges.subscribe((username) => {
      if (this.handleTouched) return;
      this.addForm.get('handle')?.setValue(this.sanitizeHandle(username ?? ''), { emitEvent: false });
    });
  }

  onHandleInput(): void {
    this.handleTouched = true;
  }

  // Derive a valid handle from a username: lowercase, spaces → '_', drop any other
  // invalid char, trim non-alphanumeric edges, cap at 32. Returns '' when the
  // result is too short to be a valid handle (field is left blank / optional).
  private sanitizeHandle(username: string): string {
    let h = (username ?? '').trim().toLowerCase();
    h = h.replace(/\s+/g, '_');           // spaces → underscore
    h = h.replace(/[^a-z0-9._-]/g, '');   // drop any other invalid char
    h = h.replace(/^[^a-z0-9]+/, '');     // trim leading non-alphanumeric
    h = h.replace(/[^a-z0-9]+$/, '');     // trim trailing non-alphanumeric
    if (h.length > 32) h = h.slice(0, 32).replace(/[^a-z0-9]+$/, '');
    return h.length >= 3 ? h : '';
  }

  isExecutive(): boolean {
    return Number(this.addForm.get('role')?.value) === 2;
  }

  isSecurity(): boolean {
    return Number(this.addForm.get('role')?.value) === 4;
  }

  private async loadGroupsForRole(role: number) {
    if (role !== 2 && role !== 3) {
      this.roleGroups.set([]);
      return;
    }
    try {
      const groups = await this.apiService.vaultUserGroupsList();
      this.roleGroups.set(groups.filter(g => g.role === role));
    } catch {
      this.roleGroups.set([]);
    }
  }

  onSave(): void {
    this.isLoading = true;
    this.loadingService.show(this.translate.instant('users.addModal.registering'));

    if (this.addForm.invalid) {
      this.loadingService.hide();
      this.alertService.show(this.translate.instant('users.addModal.invalidFormTitle'), this.translate.instant('users.addModal.invalidFormMessage'));
      return;
    }

    if (this.addForm.value.password !== this.addForm.value.password2) {
      this.loadingService.hide();
      this.alertService.show(this.translate.instant('users.addModal.passwordMismatchTitle'), this.translate.instant('users.addModal.passwordMismatchMessage'));
      return;
    }

    try {
      const formValue = this.addForm.getRawValue();
      const role = Number(formValue.role);
      const approvalRole = (role === 2 ? (formValue.approvalRole || 'none') : 'none') as 'none' | 'maker' | 'checker';
      const addData: AddUserData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        role: formValue.role ?? '',
        username: formValue.username ?? '',
        password: formValue.password ?? '',
        approvalRole,
        groupId: (role === 2 || role === 3) && formValue.groupId ? formValue.groupId : null,
        messagesEnabled: role === 4 ? !!formValue.messagesEnabled : false,
        handle: (formValue.handle ?? '').trim().toLowerCase(),
      };
      this.loadingService.hide();
      this.addUserService.confirm(addData);
    }
    catch (error) {
      this.loadingService.hide();
      this.alertService.show(this.translate.instant('users.addModal.errorTitle'), this.translate.instant('users.addModal.errorMessage'));
    }

  }

  onCancel(): void {
    this.addUserService.cancel();
  }

}
