// src/tracking/trackingStateMachine.test.ts
import { TrackingStateMachine } from './trackingStateMachine';

describe('TrackingStateMachine', () => {
  it('goes idle -> recording -> paused -> recording -> stopped', () => {
    const machine = new TrackingStateMachine();
    expect(machine.state).toBe('idle');

    machine.transition('START');
    expect(machine.state).toBe('recording');

    machine.transition('PAUSE');
    expect(machine.state).toBe('paused');

    machine.transition('RESUME');
    expect(machine.state).toBe('recording');

    machine.transition('STOP');
    expect(machine.state).toBe('stopped');
  });

  it('rejects PAUSE when idle', () => {
    const machine = new TrackingStateMachine();
    expect(() => machine.transition('PAUSE')).toThrow('Cannot PAUSE from idle');
  });

  it('rejects START when already recording', () => {
    const machine = new TrackingStateMachine();
    machine.transition('START');
    expect(() => machine.transition('START')).toThrow('Cannot START from recording');
  });

  it('rejects any transition once stopped', () => {
    const machine = new TrackingStateMachine();
    machine.transition('START');
    machine.transition('STOP');
    expect(() => machine.transition('RESUME')).toThrow('Cannot RESUME from stopped');
  });
});
