(function () {
  const { PLAYLIST_URL, COUNTRIES_URL } = BaliPlex.config;
  const { parseM3U, identifyCountry } = BaliPlex.parser;
  const favouritesApi = BaliPlex.favourites;

  let channels = [];
  let countries = [];
  let countryMap = new Map();
  let filteredChannels = [];
  let activeChannel = null;
  let countrySelect = null;
  let categorySelect = null;
  let listMode = "favourites";
  let playlistLoaded = false;
  let playlistLoading = false;
  let listCursorIndex = -1;

  const HEART_OUTLINE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  const HEART_FILLED =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" fill="currentColor"/></svg>';

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
    prevBtn: document.getElementById("prevChannel"),
    nextBtn: document.getElementById("nextChannel"),
    playerStage: document.getElementById("playerStage"),
    playerShell: document.querySelector(".player-shell"),
    listFavouritesBtn: document.getElementById("listFavouritesBtn"),
    listAllBtn: document.getElementById("listAllBtn"),
    filtersPanel: document.getElementById("filtersPanel"),
    volumeHud: document.getElementById("volumeHud"),
    volumeHudValue: document.getElementById("volumeHudValue"),
    volumeTubeSteps: document.getElementById("volumeTubeSteps")
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

  async function loadMetadata() {
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

  function getSourceChannels() {
    if (listMode === "favourites") {
      return favouritesApi.list();
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

  function createHeartButton(channel) {
    const fav = favouritesApi.isFavourite(channel);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fav-btn" + (fav ? " is-active" : "");
    button.title = fav ? "Remove from favourites" : "Add to favourites";
    button.setAttribute(
      "aria-label",
      fav ? "Remove from favourites" : "Add to favourites"
    );
    button.setAttribute("aria-pressed", String(fav));
    button.innerHTML = fav ? HEART_FILLED : HEART_OUTLINE;

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      favouritesApi.toggle(channel);
      updateModeTabs();
      updateHeaderCount();

      if (listMode === "favourites") {
        populateCategoriesFrom(favouritesApi.list());
        renderChannels();
      } else {
        const nowFav = favouritesApi.isFavourite(channel);
        button.classList.toggle("is-active", nowFav);
        button.setAttribute("aria-pressed", String(nowFav));
        button.title = nowFav
          ? "Remove from favourites"
          : "Add to favourites";
        button.setAttribute(
          "aria-label",
          nowFav ? "Remove from favourites" : "Add to favourites"
        );
        button.innerHTML = nowFav ? HEART_FILLED : HEART_OUTLINE;
        updateModeTabs();
      }
    });

    return button;
  }

  function renderChannels() {
    updateModeTabs();
    updateHeaderCount();

    if (listMode === "favourites" && favouritesApi.count() === 0) {
      filteredChannels = [];
      updateNavButtons();
      renderEmptyFavourites();
      setStatus("Save channels with the heart icon");
      return;
    }

    filteredChannels = computeFiltered();
    updateNavButtons();

    els.channelList.innerHTML = "";

    if (!filteredChannels.length) {
      els.channelList.innerHTML =
        '<div class="empty">No channels found.</div>';
      return;
    }

    if (listCursorIndex < 0 || listCursorIndex >= filteredChannels.length) {
      const activeIndex = getActiveIndex();
      listCursorIndex = activeIndex >= 0 ? activeIndex : 0;
    }

    const fragment = document.createDocumentFragment();

    filteredChannels.forEach(function (channel, index) {
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

      const logo = document.createElement("img");
      logo.src = channel.logo || "";
      logo.alt = "";
      logo.loading = "lazy";
      logo.onerror = function () {
        logo.style.display = "none";
      };

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

      item.appendChild(logo);
      item.appendChild(info);
      item.appendChild(createHeartButton(channel));

      item.addEventListener("click", function () {
        listCursorIndex = index;
        playChannel(channel);
      });

      fragment.appendChild(item);
    });

    els.channelList.appendChild(fragment);
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
    }
  }

  function playChannel(channel) {
    const keepListFocus =
      isInChannelList(document.activeElement) ||
      document.activeElement === els.channelList;

    activeChannel = channel;
    const playingIndex = filteredChannels.findIndex(function (item) {
      return sameChannel(item, channel);
    });
    if (playingIndex >= 0) listCursorIndex = playingIndex;

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

    BaliPlex.player.play(channel.url);
    renderChannels();
    scrollActiveIntoView();

    if (keepListFocus) {
      els.channelList.focus({ preventScroll: true });
      updateListCursorUI();
    } else if (window.matchMedia("(max-width: 900px)").matches) {
      els.playerStage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function playRelative(offset) {
    if (filteredChannels.length < 2) return;

    let index = getActiveIndex();
    if (index < 0) index = 0;
    else {
      index =
        (index + offset + filteredChannels.length) % filteredChannels.length;
    }

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

  async function loadPlaylist(options) {
    const opts = options || {};
    if (playlistLoading) return;
    playlistLoading = true;

    setStatus("Loading playlist...");
    els.refreshBtn.disabled = true;
    els.listAllBtn.disabled = true;

    try {
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
      populateCategoriesFrom(channels);

      if (!opts.keepActive) {
        activeChannel = null;
      }

      if (listMode === "all") {
        renderChannels();
      } else {
        updateHeaderCount();
        updateModeTabs();
      }

      const unknownCount = channels.filter(function (channel) {
        return !channel.countryInfo;
      }).length;

      setStatus(
        "Loaded " +
          channels.length.toLocaleString() +
          " channels" +
          (unknownCount ? " · " + unknownCount + " unknown country" : "")
      );

      if (listMode === "all") {
        updateHeaderCount();
      }
    } catch (error) {
      console.error(error);
      setStatus(
        "Error: " +
          error.message +
          " (Check playlist access / CORS.)"
      );
    } finally {
      playlistLoading = false;
      els.refreshBtn.disabled = false;
      els.listAllBtn.disabled = false;
    }
  }

  async function showAllChannels() {
    listMode = "all";
    updateModeTabs();
    updateHeaderCount();

    if (!playlistLoaded) {
      els.channelList.innerHTML =
        '<div class="empty">Loading all channels…</div>';
      await loadPlaylist({ keepActive: true });
      if (listMode === "all") {
        populateCategoriesFrom(channels);
        renderChannels();
      }
      return;
    }

    populateCategoriesFrom(channels);
    renderChannels();
  }

  function showFavourites() {
    listMode = "favourites";
    els.search.value = "";
    if (countrySelect) countrySelect.setValue("", true);
    if (categorySelect) categorySelect.setValue("", true);
    populateCategoriesFrom(favouritesApi.list());
    renderChannels();
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
        renderChannels();
      }
    }));

    categorySelect = new TomSelect(els.categoryFilter, Object.assign({}, shared, {
      placeholder: "All Categories",
      onChange: function () {
        renderChannels();
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
    } else {
      listCursorIndex =
        (listCursorIndex + delta + filteredChannels.length) %
        filteredChannels.length;
    }

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
    els.search.addEventListener("input", renderChannels);
    els.refreshBtn.addEventListener("click", function () {
      if (listMode === "all" || playlistLoaded) {
        loadPlaylist({ keepActive: true }).then(function () {
          if (listMode === "favourites") {
            populateCategoriesFrom(favouritesApi.list());
            renderChannels();
          }
        });
      } else {
        showAllChannels();
      }
    });

    els.listFavouritesBtn.addEventListener("click", showFavourites);
    els.listAllBtn.addEventListener("click", function () {
      showAllChannels();
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
      onError: function (message) {
        els.channelDetails.textContent = message;
      },
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
    showFavourites();
    BaliPlex.player.focus();

    // Warm country metadata in the background so filters are ready
    // when the user opens all channels.
    loadMetadata()
      .then(populateCountries)
      .catch(function (error) {
        console.warn(error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
