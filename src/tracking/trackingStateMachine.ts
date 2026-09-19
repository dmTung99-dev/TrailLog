// src/tracking/trackingStateMachine.ts
export type TrackingState = 'idle' | 'recording' | 'paused' | 'stopped';
export type TrackingEvent = 'START' | 'PAUSE' | 'RESUME' | 'STOP';

const ALLOWED_TRANSITIONS: Record<TrackingState, Partial<Record<TrackingEvent, TrackingState>>> = {
  idle: { START: 'recording' },
  recording: { PAUSE: 'paused', STOP: 'stopped' },
  paused: { RESUME: 'recording', STOP: 'stopped' },
  stopped: {},
};

export class TrackingStateMachine {
  private currentState: TrackingState = 'idle';

  get state(): TrackingState {
    return this.currentState;
  }

  transition(event: TrackingEvent): TrackingState {
    const nextState = ALLOWED_TRANSITIONS[this.currentState][event];
    if (!nextState) {
      throw new Error(`Cannot ${event} from ${this.currentState}`);
    }
    this.currentState = nextState;
    return nextState;
  }
}
