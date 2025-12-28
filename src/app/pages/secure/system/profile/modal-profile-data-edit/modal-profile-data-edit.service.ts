import { Injectable, signal } from '@angular/core';
import { RegulatorData } from '../../../../../shared/models/data.model';

export interface EditProfileData {
  address: string;
  website: string;
  email: string;
  telephone: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalProfileDataEditService {
  isVisible = signal(false);
  regulatorData = signal<RegulatorData | null>(null);

  private resolveFn?: (value: EditProfileData | null) => void;

  show(regulatorData: RegulatorData): Promise<EditProfileData | null> {
    this.regulatorData.set(regulatorData);
    this.isVisible.set(true);

    return new Promise<EditProfileData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditProfileData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(updatedData);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }  
}
