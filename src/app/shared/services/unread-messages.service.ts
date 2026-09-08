import { inject, Injectable, signal } from '@angular/core';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { FeaturesService } from './features.service';
import { SocketService } from './socket.service';

/**
 * The ONE owner of the unread-messages badge count.
 *
 * 🔴 WHY THIS EXISTS — it is a fix for a measured request storm, not tidying. The header badge
 * and the sidebar badge each held their OWN `vaultUpdated$` subscription and each called
 * `connectInboxInfo()` on every event, so one server broadcast cost two identical HTTP fetches
 * of the same endpoint, forever. Measured on the Granite tenant 2026-09-08: 451 requests in a
 * single second, 140 of them to `/connect/inbox`, 2344 in twenty minutes — on an IDLE screen.
 * That exhausted the API's 10,000-per-15-minutes ceiling in roughly 22 seconds of use and
 * surfaced to the operator as "the Entity API broke" (a 429 is answered before the access log
 * is mounted, so it logs NOTHING).
 *
 * ⚠️ The endpoint was never polled — there is no timer and never was. Every call came from a
 * socket handler. So the fix is NOT "poll less"; it is one subscriber, one in-flight request,
 * and a trailing debounce so a burst of events collapses into a single fetch.
 *
 * ⚠️ SUBSCRIBE ONCE, HERE. If a component needs this number it must read {@link count} — adding
 * a second `vaultUpdated$` subscription that fetches the inbox re-creates the exact defect this
 * service was written to remove, and it will not be visible in any log until a tenant trips the
 * rate limit again.
 */
@Injectable({ providedIn: 'root' })
export class UnreadMessagesService {
    private apiService = inject(ApiService);
    private authService = inject(AuthService);
    private features = inject(FeaturesService);
    private socketService = inject(SocketService);

    /** Unread count for the active session. Read this; never fetch the inbox yourself. */
    readonly count = signal(0);

    /**
     * Trailing debounce. The server emits one `vault:updated` PER MIRRORED ROW (the Entity Sync
     * plugin notifies `connect:<block>` from 11 call sites), so a backfill or a multi-recipient
     * send arrives as a burst of dozens within the same second. Anything under a second is
     * imperceptible on a badge and collapses the whole burst into one request.
     */
    private static readonly DEBOUNCE_MS = 400;

    private timer: ReturnType<typeof setTimeout> | null = null;
    private inFlight = false;
    private queued = false;

    constructor() {
        // The single subscription. Root-scoped and never torn down, which is correct for a
        // singleton that lives as long as the app — and is why no component needs one.
        this.socketService.vaultUpdated$.subscribe(p => {
            if (p?.type === 'connect' || p?.type === 'all') this.refresh();
        });
    }

    /** Coalesced refresh — safe to call as often as you like. */
    refresh(): void {
        if (this.timer) return;                       // a fetch is already scheduled
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.run();
        }, UnreadMessagesService.DEBOUNCE_MS);
    }

    private async run(): Promise<void> {
        // In-flight guard. Without it a slow response lets the next burst stack requests on top
        // of one another rather than replacing them.
        if (this.inFlight) { this.queued = true; return; }

        if (!this.authService.userInfo) return;
        // Only ask when the Messages module is actually visible to this user — an auditor or a
        // viewer without the per-user grant would otherwise 403 on every event (swallowed, but
        // still a request per event).
        if (!this.features.menuEnabled('messages')) { this.count.set(0); return; }

        this.inFlight = true;
        try {
            const res: any = await this.apiService.connectInboxInfo();
            const n = Number(res?.inbox?.unread ?? 0);
            this.count.set(Number.isNaN(n) ? 0 : n);
        } catch {
            // Swallowed deliberately: a badge must never surface an error, and the next event
            // retries. Leaves the previous count rather than zeroing it, so a transient failure
            // does not read as "you have no messages".
        } finally {
            this.inFlight = false;
            if (this.queued) { this.queued = false; this.refresh(); }
        }
    }
}
