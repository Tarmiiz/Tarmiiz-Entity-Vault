import { Injectable, signal } from '@angular/core';
import { User } from '../../../../../shared/models/data.model';

export interface AddUserData {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  approvalRole: 'none' | 'maker' | 'checker';
  groupId: string | null; // User Group to assign post-create (roles 2/3 only)
  messagesEnabled: boolean; // grant read-only Messages access post-create (role 4 only)
  handle: string; // Connect direct-message handle to set post-create ('' = skip)
}

@Injectable({
  providedIn: 'root'
})
export class ModalUserAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddUserData | null) => void;

  show(): Promise<AddUserData | null> {
    this.isVisible.set(true);

    return new Promise<AddUserData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: AddUserData): void {
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
