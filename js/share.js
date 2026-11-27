window.BaliPlex = window.BaliPlex || {};

BaliPlex.share = (function () {
  const KEY =
    (window.BaliPlex.config && BaliPlex.config.SHARE_KEY) || "baliplex-share-v1";

  function utf8Encode(text) {
    return new TextEncoder().encode(String(text || ""));
  }

  function utf8Decode(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function xorBytes(bytes, keyBytes) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return out;
  }

  function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromBase64Url(token) {
    const padded =
      String(token || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/") +
      "===".slice((String(token || "").length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function encryptJson(value) {
    const keyBytes = utf8Encode(KEY);
    const plain = utf8Encode(JSON.stringify(value));
    return toBase64Url(xorBytes(plain, keyBytes));
  }

  function decryptJson(token) {
    if (!token) return null;
    const keyBytes = utf8Encode(KEY);
    const plain = utf8Decode(xorBytes(fromBase64Url(token), keyBytes));
    return JSON.parse(plain);
  }

  function pack(channel) {
    return {
      i: channel.id || "",
      n: channel.name || "Unknown Channel",
      l: channel.logo || "",
      g: channel.group || "Other",
      c: channel.country || "",
      cn: channel.countryInfo?.name || channel.countryName || "",
      u: channel.url || ""
    };
  }

  function unpack(data) {
    if (!data || typeof data !== "object" || !data.u) return null;

    return {
      id: data.i || "",
      name: data.n || "Unknown Channel",
      logo: data.l || "",
      group: data.g || "Other",
      country: data.c || "",
      countryName: data.cn || "",
      url: data.u,
      countryInfo: data.cn
        ? { name: data.cn, code: data.c || "" }
        : data.c
          ? { name: data.c, code: data.c }
          : null
    };
  }

  function encode(channel) {
    if (!channel || !channel.url) return "";
    return encryptJson(pack(channel));
  }

  function decode(token) {
    try {
      return unpack(decryptJson(token));
    } catch (error) {
      console.warn("Could not decode shared channel:", error);
      return null;
    }
  }

  function favouritesRef(channel) {
    if (!channel) return null;
    if (channel.id) return { i: String(channel.id) };
    if (channel.url) return { u: String(channel.url) };
    return null;
  }

  function encodeFavourites(channels) {
    if (!Array.isArray(channels) || !channels.length) return "";

    const refs = [];
    const seen = new Set();

    channels.forEach(function (channel) {
      const ref = favouritesRef(channel);
      if (!ref) return;
      const key = ref.i ? "i:" + ref.i : "u:" + ref.u;
      if (seen.has(key)) return;
      seen.add(key);
      refs.push(ref);
    });

    if (!refs.length) return "";
    return encryptJson(refs);
  }

  function decodeFavourites(token) {
    try {
      const parsed = decryptJson(token);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (ref) {
        return ref && typeof ref === "object" && (ref.i || ref.u);
      });
    } catch (error) {
      console.warn("Could not decode shared favourites:", error);
      return [];
    }
  }

  function resolveFavourites(refs, allChannels) {
    if (!Array.isArray(refs) || !refs.length || !Array.isArray(allChannels)) {
      return [];
    }

    const byId = new Map();
    const byUrl = new Map();

    allChannels.forEach(function (channel) {
      if (channel.id && !byId.has(channel.id)) {
        byId.set(channel.id, channel);
      }
      if (channel.url) {
        byUrl.set(channel.url, channel);
      }
    });

    const resolved = [];
    const seen = new Set();

    refs.forEach(function (ref) {
      let channel = null;
      if (ref.i) channel = byId.get(ref.i) || null;
      if (!channel && ref.u) channel = byUrl.get(ref.u) || null;
      if (!channel) return;

      const key = channel.url || channel.id || channel.name;
      if (seen.has(key)) return;
      seen.add(key);
      resolved.push(channel);
    });

    return resolved;
  }

  function readHashParams() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return new URLSearchParams();
    return new URLSearchParams(hash);
  }

  function readTokenFromLocation(param) {
    const hashParams = readHashParams();
    const fromHash = hashParams.get(param);
    if (fromHash) return fromHash;

    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get(param);
  }

  function readFromLocation() {
    return decode(readTokenFromLocation("c"));
  }

  function readFavouritesFromLocation() {
    return decodeFavourites(readTokenFromLocation("f"));
  }

  function buildUrl(channel) {
    const token = encode(channel);
    if (!token) return "";

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "c=" + token;
    return url.toString();
  }

  function buildFavouritesUrl(channels) {
    const token = encodeFavourites(channels);
    if (!token) return "";

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "f=" + token;
    return url.toString();
  }

  function clearFavouritesFromLocation() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    params.delete("f");
    url.search = params.toString();

    const hashParams = readHashParams();
    hashParams.delete("f");
    const nextHash = hashParams.toString();
    url.hash = nextHash ? nextHash : "";

    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  return {
    encode,
    decode,
    buildUrl,
    readFromLocation,
    encodeFavourites,
    decodeFavourites,
    resolveFavourites,
    buildFavouritesUrl,
    readFavouritesFromLocation,
    clearFavouritesFromLocation
  };
})();
