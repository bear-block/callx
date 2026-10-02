import type {Call} from './index.js';

export type CallPresentation = 'hidden' | 'expanded' | 'minimized';
/** App-owned presentation only. Never sends commands or changes the native call state. */
export class CallxPresentationController {
  private _mode: CallPresentation = 'hidden';
  get mode(): CallPresentation { return this._mode; }
  private callId: string | undefined;
  private presentable = false;
  private presented = false;
  update(call: Call | null): void {
    if (call?.callId !== this.callId) { this.callId = call?.callId; this.presented = false; this._mode = 'hidden'; }
    this.presentable = !!call && call.state !== 'incoming' && call.state !== 'ended';
    if (!this.presentable) this._mode = 'hidden';
    else if (!this.presented) { this.presented = true; this._mode = 'expanded'; }
  }
  minimize(): void { if (this.presentable) this._mode = 'minimized'; }
  expand(): void { if (this.presentable) this._mode = 'expanded'; }
}
