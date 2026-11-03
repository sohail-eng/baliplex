window.BaliPlex = window.BaliPlex || {};

BaliPlex.favourites = (function () {
  const STORAGE_KEY =
    (window.BaliPlex.config && BaliPlex.config.FAVOURITES_STORAGE_KEY) ||
    "baliplex.favourites.v1";

  function channelKey(channel) {
    return channel.url || channel.id || channel.name;
  }

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Could not read favourites:", error);
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (error) {
      console.warn("Could not save favourites:", error);
    }
  }

  function toStored(channel) {
    return {
      id: channel.id || "",
      name: channel.name || "Unknown Channel",
      logo: channel.logo || "",
      group: channel.group || "Other",
      country: channel.country || "",
      countryName: channel.countryInfo?.name || channel.countryName || "",
      url: channel.url || ""
    };
  }

  function hydrate(stored) {
    return {
      id: stored.id || "",
      name: stored.name || "Unknown Channel",
      logo: stored.logo || "",
      group: stored.group || "Other",
      country: stored.country || "",
      countryName: stored.countryName || "",
      url: stored.url || "",
      countryInfo: stored.countryName
        ? { name: stored.countryName, code: stored.country }
        : stored.country
          ? { name: stored.country, code: stored.country }
          : null
    };
  }

  function list() {
    return read().map(hydrate);
  }

  function isFavourite(channel) {
    if (!channel) return false;
    const key = channelKey(channel);
    return read().some(function (item) {
      return channelKey(item) === key;
    });
  }

  function toggle(channel) {
    if (!channel || !channel.url) return false;

    const key = channelKey(channel);
    const current = read();
    const index = current.findIndex(function (item) {
      return channelKey(item) === key;
    });

    if (index >= 0) {
      current.splice(index, 1);
      write(current);
      return false;
    }

    current.unshift(toStored(channel));
    write(current);
    return true;
  }

  function count() {
    return read().length;
  }

  return {
    list,
    isFavourite,
    toggle,
    count,
    channelKey
  };
})();
