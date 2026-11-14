window.BaliPlex = window.BaliPlex || {};

BaliPlex.player = (function () {
  let player = null;
  let onError = null;

  function hasSource() {
    return !!(player && player.currentSrc());
  }

  function sourceTypeForUrl(url) {
    const path = String(url || "")
      .split(/[?#]/)[0]
      .toLowerCase();

    if (path.endsWith(".mpd")) {
      return "application/dash+xml";
    }

    if (path.endsWith(".m3u8") || path.endsWith(".m3u")) {
      return "application/x-mpegURL";
    }

    // Most IPTV sources are HLS even without a clear extension.
    return "application/x-mpegURL";
  }

  function init(videoElement, options) {
    onError = options && options.onError ? options.onError : null;
    const onPlaying = options && options.onPlaying;
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
      },
      html5: {
        vhs: {
          overrideNative: true
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false
      }
    });

    player.addClass("vjs-baliplex");
    player.el().setAttribute("tabindex", "0");

    player.on("error", function () {
      if (!onError) return;

      const mediaError = player.error();
      const message =
        (mediaError && mediaError.message) ||
        "The media could not be loaded, either because the server or network failed or because the format is not supported.";
      onError(message);
    });

    if (typeof onPlaying === "function") {
      player.on("playing", onPlaying);
    }

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

  function attemptPlay(preferAutoplay) {
    const playPromise = player.play();
    if (!playPromise || typeof playPromise.then !== "function") return;

    playPromise.catch(function () {
      if (!preferAutoplay) return;

      // Browsers often block unmuted autoplay on a fresh page load.
      // Start muted so playback begins, then restore sound if allowed.
      player.muted(true);
      return player.play().then(function () {
        player.one("playing", function () {
          try {
            player.muted(false);
          } catch (error) {
            /* Keep muted if the browser refuses unmuted playback. */
          }
        });
      });
    }).catch(function () {
      /* Autoplay still blocked until the user presses play. */
    });
  }

  function play(url, options) {
    if (!player || !url) return;

    const opts = options || {};
    const preferAutoplay = !!opts.preferAutoplay;

    player.ready(function () {
      player.pause();
      player.error(null);

      if (!preferAutoplay) {
        player.muted(false);
      }

      player.src({
        src: url,
        type: sourceTypeForUrl(url)
      });

      attemptPlay(preferAutoplay);
    });
  }

  function whenReady(callback) {
    if (!player || typeof callback !== "function") return;
    player.ready(callback);
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
    whenReady,
    onFullscreenChange,
    sourceTypeForUrl
  };
})();
