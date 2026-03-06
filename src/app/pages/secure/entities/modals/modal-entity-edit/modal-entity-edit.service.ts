import { Injectable, signal } from '@angular/core';
import { Entity } from '../../../../../shared/models/data.model';

export interface EditEntityData {
  name: string;
  website: string;
  email: string;
  mobile: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalEntityEditService {
  isVisible = signal(false);
  service = signal<Entity | null>(null);

  private resolveFn?: (value: EditEntityData | null) => void;

  show(service: Entity): Promise<EditEntityData | null> {
    this.service.set(service);
    this.isVisible.set(true);

    return new Promise<EditEntityData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditEntityData): void {
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
