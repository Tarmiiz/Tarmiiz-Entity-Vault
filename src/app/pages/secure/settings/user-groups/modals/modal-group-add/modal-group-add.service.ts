import { Injectable, signal } from '@angular/core';

export interface AddGroupData {
  name: string;
  description: string;
  role: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalGroupAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddGroupData | null) => void;

  show(): Promise<AddGroupData | null> {
    this.isVisible.set(true);

    return new Promise<AddGroupData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddGroupData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(data);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
