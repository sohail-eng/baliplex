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

    const keyBytes = utf8Encode(KEY);
    const plain = utf8Encode(JSON.stringify(pack(channel)));
    return toBase64Url(xorBytes(plain, keyBytes));
  }

  function decode(token) {
    if (!token) return null;

    try {
      const keyBytes = utf8Encode(KEY);
      const plain = utf8Decode(xorBytes(fromBase64Url(token), keyBytes));
      return unpack(JSON.parse(plain));
    } catch (error) {
      console.warn("Could not decode shared channel:", error);
      return null;
    }
  }

  function readTokenFromLocation() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get("c");
      if (fromHash) return fromHash;

      // Support raw "#c=TOKEN" without treating as search-style params badly
      if (hash.indexOf("c=") === 0) {
        return decodeURIComponent(hash.slice(2));
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("c");
  }

  function readFromLocation() {
    return decode(readTokenFromLocation());
  }

  function buildUrl(channel) {
    const token = encode(channel);
    if (!token) return "";

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "c=" + token;
    return url.toString();
  }

  return {
    encode,
    decode,
    buildUrl,
    readFromLocation
  };
})();
