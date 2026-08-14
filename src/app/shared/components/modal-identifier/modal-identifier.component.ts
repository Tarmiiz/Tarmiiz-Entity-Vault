import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalIdentifierService } from './modal-identifier.service';
import {
  ISIN_TYPE_NAME,
  LEI_TYPE_NAME,
  normalizeIdentifierValue,
  validateIdentifierValue,
} from '../../utils/identifier.utils';

// A real, well-formed example per type — shown as the input placeholder so the expected
// shape is visible before the format error has to explain it. Keyed by type NAME, the same
// matching rule the validators use (the numeric id is Global Variables insertion order).
// Not translated: these are identifiers, not prose.
const VALUE_EXAMPLES: Record<string, string> = {
  [LEI_TYPE_NAME]:  '5493001KJTIIGC8Y1R12',
  [ISIN_TYPE_NAME]: 'US0378331005',
};

@Component({
  selector: 'app-modal-identifier',
  templateUrl: './modal-identifier.component.html',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalIdentifierComponent {
  modalService = inject(ModalIdentifierService);
  private fb = inject(FormBuilder);

  identifierForm = this.fb.group({
    idType: [0, Validators.required],
    value:  ['', Validators.required],
    reason: [''],
  });

  // Live format error as an i18n KEY ('' = acceptable). A signal rather than an Angular
  // validator because the rule depends on the SELECTED TYPE, not on the control alone —
  // switching from Tax ID to LEI has to re-judge a value that is already typed.
  formatError = signal('');

  // The type is IMMUTABLE while editing an existing row. Rebinding a value under a
  // different type is not an edit — for an entity it would leave the original hash bound
  // under the original type and add a second one, which is not what "change my LEI" means.
  isEdit = computed(() => this.modalService.input().idType != null);

  showReason = computed(() => this.modalService.input().showReason !== false);

  selectedTypeName = computed(() => {
    const id = Number(this.identifierForm.controls.idType.value);
    return this.modalService.input().idTypes.find(t => t.variableId === id)?.name ?? '';
  });

  valueExample = signal('');

  constructor() {
    // Reset on open. `untracked` is required: the body WRITES form state while the effect
    // TRACKS isVisible, so reading those writes back would re-run it forever and hang the
    // page (the platform's standing modal-effect rule).
    effect(() => {
      const visible = this.modalService.isVisible();
      if (!visible) return;
      untracked(() => {
        const input = this.modalService.input();
        this.identifierForm.reset({
          idType: input.idType ?? (input.idTypes[0]?.variableId ?? 0),
          value:  input.value ?? '',
          reason: '',
        });
        this.formatError.set('');
        this.refreshExample();
      });
    });
  }

  private refreshExample() {
    this.valueExample.set(VALUE_EXAMPLES[this.selectedTypeName()] ?? '');
  }

  // Re-judged on every keystroke AND on a type change, so the submit button reflects the
  // pair rather than the value alone.
  onValueChanged() {
    const value = String(this.identifierForm.controls.value.value ?? '');
    this.formatError.set(value ? validateIdentifierValue(this.selectedTypeName(), value) : '');
  }

  onTypeChanged() {
    this.refreshExample();
    this.onValueChanged();
  }

  canSave(): boolean {
    return this.identifierForm.valid
      && !this.formatError()
      && !!String(this.identifierForm.controls.value.value ?? '').trim()
      && Number(this.identifierForm.controls.idType.value) > 0;
  }

  onSave() {
    if (!this.canSave()) return;
    const raw = this.identifierForm.getRawValue();
    const typeName = this.selectedTypeName();

    // Final check before emitting — a paste can bypass the input event.
    const error = validateIdentifierValue(typeName, String(raw.value ?? ''));
    if (error) { this.formatError.set(error); return; }

    this.modalService.confirm({
      idType: Number(raw.idType),
      // Normalized here so the value the user is shown in the confirmation is the value
      // that gets stored — the API applies the identical rule.
      value:  normalizeIdentifierValue(typeName, String(raw.value ?? '')),
      reason: String(raw.reason ?? '').trim(),
    });
  }

  onCancel() {
    this.modalService.cancel();
  }
}
