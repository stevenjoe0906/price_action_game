/** Both autoplay and held stepping use one candle per second at 1×. */
export function createReplayTimer(step: () => void, initialSpeed: number) {
  let speed = initialSpeed;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const arm = () => {
    timer = setInterval(step, 1000 / speed);
  };
  return {
    get running() {
      return timer !== null;
    },
    start(immediate = false) {
      if (timer !== null) return;
      if (immediate) step();
      arm();
    },
    setSpeed(next: number) {
      speed = next;
      if (timer !== null) {
        stop();
        arm();
      }
    },
    stop,
  };
}
