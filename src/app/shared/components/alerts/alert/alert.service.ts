import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  isVisible = signal(false);
  title = signal('');
  message = signal('');
  confirmText = signal('OK');
  maxWidth = signal('max-w-md');
  // When true, the dialog shows only the confirm button (use for informational/success messages
  // where a "Cancel" makes no sense).
  hideCancel = signal(false);

  private resolveFn?: (value: boolean) => void;

  show(title: string, message: string, confirmText = 'OK', maxWidth = 'max-w-md', hideCancel = false): Promise<boolean> {
    this.title.set(title);
    this.message.set(message);
    this.confirmText.set(confirmText);
    this.maxWidth.set(maxWidth);
    this.hideCancel.set(hideCancel);
    this.isVisible.set(true);

    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  /**
   * An INFORMATIONAL dialog: one button, no Cancel.
   *
   * ─── 🔴 WHY THIS EXISTS RATHER THAN `show(..., true)` AT EACH SITE ───────────────────────
   * `hideCancel` is the FIFTH parameter, so reaching it means also supplying `confirmText` and
   * `maxWidth`. Many call sites already pass custom values for those, so a mechanical sweep that
   * filled in defaults to reach the fifth would silently overwrite a custom label or width — and
   * nothing would fail, in either the build or the tests. Across 277 edits that is not a risk, it
   * is a certainty somewhere.
   *
   * `info` takes the arguments a notification actually has, so the sweep is
   * `show(` -> `info(` and NOTHING ELSE MOVES: arity, custom labels and widths are all
   * preserved by construction.
   *
   * ─── WHEN TO USE WHICH ───────────────────────────────────────────────────────────────────
   * ⚠️ The test is NOT "does this feel informational" — it is whether the RETURNED BOOLEAN IS
   * USED. If the answer is discarded, the dialog cannot be a question: `cancel()` and `confirm()`
   * both resolve a promise nobody reads, so the two buttons do exactly the same thing and one of
   * them is a lie. Use `info`.
   *
   * If the boolean IS consumed, it is a real confirmation — keep `show`. Removing Cancel there
   * would remove the ability to decline, which is the actual harm.
   */
  info(title: string, message: string, confirmText = 'OK', maxWidth = 'max-w-md'): Promise<boolean> {
    return this.show(title, message, confirmText, maxWidth, true);
  }

  confirm(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(true);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(false);
    }
  }
}
