(function () {
  const {
    PLAYLIST_URL,
    COUNTRIES_URL,
    CHANNELS_STORAGE_KEY,
    BLOCK_WHEN_DEVTOOLS_OPEN
  } = BaliPlex.config;
  const { parseM3U, identifyCountry } = BaliPlex.parser;
  const favouritesApi = BaliPlex.favourites;
  const shareApi = BaliPlex.share;
  const devtoolsApi = BaliPlex.devtools;

  let channels = [];
  let countries = [];
  let countryMap = new Map();
  let filteredChannels = [];
  let activeChannel = null;
  let sharedChannel = null;
  let sharedFavouritesChannels = [];
  let countrySelect = null;
  let categorySelect = null;
  let listMode = "favourites";
  let playlistLoaded = false;
  let playlistLoading = false;
  let autoRefreshDone = false;
  let listCursorIndex = -1;
  let visibleCount = 0;
  let loadingMore = false;
  let playbackErrorTimer = null;
  let playbackStallTimer = null;
  let playbackGeneration = 0;
  let shareFeedbackTimer = null;

  const PAGE_SIZE = 20;
  const MEDIA_ERROR_SKIP_MS = 5000;
  const PLAYLIST_STALL_SKIP_MS = 10000;

  const HEART_OUTLINE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  const HEART_FILLED =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" fill="currentColor"/></svg>';

  const CHANNEL_PLACEHOLDER =
    '<svg class="channel-logo-fallback" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 19h8M12 17v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><circle cx="15" cy="11" r="1.2" fill="currentColor"/></svg>';

  const els = {
    totalChannels: document.getElementById("totalChannels"),
    status: document.getElementById("status"),
    search: document.getElementById("search"),
    countryFilter: document.getElementById("countryFilter"),
    categoryFilter: document.getElementById("categoryFilter"),
    channelList: document.getElementById("channelList"),
    channelTitle: document.getElementById("channelTitle"),
    channelDetails: document.getElementById("channelDetails"),
    refreshBtn: document.getElementById("refreshBtn"),
    playbackToggle: document.getElementById("playbackToggle"),
    playbackToggleLabel: document.getElementById("playbackToggleLabel"),
    shareChannel: document.getElementById("shareChannel"),
    prevBtn: document.getElementById("prevChannel"),
    nextBtn: document.getElementById("nextChannel"),
    playerStage: document.getElementById("playerStage"),
    playerShell: document.querySelector(".player-shell"),
    listFavouritesBtn: document.getElementById("listFavouritesBtn"),
    listAllBtn: document.getElementById("listAllBtn"),
    shareFavouritesBtn: document.getElementById("shareFavouritesBtn"),
    filtersPanel: document.getElementById("filtersPanel"),
    volumeHud: document.getElementById("volumeHud"),
    volumeHudValue: document.getElementById("volumeHudValue"),
    volumeTubeSteps: document.getElementById("volumeTubeSteps"),
    devtoolsGuard: document.getElementById("devtoolsGuard"),
    sharedFavouritesModal: document.getElementById("sharedFavouritesModal"),
    sharedFavouritesClose: document.getElementById("sharedFavouritesClose"),
    sharedFavouritesLoading: document.getElementById("sharedFavouritesLoading"),
    sharedFavouritesLoadingText: document.getElementById(
      "sharedFavouritesLoadingText"
    ),
    sharedFavouritesList: document.getElementById("sharedFavouritesList"),
    sharedFavouritesEmpty: document.getElementById("sharedFavouritesEmpty"),
    sharedFavouritesAddAll: document.getElementById("sharedFavouritesAddAll")
  };

  const VOLUME_STEP = 0.05;
  const VOLUME_DOT_COUNT = 20;
  let volumeHudHideTimer = null;
  let volumeHudRemoveTimer = null;
  let volumeDots = [];

  function setStatus(message) {
    els.status.textContent = message;
  }

  function setPlayerNavVisible(visible) {
    const player = BaliPlex.player.getInstance();
    const root = player ? player.el() : null;
    if (root) root.classList.toggle("nav-visible", visible);
    if (els.playerShell) els.playerShell.classList.toggle("nav-visible", visible);
  }

  function updateNavButtons() {
    const canNavigate = filteredChannels.length > 1;
    els.prevBtn.disabled = !canNavigate;
    els.nextBtn.disabled = !canNavigate;
  }

  function updateModeTabs() {
    const favCount = favouritesApi.count();
    els.listFavouritesBtn.classList.toggle("is-active", listMode === "favourites");
    els.listAllBtn.classList.toggle("is-active", listMode === "all");
    els.listFavouritesBtn.setAttribute("aria-pressed", String(listMode === "favourites"));
    els.listAllBtn.setAttribute("aria-pressed", String(listMode === "all"));
    els.listFavouritesBtn.textContent =
      favCount > 0 ? "Favourites (" + favCount + ")" : "Favourites";

    if (els.shareFavouritesBtn) {
      els.shareFavouritesBtn.hidden = favCount === 0;
      els.shareFavouritesBtn.disabled = favCount === 0;
    }

    document.body.classList.toggle("mode-favourites", listMode === "favourites");
    document.body.classList.toggle("mode-all", listMode === "all");
    document.body.classList.toggle("has-favourites", favCount > 0);
  }

  function updateHeaderCount() {
    if (listMode === "favourites") {
      const count = favouritesApi.count();
      els.totalChannels.textContent =
        count.toLocaleString() + (count === 1 ? " Favourite" : " Favourites");
      return;
    }

    if (!playlistLoaded) {
      els.totalChannels.textContent = "All Channels";
      return;
    }

    els.totalChannels.textContent =
      channels.length.toLocaleString() + " Channels";
  }

  function getActiveIndex() {
    if (!activeChannel) return -1;
    const key = favouritesApi.channelKey(activeChannel);
    return filteredChannels.findIndex(function (channel) {
      return favouritesApi.channelKey(channel) === key;
    });
  }

  function scrollActiveIntoView() {
    const active = els.channelList.querySelector(".channel.active");
    if (active) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function sameChannel(a, b) {
    if (!a || !b) return false;
    return favouritesApi.channelKey(a) === favouritesApi.channelKey(b);
  }

  function isDevtoolsBlocked() {
    return !!(
      BLOCK_WHEN_DEVTOOLS_OPEN &&
      devtoolsApi &&
      typeof devtoolsApi.isOpen === "function" &&
      devtoolsApi.isOpen()
    );
  }

  function setDevtoolsBlocked(blocked) {
    document.body.classList.toggle("devtools-blocked", blocked);
    if (els.devtoolsGuard) {
      els.devtoolsGuard.hidden = !blocked;
    }

    if (blocked) {
      stopStreaming();
    }
  }

  function initDevtoolsGuard() {
    if (!BLOCK_WHEN_DEVTOOLS_OPEN || !devtoolsApi) return;

    devtoolsApi.onChange(setDevtoolsBlocked);
    devtoolsApi.start();
  }

  async function loadMetadata() {
    if (isDevtoolsBlocked()) {
      throw new Error("Close DevTools to continue.");
    }

    const response = await fetch(COUNTRIES_URL);
    if (!response.ok) {
      throw new Error("Could not load country metadata.");
    }

    countries = await response.json();
    countryMap = new Map();

    countries.forEach(function (country) {
      const code = String(country.code || "").toUpperCase();
      if (code) countryMap.set(code, country);
    });
  }

  function populateCountries() {
    const options = [{ value: "", text: "All Countries" }].concat(
      [...countries]
        .sort(function (a, b) {
          return a.name.localeCompare(b.name);
        })
        .map(function (country) {
          return {
            value: country.code.toUpperCase(),
            text: country.name
          };
        })
    );

    if (countrySelect) {
      countrySelect.clearOptions();
      countrySelect.addOptions(options);
      countrySelect.setValue("", true);
    }
  }

  function populateCategoriesFrom(source) {
    const categories = [
      ...new Set(
        source
          .map(function (channel) {
            return channel.group;
          })
          .filter(Boolean)
      )
    ].sort();

    const options = [{ value: "", text: "All Categories" }].concat(
      categories.map(function (category) {
        return { value: category, text: category };
      })
    );

    if (categorySelect) {
      categorySelect.clearOptions();
      categorySelect.addOptions(options);
      categorySelect.setValue("", true);
    }
  }

  function getFilterValues() {
    const search = els.search.value.toLowerCase().trim();
    const selectedCountry = countrySelect ? countrySelect.getValue() : "";
    const selectedCategory = categorySelect ? categorySelect.getValue() : "";
    return { search, selectedCountry, selectedCategory };
  }

  function getFavouritesWithShared() {
    const favs = favouritesApi.list();
    if (!sharedChannel) return favs;

    const sharedKey = favouritesApi.channelKey(sharedChannel);
    const rest = favs.filter(function (channel) {
      return favouritesApi.channelKey(channel) !== sharedKey;
    });
    return [sharedChannel].concat(rest);
  }

  function getSourceChannels() {
    if (listMode === "favourites") {
      return getFavouritesWithShared();
    }
    return channels;
  }

  function computeFiltered() {
    const { search, selectedCountry, selectedCategory } = getFilterValues();
    const source = getSourceChannels();

    return source.filter(function (channel) {
      const matchesSearch =
        !search ||
        channel.name.toLowerCase().includes(search) ||
        (channel.id || "").toLowerCase().includes(search);

      const countryCode = channel.countryInfo?.code?.toUpperCase() ||
        (channel.country || "").toUpperCase();

      const matchesCountry =
        !selectedCountry || countryCode === selectedCountry;

      const matchesCategory =
        !selectedCategory || channel.group === selectedCategory;

      return matchesSearch && matchesCountry && matchesCategory;
    });
  }

  function renderEmptyFavourites() {
    els.channelList.innerHTML = "";

    const empty = document.createElement("div");
    empty.className = "empty empty-favourites";

    const title = document.createElement("p");
    title.className = "empty-title";
    title.textContent = "No favourites yet";

    const copy = document.createElement("p");
    copy.textContent =
      "Browse all channels and tap the heart to save the ones you love.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-btn";
    button.textContent = "Show all channels";
    button.addEventListener("click", function () {
      showAllChannels();
    });

    empty.appendChild(title);
    empty.appendChild(copy);
    empty.appendChild(button);
    els.channelList.appendChild(empty);
  }

  function syncHeartButton(button, channel) {
    const fav = favouritesApi.isFavourite(channel);
    button.classList.toggle("is-active", fav);
    button.setAttribute("aria-pressed", String(fav));
    button.title = fav ? "Remove from favourites" : "Add to favourites";
    button.setAttribute(
      "aria-label",
      fav ? "Remove from favourites" : "Add to favourites"
    );
    button.innerHTML = fav ? HEART_FILLED : HEART_OUTLINE;
  }

  function createHeartButton(channel, options) {
    const opts = options || {};
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fav-btn";
    syncHeartButton(button, channel);

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      favouritesApi.toggle(channel);
      updateModeTabs();
      updateHeaderCount();
      syncHeartButton(button, channel);

      if (listMode === "favourites") {
        populateCategoriesFrom(getFavouritesWithShared());
        renderChannels();
      }

      if (typeof opts.onToggle === "function") {
        opts.onToggle(favouritesApi.isFavourite(channel));
      }
    });

    return button;
  }

  function usesPagedList() {
    return listMode === "all";
  }

  function getRenderLimit() {
    if (!usesPagedList()) return filteredChannels.length;
    return Math.min(visibleCount, filteredChannels.length);
  }

  function updateAllListStatus() {
    if (listMode !== "all" || !filteredChannels.length) return;

    const shown = getRenderLimit();
    const total = filteredChannels.length;
    setStatus(
      "Showing " +
        shown.toLocaleString() +
        " of " +
        total.toLocaleString() +
        " channels"
    );
  }

  function removeLoadMoreMarker() {
    const marker = els.channelList.querySelector(".list-load-more");
    if (marker) marker.remove();
  }

  function syncLoadMoreMarker() {
    removeLoadMoreMarker();
    if (!usesPagedList()) return;
    if (getRenderLimit() >= filteredChannels.length) return;

    const marker = document.createElement("div");
    marker.className = "list-load-more";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = loadingMore ? "Loading more…" : "Scroll for more";
    els.channelList.appendChild(marker);
  }

  function createChannelLogo(channel) {
    const wrap = document.createElement("div");
    wrap.className = "channel-logo";

    if (!channel.logo) {
      wrap.classList.add("is-fallback");
      wrap.innerHTML = CHANNEL_PLACEHOLDER;
      return wrap;
    }

    const logo = document.createElement("img");
    logo.src = channel.logo;
    logo.alt = "";
    logo.decoding = "async";
    logo.onerror = function () {
      wrap.classList.add("is-fallback");
      wrap.innerHTML = CHANNEL_PLACEHOLDER;
    };
    wrap.appendChild(logo);
    return wrap;
  }

  function updateChannelSelectionUI() {
    const items = els.channelList.querySelectorAll(".channel");
    items.forEach(function (item, index) {
      const channel = filteredChannels[index];
      const isActive = sameChannel(activeChannel, channel);
      const isCursor = index === listCursorIndex;
      item.classList.toggle("active", isActive);
      item.classList.toggle("is-cursor", isCursor);
      item.setAttribute("aria-selected", String(isActive));
    });

    if (listCursorIndex >= 0) {
      els.channelList.setAttribute(
        "aria-activedescendant",
        "channel-option-" + listCursorIndex
      );
    }
  }

  function createChannelItem(channel, index) {
    const item = document.createElement("div");
    item.className =
      "channel" +
      (sameChannel(activeChannel, channel) ? " active" : "") +
      (index === listCursorIndex ? " is-cursor" : "");
    item.setAttribute("role", "option");
    item.id = "channel-option-" + index;
    item.setAttribute(
      "aria-selected",
      String(sameChannel(activeChannel, channel))
    );
    item.tabIndex = -1;

    const info = document.createElement("div");
    info.className = "channel-info";

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = channel.name;

    const meta = document.createElement("div");
    meta.className = "channel-meta";
    const countryName =
      channel.countryInfo?.name || channel.countryName || "Unknown Country";
    meta.textContent = countryName + " · " + channel.group;

    info.appendChild(name);
    info.appendChild(meta);

    item.appendChild(createChannelLogo(channel));
    item.appendChild(info);
    item.appendChild(createHeartButton(channel));

    item.addEventListener("click", function () {
      listCursorIndex = index;
      playChannel(channel);
    });

    return item;
  }

  function appendChannelRange(fromIndex, toIndex) {
    removeLoadMoreMarker();

    const fragment = document.createDocumentFragment();
    for (let index = fromIndex; index < toIndex; index += 1) {
      fragment.appendChild(createChannelItem(filteredChannels[index], index));
    }
    els.channelList.appendChild(fragment);
    syncLoadMoreMarker();
  }

  function ensureVisibleThrough(index) {
    if (!usesPagedList() || index < 0) return false;
    if (index < visibleCount) return false;

    const nextCount = Math.min(
      filteredChannels.length,
      Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE
    );
    if (nextCount <= visibleCount) return false;

    const fromIndex = visibleCount;
    visibleCount = nextCount;
    appendChannelRange(fromIndex, visibleCount);
    updateAllListStatus();
    return true;
  }

  function loadMoreChannels() {
    if (!usesPagedList() || loadingMore) return;
    if (visibleCount >= filteredChannels.length) return;

    loadingMore = true;
    const fromIndex = visibleCount;
    visibleCount = Math.min(
      filteredChannels.length,
      visibleCount + PAGE_SIZE
    );
    appendChannelRange(fromIndex, visibleCount);
    loadingMore = false;
    updateAllListStatus();
  }

  function maybeLoadMoreFromScroll() {
    if (!usesPagedList() || loadingMore) return;
    if (visibleCount >= filteredChannels.length) return;

    const list = els.channelList;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 160) {
      loadMoreChannels();
    }
  }

  function renderChannels(options) {
    const opts = options || {};
    updateModeTabs();
    updateHeaderCount();

    if (listMode === "favourites" && favouritesApi.count() === 0 && !sharedChannel) {
      filteredChannels = [];
      visibleCount = 0;
      updateNavButtons();
      renderEmptyFavourites();
      setStatus("Save channels with the heart icon");
      return;
    }

    filteredChannels = computeFiltered();
    updateNavButtons();

    if (!filteredChannels.length) {
      visibleCount = 0;
      els.channelList.innerHTML =
        '<div class="empty">No channels found.</div>';
      return;
    }

    if (usesPagedList()) {
      if (opts.resetPage || !visibleCount) {
        visibleCount = Math.min(PAGE_SIZE, filteredChannels.length);
      } else {
        visibleCount = Math.min(
          Math.max(visibleCount, PAGE_SIZE),
          filteredChannels.length
        );
      }
    } else {
      visibleCount = filteredChannels.length;
    }

    if (listCursorIndex < 0 || listCursorIndex >= filteredChannels.length) {
      const activeIndex = getActiveIndex();
      listCursorIndex = activeIndex >= 0 ? activeIndex : 0;
    }

    if (usesPagedList() && listCursorIndex >= visibleCount) {
      visibleCount = Math.min(
        filteredChannels.length,
        Math.ceil((listCursorIndex + 1) / PAGE_SIZE) * PAGE_SIZE
      );
    }

    const limit = getRenderLimit();
    els.channelList.innerHTML = "";

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < limit; index += 1) {
      fragment.appendChild(createChannelItem(filteredChannels[index], index));
    }
    els.channelList.appendChild(fragment);
    syncLoadMoreMarker();

    els.channelList.setAttribute(
      "aria-activedescendant",
      "channel-option-" + listCursorIndex
    );

    if (listMode === "favourites") {
      setStatus(
        favouritesApi.count().toLocaleString() +
          " favourite" +
          (favouritesApi.count() === 1 ? "" : "s")
      );
    } else {
      updateAllListStatus();
    }
  }

  function clearPlaybackErrorSkip() {
    if (playbackErrorTimer) {
      clearTimeout(playbackErrorTimer);
      playbackErrorTimer = null;
    }
  }

  function clearPlaybackStallSkip() {
    if (playbackStallTimer) {
      clearTimeout(playbackStallTimer);
      playbackStallTimer = null;
    }
  }

  function clearPlaybackSkipTimers() {
    clearPlaybackErrorSkip();
    clearPlaybackStallSkip();
  }

  function scheduleChannelSkip(message, delayMs, generation) {
    clearPlaybackErrorSkip();

    if (generation !== playbackGeneration) return;

    if (filteredChannels.length < 2) {
      els.channelDetails.textContent = message;
      return;
    }

    const seconds = Math.round(delayMs / 1000);
    els.channelDetails.textContent =
      message + " Trying next channel in " + seconds + "s…";

    playbackErrorTimer = setTimeout(function () {
      playbackErrorTimer = null;
      // User already changed channel — never skip away from a working one.
      if (generation !== playbackGeneration) return;
      playRelative(1);
    }, delayMs);
  }

  function scheduleSkipAfterPlaybackError(message) {
    // Hard media errors should move on faster.
    clearPlaybackStallSkip();
    scheduleChannelSkip(message, MEDIA_ERROR_SKIP_MS, playbackGeneration);
  }

  function armPlaylistStallWatchdog(generation) {
    clearPlaybackStallSkip();

    // Covers DASH/HLS playlist retry loops that warn but never hard-error.
    playbackStallTimer = setTimeout(function () {
      playbackStallTimer = null;
      if (generation !== playbackGeneration) return;

      if (filteredChannels.length < 2) {
        els.channelDetails.textContent =
          "Stream is not responding. The playlist may be unavailable.";
        return;
      }

      els.channelDetails.textContent =
        "Stream is not responding. Trying next channel…";
      playRelative(1);
    }, PLAYLIST_STALL_SKIP_MS);
  }

  function setPlaybackToggleState(state) {
    if (!els.playbackToggle) return;

    const isStop = state === "stop";
    const label = isStop ? "Stop" : "Start";
    const title = isStop ? "Stop streaming" : "Start streaming";

    els.playbackToggle.dataset.state = isStop ? "stop" : "start";
    els.playbackToggle.title = title;
    els.playbackToggle.setAttribute("aria-label", title);
    els.playbackToggle.disabled = !activeChannel;

    if (els.shareChannel) {
      els.shareChannel.disabled = !activeChannel;
    }

    if (els.playbackToggleLabel) {
      els.playbackToggleLabel.textContent = label;
    }
  }

  function stopStreaming() {
    clearPlaybackSkipTimers();
    playbackGeneration += 1;

    BaliPlex.player.stop();
    setPlayerNavVisible(false);
    els.playerStage.classList.remove("is-playing");
    setPlaybackToggleState("start");

    if (activeChannel) {
      els.channelDetails.textContent =
        "Streaming stopped. Press Start to resume this channel.";
    } else {
      els.channelTitle.textContent = "Select a channel";
      els.channelDetails.textContent =
        "Choose a channel from the list to start watching.";
    }
  }

  function startStreaming() {
    if (isDevtoolsBlocked()) return;
    if (!activeChannel) return;
    playChannel(activeChannel);
  }

  function togglePlayback() {
    if (!els.playbackToggle || els.playbackToggle.disabled) return;

    if (els.playbackToggle.dataset.state === "stop") {
      stopStreaming();
      return;
    }

    startStreaming();
  }

  function playChannel(channel, options) {
    if (isDevtoolsBlocked()) {
      setDevtoolsBlocked(true);
      return;
    }

    const opts = options || {};

    clearPlaybackSkipTimers();
    playbackGeneration += 1;
    const generation = playbackGeneration;

    const keepListFocus =
      isInChannelList(document.activeElement) ||
      document.activeElement === els.channelList;

    activeChannel = channel;
    const playingIndex = filteredChannels.findIndex(function (item) {
      return sameChannel(item, channel);
    });
    if (playingIndex >= 0) {
      listCursorIndex = playingIndex;
      ensureVisibleThrough(playingIndex);
    }

    els.channelTitle.textContent = channel.name;
    els.channelDetails.textContent =
      (channel.countryInfo?.name ||
        channel.countryName ||
        "Unknown Country") +
      " · " +
      channel.group;

    els.playerStage.classList.remove("is-playing");
    void els.playerStage.offsetWidth;
    els.playerStage.classList.add("is-playing");
    setPlayerNavVisible(true);
    setPlaybackToggleState("stop");

    BaliPlex.player.play(channel.url, {
      preferAutoplay: !!opts.preferAutoplay
    });
    armPlaylistStallWatchdog(generation);
    updateChannelSelectionUI();
    scrollActiveIntoView();

    if (keepListFocus) {
      els.channelList.focus({ preventScroll: true });
    } else if (window.matchMedia("(max-width: 900px)").matches) {
      els.playerStage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function playRelative(offset) {
    if (filteredChannels.length < 2) return;

    let index = getActiveIndex();
    if (index < 0) index = 0;
    else if (usesPagedList() && visibleCount < filteredChannels.length) {
      index = Math.max(
        0,
        Math.min(filteredChannels.length - 1, index + offset)
      );
    } else {
      index =
        (index + offset + filteredChannels.length) % filteredChannels.length;
    }

    ensureVisibleThrough(index);
    playChannel(filteredChannels[index]);
  }

  function playFirstAvailable() {
    if (BaliPlex.player.hasSource() && activeChannel) {
      return;
    }

    if (!filteredChannels.length) {
      els.channelDetails.textContent =
        listMode === "favourites" && favouritesApi.count() === 0
          ? "Add a favourite or open All channels, then press play."
          : "No channels in the current list.";
      return;
    }

    playChannel(filteredChannels[0]);
  }

  function buildVolumeTube() {
    if (!els.volumeTubeSteps) return;

    els.volumeTubeSteps.innerHTML = "";
    volumeDots = [];

    for (let i = 1; i <= VOLUME_DOT_COUNT; i += 1) {
      const dot = document.createElement("span");
      dot.className = "volume-dot";
      dot.dataset.step = String(i);
      els.volumeTubeSteps.appendChild(dot);
      volumeDots.push(dot);
    }
  }

  function updateVolumeTube(level) {
    const stepsOn = Math.round(
      Math.min(1, Math.max(0, level)) / VOLUME_STEP
    );

    volumeDots.forEach(function (dot, index) {
      const step = index + 1;
      const isOn = step <= stepsOn;
      dot.classList.toggle("is-on", isOn);
      dot.classList.toggle("is-top", isOn && step === stepsOn);
    });
  }

  function showVolumeHud(level) {
    if (!els.volumeHud || !els.volumeHudValue) return;

    const percent = Math.round(Math.min(1, Math.max(0, level)) * 100);
    els.volumeHudValue.textContent = percent + "%";
    updateVolumeTube(level);
    els.volumeHud.hidden = false;

    requestAnimationFrame(function () {
      els.volumeHud.classList.add("is-visible");
    });

    if (volumeHudHideTimer) clearTimeout(volumeHudHideTimer);
    if (volumeHudRemoveTimer) clearTimeout(volumeHudRemoveTimer);

    volumeHudHideTimer = setTimeout(function () {
      els.volumeHud.classList.remove("is-visible");
      volumeHudRemoveTimer = setTimeout(function () {
        els.volumeHud.hidden = true;
      }, 350);
    }, 1000);
  }

  function toStoredChannel(channel) {
    const code = channel.countryInfo?.code || channel.country || "";
    return {
      id: channel.id || "",
      name: channel.name || "Unknown Channel",
      logo: channel.logo || "",
      group: channel.group || "Other",
      country: channel.country || code,
      url: channel.url || "",
      countryName: channel.countryInfo?.name || channel.countryName || "",
      countryCode: code
    };
  }

  function hydrateChannel(stored) {
    const code = String(stored.countryCode || stored.country || "").toUpperCase();
    const name = stored.countryName || "";
    return {
      id: stored.id || "",
      name: stored.name || "Unknown Channel",
      logo: stored.logo || "",
      group: stored.group || "Other",
      country: stored.country || code,
      url: stored.url || "",
      countryName: name,
      countryInfo: name || code ? { name: name || code, code: code } : null
    };
  }

  function readStoredChannels() {
    try {
      const raw = localStorage.getItem(CHANNELS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(hydrateChannel).filter(function (channel) {
        return channel.url;
      });
    } catch (error) {
      console.warn("Could not read saved channels:", error);
      return [];
    }
  }

  function saveChannels(list) {
    const payload = JSON.stringify(list.map(toStoredChannel));
    try {
      localStorage.setItem(CHANNELS_STORAGE_KEY, payload);
      return true;
    } catch (error) {
      console.warn("Could not save channels:", error);
      return false;
    }
  }

  function restoreChannels() {
    channels = readStoredChannels();
    playlistLoaded = channels.length > 0;
  }

  function showSearchingState() {
    setStatus("Searching...");
    els.totalChannels.textContent = "Searching...";
    const filtersHidden =
      listMode === "favourites" && favouritesApi.count() === 0;
    if (listMode === "all" || filtersHidden) {
      filteredChannels = [];
      updateNavButtons();
      els.channelList.innerHTML = '<div class="empty">Searching...</div>';
    }
  }

  function showPlaylistPrompt() {
    filteredChannels = [];
    updateNavButtons();
    els.channelList.innerHTML =
      '<div class="empty">Press refresh to load channels.</div>';
    setStatus("Press refresh to load channels");
  }

  async function loadPlaylist(options) {
    const opts = options || {};
    if (playlistLoading) {
      if (opts.waitIfBusy) {
        while (playlistLoading) {
          await new Promise(function (resolve) {
            setTimeout(resolve, 120);
          });
        }
        return playlistLoaded && channels.length > 0;
      }
      return false;
    }

    if (isDevtoolsBlocked()) {
      setDevtoolsBlocked(true);
      setStatus("Close DevTools to load channels");
      return false;
    }

    playlistLoading = true;

    if (!opts.silent) {
      showSearchingState();
    }
    els.refreshBtn.disabled = true;
    els.listAllBtn.disabled = true;

    try {
      if (isDevtoolsBlocked()) {
        throw new Error("Close DevTools to continue.");
      }

      const results = await Promise.all([
        fetch(PLAYLIST_URL),
        countries.length ? Promise.resolve(null) : loadMetadata()
      ]);

      const playlistResponse = results[0];

      if (!playlistResponse.ok) {
        throw new Error(
          "Playlist request failed: " + playlistResponse.status
        );
      }

      populateCountries();

      const content = await playlistResponse.text();
      channels = parseM3U(content);

      channels.forEach(function (channel) {
        channel.countryInfo = identifyCountry(channel, countryMap);
      });

      playlistLoaded = true;
      populateCategoriesFrom(
        listMode === "favourites" ? getFavouritesWithShared() : channels
      );

      if (!opts.keepActive) {
        activeChannel = null;
      }

      if (!opts.silent) {
        if (listMode === "all") {
          renderChannels({ resetPage: true });
        } else {
          updateHeaderCount();
          updateModeTabs();
          renderChannels({ resetPage: true });
        }
      } else {
        updateHeaderCount();
        updateModeTabs();
      }

      const saved = saveChannels(channels);
      const unknownCount = channels.filter(function (channel) {
        return !channel.countryInfo;
      }).length;

      setStatus(
        "Loaded " +
          channels.length.toLocaleString() +
          " channels" +
          (unknownCount ? " · " + unknownCount + " unknown country" : "") +
          (saved ? "" : " · could not save locally")
      );

      if (listMode === "all" && !opts.silent) {
        updateHeaderCount();
      }

      return true;
    } catch (error) {
      console.error(error);
      if (!opts.silent) {
        if (listMode === "all") {
          if (playlistLoaded && channels.length) {
            populateCategoriesFrom(channels);
            renderChannels();
          } else {
            updateHeaderCount();
            els.channelList.innerHTML =
              '<div class="empty">Could not load channels. Press refresh to try again.</div>';
          }
        } else {
          renderChannels();
        }
      }
      setStatus(
        "Error: " +
          error.message +
          " (Check playlist access / CORS.)"
      );
      return false;
    } finally {
      playlistLoading = false;
      els.refreshBtn.disabled = false;
      els.listAllBtn.disabled = false;
    }
  }

  function showAllChannels() {
    listMode = "all";
    updateModeTabs();
    updateHeaderCount();

    if (playlistLoading) {
      showSearchingState();
      return;
    }

    if (!playlistLoaded || !channels.length) {
      if (!autoRefreshDone) {
        autoRefreshDone = true;
        loadPlaylist({ keepActive: true });
        return;
      }
      showPlaylistPrompt();
      return;
    }

    populateCategoriesFrom(channels);
    renderChannels({ resetPage: true });
  }

  function showFavourites() {
    listMode = "favourites";
    els.search.value = "";
    if (countrySelect) countrySelect.setValue("", true);
    if (categorySelect) categorySelect.setValue("", true);
    populateCategoriesFrom(getFavouritesWithShared());
    renderChannels({ resetPage: true });
  }

  function resetShareButtonLabel() {
    if (!els.shareChannel) return;
    els.shareChannel.classList.remove("is-copied");
    els.shareChannel.title = "Share this channel";
    els.shareChannel.setAttribute("aria-label", "Share this channel");
    const label = els.shareChannel.querySelector("span");
    if (label) label.textContent = "Share";
  }

  function showShareCopied() {
    if (!els.shareChannel) return;
    els.shareChannel.classList.add("is-copied");
    els.shareChannel.title = "Link copied";
    els.shareChannel.setAttribute("aria-label", "Link copied");
    const label = els.shareChannel.querySelector("span");
    if (label) label.textContent = "Copied";

    if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = setTimeout(resetShareButtonLabel, 1800);
  }

  function showFavouritesShareCopied() {
    if (!els.shareFavouritesBtn) return;
    const previousTitle = els.shareFavouritesBtn.title;
    els.shareFavouritesBtn.classList.add("is-copied");
    els.shareFavouritesBtn.title = "Favourites link copied";
    els.shareFavouritesBtn.setAttribute("aria-label", "Favourites link copied");

    if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
    shareFeedbackTimer = setTimeout(function () {
      els.shareFavouritesBtn.classList.remove("is-copied");
      els.shareFavouritesBtn.title = previousTitle || "Share favourites";
      els.shareFavouritesBtn.setAttribute(
        "aria-label",
        previousTitle || "Share favourites"
      );
    }, 1800);
  }

  async function copyTextFallback(url) {
    const field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.width = "1px";
    field.style.height = "1px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      console.warn("Fallback copy failed:", error);
    }

    document.body.removeChild(field);
    return ok;
  }

  async function copyOrShareLink(url, title, text) {
    let copied = false;

    // Copy first so desktop clicks always do something visible.
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (error) {
      console.warn("Clipboard share failed:", error);
    }

    if (!copied) {
      copied = await copyTextFallback(url);
    }

    const preferNativeShare =
      typeof navigator.share === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (preferNativeShare) {
      try {
        await navigator.share({ title: title, text: text, url: url });
        return "shared";
      } catch (error) {
        if (error && error.name === "AbortError") {
          return copied ? "copied" : "aborted";
        }
        console.warn("Native share failed:", error);
      }
    }

    if (copied) return "copied";

    window.prompt("Copy this share link:", url);
    return "prompted";
  }

  async function shareActiveChannel() {
    if (!activeChannel) {
      setStatus("Select a channel before sharing");
      return;
    }
    if (!shareApi) {
      setStatus("Share is unavailable right now");
      return;
    }

    const url = shareApi.buildUrl(activeChannel);
    if (!url) {
      setStatus("Could not build a share link for this channel");
      return;
    }

    const title = activeChannel.name || "BaliPlex channel";
    const text = "Watch " + title + " on BaliPlex";
    const result = await copyOrShareLink(url, title, text);

    if (result === "shared") {
      setStatus("Shared " + title);
    } else if (result === "copied") {
      showShareCopied();
      setStatus("Share link copied");
    } else if (result === "prompted") {
      setStatus("Copy the share link to send this channel");
    } else {
      setStatus("Sharing was cancelled");
    }
  }

  async function shareFavouritesList() {
    if (!shareApi) {
      setStatus("Share is unavailable right now");
      return;
    }

    const favs = favouritesApi.list();
    if (!favs.length) {
      setStatus("Add favourites before sharing");
      return;
    }

    const url = shareApi.buildFavouritesUrl(favs);
    if (!url) {
      setStatus("Could not build a favourites share link");
      return;
    }

    const title = "BaliPlex favourites";
    const text =
      "Shared favourites playlist (" + favs.length + " channels) on BaliPlex";
    const result = await copyOrShareLink(url, title, text);

    if (result === "shared") {
      setStatus("Shared " + favs.length + " favourites");
    } else if (result === "copied" || result === "prompted") {
      showFavouritesShareCopied();
      setStatus("Favourites share link copied");
    } else {
      setStatus("Sharing was cancelled");
    }
  }

  function setSharedFavouritesModalOpen(open) {
    if (!els.sharedFavouritesModal) return;
    els.sharedFavouritesModal.hidden = !open;
    document.body.classList.toggle("share-modal-open", open);
  }

  function closeSharedFavouritesModal() {
    setSharedFavouritesModalOpen(false);
    sharedFavouritesChannels = [];
    if (els.sharedFavouritesList) els.sharedFavouritesList.innerHTML = "";
    if (els.sharedFavouritesAddAll) {
      els.sharedFavouritesAddAll.hidden = true;
      els.sharedFavouritesAddAll.disabled = false;
      els.sharedFavouritesAddAll.textContent = "Add all";
    }
    if (shareApi && typeof shareApi.clearFavouritesFromLocation === "function") {
      shareApi.clearFavouritesFromLocation();
    }
  }

  function showSharedFavouritesLoading(message) {
    if (els.sharedFavouritesLoadingText) {
      els.sharedFavouritesLoadingText.textContent =
        message || "Loading playlist…";
    }
    if (els.sharedFavouritesLoading) els.sharedFavouritesLoading.hidden = false;
    if (els.sharedFavouritesList) {
      els.sharedFavouritesList.hidden = true;
      els.sharedFavouritesList.innerHTML = "";
    }
    if (els.sharedFavouritesEmpty) {
      els.sharedFavouritesEmpty.hidden = true;
      els.sharedFavouritesEmpty.textContent = "";
    }
    if (els.sharedFavouritesAddAll) els.sharedFavouritesAddAll.hidden = true;
  }

  function refreshSharedFavouritesHearts() {
    if (!els.sharedFavouritesList) return;
    const buttons = els.sharedFavouritesList.querySelectorAll(".fav-btn");
    buttons.forEach(function (button, index) {
      const channel = sharedFavouritesChannels[index];
      if (channel) syncHeartButton(button, channel);
    });
  }

  function addAllSharedFavourites() {
    if (!sharedFavouritesChannels.length) return;

    const added = favouritesApi.addAll(sharedFavouritesChannels);
    updateModeTabs();
    updateHeaderCount();

    if (listMode === "favourites") {
      populateCategoriesFrom(getFavouritesWithShared());
      renderChannels({ resetPage: true });
    }

    refreshSharedFavouritesHearts();

    if (els.sharedFavouritesAddAll) {
      els.sharedFavouritesAddAll.disabled = true;
      els.sharedFavouritesAddAll.textContent =
        added > 0 ? "Added" : "Already saved";
    }

    setStatus(
      added > 0
        ? "Added " +
            added.toLocaleString() +
            " channel" +
            (added === 1 ? "" : "s") +
            " to favourites"
        : "All shared channels were already in favourites"
    );
  }

  function createSharedFavouriteItem(channel) {
    const item = document.createElement("div");
    item.className = "share-modal-item";

    const info = document.createElement("div");
    info.className = "channel-info";

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = channel.name;

    const meta = document.createElement("div");
    meta.className = "channel-meta";
    meta.textContent =
      (channel.countryInfo?.name ||
        channel.countryName ||
        channel.country ||
        "Unknown") +
      " · " +
      (channel.group || "Other");

    info.appendChild(name);
    info.appendChild(meta);

    item.appendChild(createChannelLogo(channel));
    item.appendChild(info);
    item.appendChild(createHeartButton(channel));
    return item;
  }

  function renderSharedFavouritesList(resolved, requestedCount) {
    if (!els.sharedFavouritesList || !els.sharedFavouritesEmpty) return;

    sharedFavouritesChannels = resolved.slice();
    if (els.sharedFavouritesLoading) els.sharedFavouritesLoading.hidden = true;

    if (!resolved.length) {
      els.sharedFavouritesList.hidden = true;
      els.sharedFavouritesList.innerHTML = "";
      els.sharedFavouritesEmpty.hidden = false;
      els.sharedFavouritesEmpty.textContent =
        requestedCount > 0
          ? "None of the shared channels could be found in the playlist."
          : "This favourites share link is empty or invalid.";
      if (els.sharedFavouritesAddAll) els.sharedFavouritesAddAll.hidden = true;
      return;
    }

    els.sharedFavouritesEmpty.hidden = true;
    els.sharedFavouritesList.hidden = false;
    els.sharedFavouritesList.innerHTML = "";

    const fragment = document.createDocumentFragment();
    resolved.forEach(function (channel) {
      fragment.appendChild(createSharedFavouriteItem(channel));
    });
    els.sharedFavouritesList.appendChild(fragment);

    if (els.sharedFavouritesAddAll) {
      const pending = resolved.some(function (channel) {
        return !favouritesApi.isFavourite(channel);
      });
      els.sharedFavouritesAddAll.hidden = false;
      els.sharedFavouritesAddAll.disabled = !pending;
      els.sharedFavouritesAddAll.textContent = pending ? "Add all" : "Already saved";
    }

    const missing = Math.max(0, requestedCount - resolved.length);
    setStatus(
      "Shared favourites ready · " +
        resolved.length.toLocaleString() +
        " channel" +
        (resolved.length === 1 ? "" : "s") +
        (missing ? " · " + missing + " not found" : "") +
        " · heart the ones you want or Add all"
    );
  }

  async function openSharedFavouritesFromRefs(refs) {
    if (!els.sharedFavouritesModal) return;

    setSharedFavouritesModalOpen(true);
    showSharedFavouritesLoading("Loading playlist to prepare shared channels…");

    // Always refresh so shared ids resolve against the current playlist.
    const loaded = await loadPlaylist({
      keepActive: true,
      silent: true,
      waitIfBusy: true
    });

    if (!loaded || !channels.length) {
      if (els.sharedFavouritesLoading) els.sharedFavouritesLoading.hidden = true;
      if (els.sharedFavouritesEmpty) {
        els.sharedFavouritesEmpty.hidden = false;
        els.sharedFavouritesEmpty.textContent =
          "Could not load the playlist. Close this window and try again.";
      }
      return;
    }

    showSharedFavouritesLoading("Preparing shared channels…");

    const resolved = shareApi.resolveFavourites(refs, channels);
    renderSharedFavouritesList(resolved, refs.length);
  }

  function initSelects() {
    const shared = {
      allowEmptyOption: true,
      create: false,
      maxOptions: null,
      dropdownParent: "body"
    };

    countrySelect = new TomSelect(els.countryFilter, Object.assign({}, shared, {
      placeholder: "All Countries",
      onChange: function () {
        renderChannels({ resetPage: true });
      }
    }));

    categorySelect = new TomSelect(els.categoryFilter, Object.assign({}, shared, {
      placeholder: "All Categories",
      onChange: function () {
        renderChannels({ resetPage: true });
      }
    }));
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  function isInChannelList(target) {
    return !!(els.channelList && target && els.channelList.contains(target));
  }

  function isInPlayer(target) {
    const player = BaliPlex.player.getInstance();
    const root = player && player.el();
    if (root && target && root.contains(target)) return true;
    return !!(els.playerShell && target && els.playerShell.contains(target));
  }

  function isFavouriteButton(target) {
    return !!(target && target.closest && target.closest(".fav-btn"));
  }

  function updateListCursorUI() {
    const items = els.channelList.querySelectorAll(".channel");
    items.forEach(function (item, index) {
      item.classList.toggle("is-cursor", index === listCursorIndex);
    });

    const current = items[listCursorIndex];
    if (current) {
      current.scrollIntoView({ block: "nearest" });
      els.channelList.setAttribute("aria-activedescendant", current.id);
    }
  }

  function moveListCursor(delta) {
    if (!filteredChannels.length) return;

    if (listCursorIndex < 0) {
      const activeIndex = getActiveIndex();
      listCursorIndex = activeIndex >= 0 ? activeIndex : 0;
    } else if (usesPagedList() && visibleCount < filteredChannels.length) {
      listCursorIndex = Math.max(
        0,
        Math.min(filteredChannels.length - 1, listCursorIndex + delta)
      );
    } else {
      listCursorIndex =
        (listCursorIndex + delta + filteredChannels.length) %
        filteredChannels.length;
    }

    ensureVisibleThrough(listCursorIndex);
    updateListCursorUI();
  }

  function handleListShortcut(event) {
    if (!filteredChannels.length) return false;
    if (isFavouriteButton(event.target) && (event.key === " " || event.key === "Enter")) {
      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveListCursor(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveListCursor(-1);
      return true;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const channel =
        filteredChannels[listCursorIndex] || filteredChannels[0];
      if (channel) {
        listCursorIndex = Math.max(0, listCursorIndex);
        playChannel(channel);
      }
      return true;
    }

    return false;
  }

  function handlePlayerShortcut(event) {
    if (event.key === "ArrowLeft" || event.key === "[") {
      event.preventDefault();
      event.stopPropagation();
      playRelative(-1);
      return true;
    }

    if (event.key === "ArrowRight" || event.key === "]") {
      event.preventDefault();
      event.stopPropagation();
      playRelative(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      showVolumeHud(BaliPlex.player.adjustVolume(VOLUME_STEP));
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      showVolumeHud(BaliPlex.player.adjustVolume(-VOLUME_STEP));
      return true;
    }

    return false;
  }

  function handleGlobalShortcut(event) {
    if (isTypingTarget(event.target)) return false;

    if (isInChannelList(event.target)) {
      return handleListShortcut(event);
    }

    if (isInPlayer(event.target) || event.target === document.body) {
      return handlePlayerShortcut(event);
    }

    // Header / other UI: keep channel zapping + volume available.
    return handlePlayerShortcut(event);
  }

  function focusPlayerSoon() {
    requestAnimationFrame(function () {
      BaliPlex.player.focus();
      setTimeout(function () {
        BaliPlex.player.focus();
      }, 50);
    });
  }

  function bindEvents() {
    els.search.addEventListener("input", function () {
      renderChannels({ resetPage: true });
    });
    els.refreshBtn.addEventListener("click", function () {
      loadPlaylist({ keepActive: true });
    });

    els.listFavouritesBtn.addEventListener("click", showFavourites);
    els.listAllBtn.addEventListener("click", function () {
      showAllChannels();
    });

    if (els.playbackToggle) {
      els.playbackToggle.addEventListener("click", togglePlayback);
    }

    if (els.shareChannel) {
      els.shareChannel.addEventListener("click", function () {
        shareActiveChannel().catch(function (error) {
          console.warn("Channel share failed:", error);
          setStatus("Could not share this channel");
        });
      });
    }

    if (els.shareFavouritesBtn) {
      els.shareFavouritesBtn.addEventListener("click", function () {
        shareFavouritesList().catch(function (error) {
          console.warn("Favourites share failed:", error);
          setStatus("Could not share favourites");
        });
      });
    }

    if (els.sharedFavouritesClose) {
      els.sharedFavouritesClose.addEventListener("click", closeSharedFavouritesModal);
    }

    if (els.sharedFavouritesAddAll) {
      els.sharedFavouritesAddAll.addEventListener("click", addAllSharedFavourites);
    }

    if (els.sharedFavouritesModal) {
      els.sharedFavouritesModal.addEventListener("click", function (event) {
        if (event.target === els.sharedFavouritesModal) {
          closeSharedFavouritesModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!els.sharedFavouritesModal || els.sharedFavouritesModal.hidden) return;
      closeSharedFavouritesModal();
    });

    els.prevBtn.addEventListener("click", function () {
      playRelative(-1);
    });
    els.nextBtn.addEventListener("click", function () {
      playRelative(1);
    });

    // Capture phase so shortcuts still work when the player / fullscreen has focus.
    document.addEventListener("keydown", handleGlobalShortcut, true);

    els.channelList.addEventListener("keydown", handleListShortcut);
    els.channelList.addEventListener("scroll", maybeLoadMoreFromScroll, {
      passive: true
    });
    els.channelList.addEventListener("click", function () {
      // Keep keyboard focus on the list after clicking a row (except fav button).
      if (!isFavouriteButton(document.activeElement)) {
        els.channelList.focus({ preventScroll: true });
      }
    });

    if (els.playerShell) {
      els.playerShell.addEventListener("mousemove", function () {
        if (window.matchMedia("(min-width: 901px)").matches) {
          setPlayerNavVisible(true);
        }
      });
    }

    document.addEventListener("fullscreenchange", focusPlayerSoon);
    document.addEventListener("webkitfullscreenchange", focusPlayerSoon);

    BaliPlex.player.onFullscreenChange(function () {
      focusPlayerSoon();
      setPlayerNavVisible(true);
    });
  }

  function boot() {
    BaliPlex.player.init(document.getElementById("videoPlayer"), {
      onError: scheduleSkipAfterPlaybackError,
      onPlaying: clearPlaybackSkipTimers,
      onPlayRequest: playFirstAvailable,
      onUserActive: function () {
        if (window.matchMedia("(min-width: 901px)").matches) {
          setPlayerNavVisible(true);
        }
      },
      onUserInactive: function () {
        if (window.matchMedia("(min-width: 901px)").matches) {
          setPlayerNavVisible(false);
        }
      }
    });

    const playerNav = document.querySelector(".player-nav");
    if (playerNav) {
      BaliPlex.player.mountOverlay(playerNav);
    }

    if (els.volumeHud) {
      BaliPlex.player.mountOverlay(els.volumeHud);
    }

    const playerEl = BaliPlex.player.getInstance().el();
    if (playerEl) {
      playerEl.addEventListener("keydown", handlePlayerShortcut);
    }

    buildVolumeTube();
    initSelects();
    bindEvents();
    updateNavButtons();
    setPlayerNavVisible(false);
    restoreChannels();

    let sharedFavouriteRefs = [];
    if (shareApi && typeof shareApi.readFavouritesFromLocation === "function") {
      sharedFavouriteRefs = shareApi.readFavouritesFromLocation();
    }

    if (
      (!sharedFavouriteRefs || !sharedFavouriteRefs.length) &&
      shareApi &&
      typeof shareApi.readFromLocation === "function"
    ) {
      sharedChannel = shareApi.readFromLocation();
    }

    showFavourites();
    setPlaybackToggleState("start");
    initDevtoolsGuard();
    BaliPlex.player.focus();

    if (sharedFavouriteRefs && sharedFavouriteRefs.length) {
      openSharedFavouritesFromRefs(sharedFavouriteRefs);
    } else if (sharedChannel) {
      BaliPlex.player.whenReady(function () {
        playChannel(sharedChannel, { preferAutoplay: true });
        setStatus(
          "Opened shared channel · tap the heart to save it to favourites"
        );
      });
    }

    // Warm country metadata in the background so filters are ready
    // when the user opens all channels.
    if (!isDevtoolsBlocked() && !(sharedFavouriteRefs && sharedFavouriteRefs.length)) {
      loadMetadata()
        .then(populateCountries)
        .catch(function (error) {
          console.warn(error);
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
