import { Injectable, signal } from '@angular/core';
import { User } from '../../../../../shared/models/data.model';

export interface CredentialsUserData {
  username: string | null; // null = password-only change
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalUserCredentialsService {
  isVisible = signal(false);
  user = signal<User | null>(null);

  private resolveFn?: (value: CredentialsUserData | null) => void;

  show(user: User): Promise<CredentialsUserData | null> {
    this.user.set(user);
    this.isVisible.set(true);

    return new Promise<CredentialsUserData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: CredentialsUserData): void {
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
