// A deliberate gesture starts one complete scene flight. No scroll-idle snapping.
export function nextSceneStop(progress, direction, stops, epsilon = .0001) {
  return direction > 0
    ? stops.find(stop => stop > progress + epsilon) ?? stops.at(-1)
    : [...stops].reverse().find(stop => stop < progress - epsilon) ?? stops[0];
}

export function createScrollJourney({ gsap, ScrollTrigger, getRange, onProgress, stops, isReducedMotion = () => false }) {
  gsap.registerPlugin(ScrollTrigger);
  let navigation = null, armed = true;
  const trigger = ScrollTrigger.create({
    id: 'portfolio-journey', start: 0, end: getRange,
    onUpdate: self => onProgress(self.progress),
    onRefresh: self => onProgress(self.progress),
  });
  const interrupt = () => { navigation?.kill(); navigation = null; };
  function goTo(progress, reducedMotion = isReducedMotion()) {
    interrupt();
    const position = { y: window.scrollY };
    const y = Math.max(0, Math.min(1, progress)) * getRange();
    if (reducedMotion) {
      window.scrollTo(0, y); ScrollTrigger.update();
      return;
    }
    navigation = gsap.to(position, {
      y, duration: 3, ease: 'none',
      onUpdate: () => { window.scrollTo(0, position.y); ScrollTrigger.update(); },
      onComplete: () => { navigation = null; },
    });
  }
  function step(direction) {
    // Consume input during the flight, rather than cancelling it or queuing scenes.
    if (!armed || navigation) { armed = false; return; }
    armed = false;
    const current = window.scrollY / getRange();
    const destination = nextSceneStop(current, direction, stops, 1 / getRange());
    if (Math.abs(destination - current) > 1 / getRange()) goTo(destination);
  }
  const observer = ScrollTrigger.observe({
    target: window, type: 'wheel,touch', wheelSpeed: -1,
    tolerance: 4, preventDefault: true, allowClicks: true,
    ignore: 'input,textarea,select,[contenteditable]',
    ignoreCheck: event => event.ctrlKey || event.metaKey
      || (event.type === 'wheel' && Math.abs(event.deltaX) > Math.abs(event.deltaY)),
    onUp: () => step(1), onDown: () => step(-1),
    onStop: () => { armed = true; }, onStopDelay: .2,
    onPress: () => { armed = true; },
  });
  const onKey = event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented
      || event.target?.closest?.('input,textarea,select,[contenteditable]')) return;
    if (!document.getElementById('video-modal')?.hidden) return;
    if (event.key === ' ' && event.target?.closest?.('button,a')) return;
    const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1
      : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
    if (direction) {
      event.preventDefault();
      if (!event.repeat && !navigation) { armed = true; step(direction); }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); goTo(event.key === 'Home' ? 0 : 1);
    }
  };
  window.addEventListener('keydown', onKey);
  return {
    interrupt,
    refresh() { trigger.refresh(); trigger.update(); },
    goTo,
    destroy() { interrupt(); observer.kill(); trigger.kill(); window.removeEventListener('keydown', onKey); },
  };
}
