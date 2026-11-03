(function () {
  const { PLAYLIST_URL, COUNTRIES_URL } = BaliPlex.config;
  const { parseM3U, identifyCountry } = BaliPlex.parser;

  let channels = [];
  let countries = [];
  let countryMap = new Map();
  let filteredChannels = [];
  let activeChannel = null;
  let countrySelect = null;
  let categorySelect = null;

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
    playerStage: document.getElementById("playerStage")
  };

  function setStatus(message) {
    els.status.textContent = message;
  }

  function updateNavButtons() {
    const canNavigate = filteredChannels.length > 1;
    els.prevBtn.disabled = !canNavigate;
    els.nextBtn.disabled = !canNavigate;
  }

  function getActiveIndex() {
    if (!activeChannel) return -1;
    return filteredChannels.indexOf(activeChannel);
  }

  function scrollActiveIntoView() {
    const active = els.channelList.querySelector(".channel.active");
    if (active) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
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

  function populateCategories() {
    const categories = [
      ...new Set(
        channels.map(function (channel) {
          return channel.group;
        }).filter(Boolean)
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

  function computeFiltered() {
    const { search, selectedCountry, selectedCategory } = getFilterValues();

    return channels.filter(function (channel) {
      const matchesSearch =
        !search ||
        channel.name.toLowerCase().includes(search) ||
        channel.id.toLowerCase().includes(search);

      const matchesCountry =
        !selectedCountry ||
        channel.countryInfo?.code?.toUpperCase() === selectedCountry;

      const matchesCategory =
        !selectedCategory || channel.group === selectedCategory;

      return matchesSearch && matchesCountry && matchesCategory;
    });
  }

  function renderChannels() {
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
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "channel" + (activeChannel === channel ? " active" : "");

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
      const countryName = channel.countryInfo?.name || "Unknown Country";
      meta.textContent = countryName + " · " + channel.group;

      info.appendChild(name);
      info.appendChild(meta);
      item.appendChild(logo);
      item.appendChild(info);

      item.addEventListener("click", function () {
        playChannel(channel);
      });

      fragment.appendChild(item);
    });

    els.channelList.appendChild(fragment);
  }

  function playChannel(channel) {
    activeChannel = channel;

    els.channelTitle.textContent = channel.name;
    els.channelDetails.textContent =
      (channel.countryInfo?.name || "Unknown Country") +
      " · " +
      channel.group;

    els.playerStage.classList.remove("is-playing");
    void els.playerStage.offsetWidth;
    els.playerStage.classList.add("is-playing");

    BaliPlex.player.play(channel.url);
    renderChannels();
    scrollActiveIntoView();
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

  async function loadPlaylist() {
    setStatus("Loading playlist...");
    els.refreshBtn.disabled = true;

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

      populateCategories();
      activeChannel = null;
      renderChannels();

      els.totalChannels.textContent =
        channels.length.toLocaleString() + " Channels";

      const unknownCount = channels.filter(function (channel) {
        return !channel.countryInfo;
      }).length;

      setStatus(
        "Loaded " +
          channels.length.toLocaleString() +
          " channels" +
          (unknownCount ? " · " + unknownCount + " unknown country" : "")
      );
    } catch (error) {
      console.error(error);
      setStatus(
        "Error: " +
          error.message +
          " (Check playlist access / CORS.)"
      );
    } finally {
      els.refreshBtn.disabled = false;
    }
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
    els.refreshBtn.addEventListener("click", loadPlaylist);
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
  }

  function boot() {
    BaliPlex.player.init(document.getElementById("videoPlayer"), {
      onError: function (message) {
        els.channelDetails.textContent = message;
      }
    });

    initSelects();
    bindEvents();
    updateNavButtons();
    loadPlaylist();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
