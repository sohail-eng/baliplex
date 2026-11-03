window.BaliPlex = window.BaliPlex || {};

BaliPlex.player = (function () {
  let player = null;
  let onError = null;

  function hasSource() {
    return !!(player && player.currentSrc());
  }

  function init(videoElement, options) {
    onError = options && options.onError ? options.onError : null;
    const onUserActive = options && options.onUserActive;
    const onUserInactive = options && options.onUserInactive;
    const onPlayRequest = options && options.onPlayRequest;

    player = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: "auto",
      fill: true,
      liveui: true,
      inactivityTimeout: 3000,
      playbackRates: [],
      // Keep BaliPlex shortcuts (channels / volume HUD); don't let Video.js steal arrows.
      userActions: {
        hotkeys: false
      },
      controlBar: {
        pictureInPictureToggle: false
      }
    });

    player.addClass("vjs-baliplex");
    player.el().setAttribute("tabindex", "0");

    player.on("error", function () {
      if (onError) {
        onError("Playback failed. This stream may be unavailable or unsupported.");
      }
    });

    if (typeof onUserActive === "function") {
      player.on("useractive", onUserActive);
    }

    if (typeof onUserInactive === "function") {
      player.on("userinactive", onUserInactive);
    }

    if (typeof onPlayRequest === "function") {
      player.ready(function () {
        const bigPlay = player.getChild("bigPlayButton");
        if (bigPlay) {
          const originalHandleClick = bigPlay.handleClick.bind(bigPlay);
          bigPlay.handleClick = function (event) {
            if (!hasSource()) {
              event.preventDefault();
              event.stopPropagation();
              onPlayRequest();
              return;
            }
            originalHandleClick(event);
          };
        }
      });

      player.on("play", function () {
        if (hasSource()) return;
        player.pause();
        onPlayRequest();
      });
    }

    return player;
  }

  function mountOverlay(element) {
    if (!player || !element) return;
    player.el().appendChild(element);
  }

  function play(url) {
    if (!player || !url) return;

    player.pause();
    player.error(null);

    player.src({
      src: url,
      type: "application/x-mpegURL"
    });

    const playPromise = player.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        /* Autoplay may be blocked until user interaction. */
      });
    }
  }

  function stop() {
    if (!player) return;
    player.pause();
    player.reset();
  }

  function getInstance() {
    return player;
  }

  function adjustVolume(delta) {
    if (!player) return 0;

    if (player.muted() && delta > 0) {
      player.muted(false);
    }

    const next = Math.min(1, Math.max(0, (player.volume() || 0) + delta));
    player.volume(next);

    if (next === 0) {
      player.muted(true);
    }

    return next;
  }

  function focus() {
    if (!player) return;
    const root = player.el();
    if (!root) return;
    root.setAttribute("tabindex", "0");
    try {
      root.focus({ preventScroll: true });
    } catch (error) {
      root.focus();
    }
  }

  function onFullscreenChange(handler) {
    if (!player || typeof handler !== "function") return;
    player.on("fullscreenchange", handler);
  }

  return {
    init,
    play,
    stop,
    getInstance,
    mountOverlay,
    hasSource,
    adjustVolume,
    focus,
    onFullscreenChange
  };
})();
