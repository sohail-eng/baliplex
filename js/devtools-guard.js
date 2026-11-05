window.BaliPlex = window.BaliPlex || {};

BaliPlex.devtools = (function () {
  const THRESHOLD_PX = 160;
  const CHECK_MS = 700;

  let open = false;
  let timer = null;
  const listeners = [];

  function sizeSuggestsOpen() {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    return widthGap > THRESHOLD_PX || heightGap > THRESHOLD_PX;
  }

  function check() {
    setOpen(sizeSuggestsOpen());
  }

  function setOpen(next) {
    if (open === next) return;
    open = next;
    listeners.forEach(function (listener) {
      try {
        listener(open);
      } catch (error) {
        console.warn(error);
      }
    });
  }

  function isOpen() {
    return open;
  }

  function onChange(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.push(listener);
    listener(open);
    return function () {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function start() {
    if (timer) return;
    check();
    timer = window.setInterval(check, CHECK_MS);
    window.addEventListener("resize", check);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    window.removeEventListener("resize", check);
  }

  return {
    start,
    stop,
    isOpen,
    onChange
  };
})();
