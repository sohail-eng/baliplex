window.BaliPlex = window.BaliPlex || {};

BaliPlex.parser = (function () {
  function getAttribute(line, attribute) {
    const regex = new RegExp(attribute + '="([^"]*)"', "i");
    const match = line.match(regex);
    return match ? match[1].trim() : "";
  }

  function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const result = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF")) {
        const commaIndex = line.lastIndexOf(",");
        const name =
          commaIndex >= 0
            ? line.substring(commaIndex + 1).trim()
            : "Unknown Channel";

        current = {
          id: getAttribute(line, "tvg-id"),
          name: name || "Unknown Channel",
          logo: getAttribute(line, "tvg-logo"),
          group: getAttribute(line, "group-title") || "Other",
          country: getAttribute(line, "tvg-country"),
          url: ""
        };
      } else if (!line.startsWith("#") && current) {
        current.url = line;
        result.push(current);
        current = null;
      }
    }

    return result;
  }

  function identifyCountry(channel, countryMap) {
    if (channel.id) {
      const match = channel.id.match(/\.([a-z]{2})(?:@|$)/i);
      if (match) {
        const code = match[1].toUpperCase();
        const country = countryMap.get(code);
        if (country) return country;
      }
    }

    if (channel.country) {
      const code = channel.country.toUpperCase();
      return countryMap.get(code) || null;
    }

    return null;
  }

  return {
    parseM3U,
    identifyCountry
  };
})();
