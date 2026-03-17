import { Injectable, signal } from '@angular/core';
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
  profileData = signal<EditProfileData | null>(null);

  private resolveFn?: (value: EditProfileData | null) => void;

  show(profileData: EditProfileData): Promise<EditProfileData | null> {
    this.profileData.set(profileData);
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
