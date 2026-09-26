import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { forwardServerOutput } from './server-output.mjs';

class DestinationStream extends EventEmitter {
  write = vi.fn(() => true);
}

describe('server output forwarding', () => {
  it('prefixes and forwards server output while the destination is open', () => {
    const source = new EventEmitter();
    const destination = new DestinationStream();

    forwardServerOutput(source, destination);
    source.emit('data', 'ready\n');

    expect(destination.write).toHaveBeenCalledWith('[vinext] ready\n');
  });

  it('stops forwarding after a closed destination reports EPIPE', () => {
    const source = new EventEmitter();
    const destination = new DestinationStream();

    forwardServerOutput(source, destination);
    source.emit('data', 'first\n');
    destination.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    source.emit('data', 'second\n');

    expect(destination.write).toHaveBeenCalledTimes(1);
    expect(source.listenerCount('data')).toBe(0);
    expect(destination.listenerCount('error')).toBe(0);
  });

  it('stops forwarding when a synchronous write throws EPIPE', () => {
    const source = new EventEmitter();
    const destination = new DestinationStream();
    destination.write.mockImplementation(() => {
      throw Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
    });

    forwardServerOutput(source, destination);

    expect(() => source.emit('data', 'first\n')).not.toThrow();
    source.emit('data', 'second\n');

    expect(destination.write).toHaveBeenCalledTimes(1);
    expect(source.listenerCount('data')).toBe(0);
    expect(destination.listenerCount('error')).toBe(0);
  });

  it('preserves visibility of non-EPIPE destination errors', () => {
    const source = new EventEmitter();
    const destination = new DestinationStream();

    forwardServerOutput(source, destination);

    expect(() => destination.emit('error', Object.assign(new Error('disk failure'), { code: 'EIO' }))).toThrow('disk failure');
  });
});
