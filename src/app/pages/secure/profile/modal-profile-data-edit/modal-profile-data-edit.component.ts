import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EditProfileData, ModalProfileDataEditService } from './modal-profile-data-edit.service';

@Component({
  selector: 'app-modal-profile-data-edit',
  templateUrl: './modal-profile-data-edit.component.html',
  styleUrls: ['./modal-profile-data-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalProfileDataEditComponent {

  editProfileDataService = inject(ModalProfileDataEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    address: ['', Validators.required],
    website: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    telephone: ['', Validators.required],
  });


  constructor() {
    effect(() => {
      const regulatorData = this.editProfileDataService.regulatorData();
      if (regulatorData) {
        this.editForm.patchValue({
          address: regulatorData.address,
          website: regulatorData.website,
          email: regulatorData.email,
          telephone: regulatorData.telephone,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const regulatorData: EditProfileData = {
        address: formValue.address ?? '',
        website: formValue.website ?? '',
        email: formValue.email ?? '',
        telephone: formValue.telephone ?? ''
      };
      this.editProfileDataService.confirm(regulatorData);
    }
  }

  onCancel(): void {
    this.editProfileDataService.cancel();
  }

}
