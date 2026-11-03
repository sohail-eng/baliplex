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
    filtersPanel: document.getElementById("filtersPanel")
  };

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

    const fragment = document.createDocumentFragment();

    filteredChannels.forEach(function (channel) {
      const item = document.createElement("div");
      item.className =
        "channel" + (sameChannel(activeChannel, channel) ? " active" : "");
      item.setAttribute("role", "button");
      item.tabIndex = 0;

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

      function activate() {
        playChannel(channel);
      }

      item.addEventListener("click", activate);
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });

      fragment.appendChild(item);
    });

    els.channelList.appendChild(fragment);

    if (listMode === "favourites") {
      setStatus(
        favouritesApi.count().toLocaleString() +
          " favourite" +
          (favouritesApi.count() === 1 ? "" : "s")
      );
    }
  }

  function playChannel(channel) {
    activeChannel = channel;

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

    if (window.matchMedia("(max-width: 900px)").matches) {
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

    document.addEventListener("keydown", function (event) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        playRelative(-1);
      } else if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        playRelative(1);
      }
    });

    if (els.playerShell) {
      els.playerShell.addEventListener("mousemove", function () {
        if (window.matchMedia("(min-width: 901px)").matches) {
          setPlayerNavVisible(true);
        }
      });
    }
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

    initSelects();
    bindEvents();
    updateNavButtons();
    setPlayerNavVisible(false);
    showFavourites();

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
