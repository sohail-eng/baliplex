window.BaliPlex = window.BaliPlex || {};

BaliPlex.player = (function () {
  let player = null;
  let onError = null;

  function init(videoElement, options) {
    onError = options && options.onError ? options.onError : null;

    player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      preload: "auto",
      fill: true,
      liveui: true,
      playbackRates: [],
      controlBar: {
        pictureInPictureToggle: false
      }
    });

    player.addClass("vjs-baliplex");

    player.on("error", function () {
      if (onError) {
        onError("Playback failed. This stream may be unavailable or unsupported.");
      }
    });

    return player;
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

  return {
    init,
    play,
    stop,
    getInstance
  };
})();
