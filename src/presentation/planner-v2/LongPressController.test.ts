import { afterEach, describe, expect, it, vi } from 'vitest';
import { LongPressController } from './LongPressController';

afterEach(() => vi.useRealTimers());

describe('entity long press gesture', () => {
  it('leaves an ordinary tap alone and opens only after the hold threshold', () => {
    vi.useFakeTimers();
    const opened = vi.fn();
    const gesture = new LongPressController(opened);
    gesture.down(20, 20);
    vi.advanceTimersByTime(200);
    gesture.end();
    vi.advanceTimersByTime(1000);
    expect(opened).not.toHaveBeenCalled();
    expect(gesture.consumeClick()).toBe(false);
    gesture.down(20, 20);
    vi.advanceTimersByTime(519);
    expect(opened).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(opened).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2500);
    gesture.end();
    expect(gesture.consumeClick()).toBe(true);
    expect(gesture.consumeClick()).toBe(false);
  });

  it('cancels a scrolling touch and an OS pointer cancellation', () => {
    vi.useFakeTimers();
    const opened = vi.fn();
    const gesture = new LongPressController(opened);
    gesture.down(10, 10);
    gesture.move(10, 23);
    vi.advanceTimersByTime(700);
    expect(opened).not.toHaveBeenCalled();
    gesture.down(10, 10);
    gesture.cancel();
    vi.advanceTimersByTime(700);
    expect(opened).not.toHaveBeenCalled();
  });

  it('keeps a native touch context menu from clicking the card after a long hold', () => {
    vi.useFakeTimers();
    const gesture = new LongPressController(vi.fn());
    gesture.down(10, 10);
    vi.advanceTimersByTime(400);
    gesture.suppressTouchContextClick();
    vi.advanceTimersByTime(2500);
    gesture.end();
    expect(gesture.consumeClick()).toBe(true);
  });
});
