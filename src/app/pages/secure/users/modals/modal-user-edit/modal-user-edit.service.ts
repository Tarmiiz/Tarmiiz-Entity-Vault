import { Injectable, signal } from '@angular/core';
import { User } from '../../../../../shared/models/data.model';

export interface EditUserData {
  name: string;
  email: string;
  did: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalUserEditService {
  isVisible = signal(false);
  user = signal<User | null>(null);

  private resolveFn?: (value: EditUserData | null) => void;

  show(user: User): Promise<EditUserData | null> {
    this.user.set(user);
    this.isVisible.set(true);

    return new Promise<EditUserData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditUserData): void {
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
