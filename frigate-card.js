/*
 * frigate-card
 * Timeline-style list of Frigate events (thumbnail, date, camera, label,
 * zones, ...). Selecting an event opens a player overlay with the full clip.
 *
 * Requires the Frigate integration (https://github.com/blakeblackshear/frigate-hass-integration).
 *
 * Install: copy to /config/www/frigate-card.js and add a dashboard
 * resource  /local/frigate-card.js  (type: JavaScript module).
 */

const CARD_VERSION = "0.1.3";

const HLS_JS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";

const LABEL_ICONS = {
  person: "mdi:account",
  car: "mdi:car",
  dog: "mdi:dog",
  cat: "mdi:cat",
  bicycle: "mdi:bike",
  motorcycle: "mdi:motorbike",
  bird: "mdi:bird",
  package: "mdi:package-variant-closed",
  face: "mdi:face-recognition",
  license_plate: "mdi:car-info",
  bus: "mdi:bus",
  truck: "mdi:truck",
  horse: "mdi:horse",
  deer: "mdi:deer",
  fox: "mdi:fox",
  raccoon: "mdi:paw",
};

const DEFAULTS = {
  days: 3,
  limit: 200,
  has_clip: true,
  group_by_day: true,
  show_thumbnails: true,
  show_filters: true,
  show_camera_filter: true,
  show_day_selector: true,
  show_zones: true,
  show_score: true,
  refresh_seconds: 60,
  max_height: 0,
};

const pad = (n) => String(n).padStart(2, "0");

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDuration(start, end) {
  if (!end) return "";
  const s = Math.max(0, Math.round(end - start));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${pad(s % 60)}s`;
}

function dayKey(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDay(key, locale) {
  const today = dayKey(Date.now() / 1000);
  const yesterday = dayKey(Date.now() / 1000 - 86400);
  const d = new Date(`${key}T12:00:00`);
  const long = d.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (key === today) return `Today · ${long}`;
  if (key === yesterday) return `Yesterday · ${long}`;
  return long;
}

function titleCase(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

/* Accepts "cam", {camera: "cam", name: "Front door"}; returns {id, name}. */
function normalizeCameras(list) {
  return (list || []).map((c) =>
    typeof c === "string"
      ? { id: c, name: titleCase(c) }
      : { id: c.camera || c.id, name: c.name || c.title || titleCase(c.camera || c.id) }
  );
}

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px 4px;
  }
  .header .title { font-size: 1.2em; font-weight: 500; flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .header select, .header button {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 8px; padding: 4px 8px; font: inherit; font-size: 0.85em;
    cursor: pointer;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 16px 8px; }
  .chip {
    border: 1px solid var(--divider-color); border-radius: 16px;
    padding: 3px 12px; font-size: 0.82em; cursor: pointer; user-select: none;
    background: transparent; color: var(--secondary-text-color); font-family: inherit;
  }
  .chip.on {
    background: var(--primary-color); border-color: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .list { overflow-y: auto; }
  .day {
    position: sticky; top: 0; z-index: 1;
    padding: 6px 16px; font-size: 0.8em; font-weight: 500; letter-spacing: .04em;
    text-transform: uppercase; color: var(--secondary-text-color);
    background: var(--card-background-color, var(--ha-card-background));
    border-bottom: 1px solid var(--divider-color);
  }
  .event {
    display: flex; gap: 12px; align-items: center; width: 100%;
    padding: 8px 16px; border: 0; background: none; text-align: left;
    color: inherit; font: inherit; cursor: pointer;
    border-bottom: 1px solid var(--divider-color);
  }
  .event:hover, .event:focus-visible { background: var(--secondary-background-color); outline: none; }
  .thumb {
    position: relative; flex: 0 0 auto; width: 112px; aspect-ratio: 16 / 9;
    border-radius: 6px; overflow: hidden; background: var(--secondary-background-color);
    display: flex; align-items: center; justify-content: center;
    color: var(--secondary-text-color);
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb .dur {
    position: absolute; right: 4px; bottom: 4px; font-size: 0.7em;
    padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.65); color: #fff;
  }
  .thumb .noclip {
    position: absolute; left: 4px; top: 4px; --mdc-icon-size: 16px;
    background: rgba(0,0,0,.65); color: #fff; border-radius: 4px; padding: 1px;
  }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .what { display: flex; align-items: center; gap: 6px; font-weight: 500; }
  .what ha-icon { --mdc-icon-size: 20px; color: var(--primary-color); flex: 0 0 auto; }
  .what span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 0.85em; color: var(--secondary-text-color); display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .meta .cam { color: var(--primary-text-color); }
  .time { flex: 0 0 auto; text-align: right; font-variant-numeric: tabular-nums; font-size: 0.9em; }
  .time small { display: block; color: var(--secondary-text-color); font-size: 0.85em; }
  .state { padding: 24px 16px; text-align: center; color: var(--secondary-text-color); }
  .error { color: var(--error-color, #db4437); white-space: pre-wrap; }
  .more { padding: 8px 16px; text-align: center; font-size: 0.8em; color: var(--secondary-text-color); }

  .overlay {
    position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.85);
    display: flex; align-items: center; justify-content: center; padding: 16px;
    box-sizing: border-box;
  }
  .player {
    width: min(1100px, 100%); max-height: 100%; display: flex; flex-direction: column;
    background: var(--card-background-color, #1c1c1c); border-radius: 12px; overflow: hidden;
    color: var(--primary-text-color);
  }
  .player .bar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
  .player .bar .t { flex: 1; min-width: 0; }
  .player .bar .t b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player .bar .t small { color: var(--secondary-text-color); }
  .player .bar button {
    border: 0; background: none; color: inherit; cursor: pointer; padding: 6px;
    --mdc-icon-size: 24px; border-radius: 50%; display: flex;
  }
  .player .bar button:hover:not(:disabled) { background: var(--secondary-background-color); }
  .player .bar button:disabled { opacity: .3; cursor: default; }
  .player .media { background: #000; min-height: 120px; display: flex; align-items: center; justify-content: center; }
  .player video, .player ha-hls-player, .player img { width: 100%; max-height: calc(100vh - 140px); display: block; }
  .player .media .msg { color: #ddd; padding: 40px 16px; text-align: center; }
`;

class FrigateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._events = [];
    this._loading = false;
    this._error = null;
    this._loaded = false;
    this._selectedCams = null; // Set of camera ids currently shown
    this._days = null; // runtime override of config.days
    this._known = new Map(); // camera id -> name, including those seen in events
    this._signed = new Map(); // path -> {url, exp}
    this._current = null; // event shown in the player
    this._onKey = (e) => {
      if (!this._current) return;
      if (e.key === "Escape") this._closePlayer();
      else if (e.key === "ArrowLeft") this._step(1);
      else if (e.key === "ArrowRight") this._step(-1);
    };
  }

  static getConfigElement() {
    return document.createElement("frigate-card-editor");
  }

  static getStubConfig() {
    return { type: "custom:frigate-card", title: "Frigate events", days: 3, cameras: [] };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...DEFAULTS, ...config };
    this._cams = normalizeCameras(this._config.cameras);
    for (const c of this._cams) this._known.set(c.id, c.name);
    this._selectedCams = new Set(this._cams.map((c) => c.id));
    this._days = null;
    this._instance = this._config.frigate_client_id || this._config.frigate_instance_id || null;
    this._loaded = false;
    this._render();
    if (this._hass) this._load();
  }

  getCardSize() {
    return 6;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._player) this._player.hass = hass;
    if (first && this._config) this._load();
  }

  connectedCallback() {
    window.addEventListener("keydown", this._onKey);
    this._startTimer();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKey);
    clearInterval(this._timer);
    this._io?.disconnect();
  }

  _startTimer() {
    clearInterval(this._timer);
    const s = Number(this._config?.refresh_seconds);
    if (s > 0) this._timer = setInterval(() => !this._current && this._load(true), s * 1000);
  }

  get _effectiveDays() {
    return this._days ?? this._config.days;
  }

  /*
   * The integration identifies an instance by the MQTT client_id from the
   * Frigate config (not the HA config entry id). Its media source lists one
   * root child per instance, so read the id from there.
   */
  async _resolveInstance() {
    if (this._instance) return this._instance;
    try {
      const root = await this._hass.callWS({
        type: "media_source/browse_media",
        media_content_id: "media-source://frigate",
      });
      for (const ch of root?.children || []) {
        const m = /^media-source:\/\/frigate\/([^/]+)/.exec(ch.media_content_id || "");
        if (m) {
          this._instance = m[1];
          return this._instance;
        }
      }
    } catch (_) {
      /* fall through */
    }
    throw new Error(
      "Could not detect the Frigate client ID. Set frigate_client_id to the mqtt client_id from your Frigate config (default: frigate)."
    );
  }

  async _load(silent = false) {
    if (!this._hass || this._loading) return;
    this._loading = true;
    if (!silent) this._render();
    try {
      const instance = await this._resolveInstance();
      const msg = {
        type: "frigate/events/get",
        instance_id: instance,
        after: Math.floor(Date.now() / 1000 - this._effectiveDays * 86400),
        limit: Number(this._config.limit) || 200,
      };
      if (this._cams.length) msg.cameras = this._cams.map((c) => c.id);
      if (this._config.labels?.length) msg.labels = this._config.labels;
      if (this._config.zones?.length) msg.zones = this._config.zones;
      if (this._config.has_clip) msg.has_clip = true;
      let res = await this._hass.callWS(msg);
      if (typeof res === "string") res = JSON.parse(res);
      this._events = (res || []).sort((a, b) => b.start_time - a.start_time);
      for (const e of this._events) {
        if (!this._known.has(e.camera)) {
          this._known.set(e.camera, titleCase(e.camera));
          if (!this._cams.length) this._selectedCams.add(e.camera);
        }
      }
      this._error = null;
      this._loaded = true;
    } catch (err) {
      this._error = err?.message || err?.code || JSON.stringify(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _sign(path) {
    const hit = this._signed.get(path);
    if (hit && hit.exp > Date.now() + 60000) return hit.url;
    const res = await this._hass.callWS({ type: "auth/sign_path", path, expires: 3600 });
    this._signed.set(path, { url: res.path, exp: Date.now() + 3600 * 1000 });
    return res.path;
  }

  _camName(id) {
    return this._known.get(id) || titleCase(id);
  }

  _visible() {
    return this._events.filter((e) => this._selectedCams.has(e.camera));
  }

  /* ---- list rendering ---- */

  _render() {
    if (!this._config) return;
    const c = this._config;
    const locale = this._hass?.locale?.language || undefined;
    const events = this._visible();
    let body = "";

    if (this._error) {
      body = `<div class="state error">${esc(this._error)}</div>`;
    } else if (!this._loaded) {
      body = `<div class="state">Loading events…</div>`;
    } else if (!events.length) {
      body = `<div class="state">No events in the last ${this._effectiveDays} day(s).</div>`;
    } else {
      let lastDay = null;
      for (const e of events) {
        const dk = dayKey(e.start_time);
        if (c.group_by_day && dk !== lastDay) {
          body += `<div class="day">${esc(fmtDay(dk, locale))}</div>`;
          lastDay = dk;
        }
        body += this._rowHtml(e, dk, locale);
      }
      if (events.length >= (Number(c.limit) || 200) && this._events.length >= (Number(c.limit) || 200)) {
        body += `<div class="more">Showing the latest ${esc(c.limit)} events. Reduce days or filter cameras to see more.</div>`;
      }
    }

    const camIds = [...this._known.keys()];
    const chips =
      c.show_filters && c.show_camera_filter && camIds.length > 1
        ? `<div class="chips">${camIds
            .map(
              (id) =>
                `<button class="chip ${this._selectedCams.has(id) ? "on" : ""}" data-cam="${esc(id)}">${esc(
                  this._camName(id)
                )}</button>`
            )
            .join("")}</div>`
        : "";

    const daysOpts = [...new Set([1, 2, 3, 7, 14, 30, c.days, this._effectiveDays])]
      .sort((a, b) => a - b)
      .map((d) => `<option value="${d}" ${d === this._effectiveDays ? "selected" : ""}>${d} day${d === 1 ? "" : "s"}</option>`)
      .join("");

    const maxH = Number(c.max_height) > 0 ? `style="max-height:${Number(c.max_height)}px"` : "";

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="header">
          <div class="title">${esc(c.title ?? "Frigate events")}</div>
          ${c.show_filters && c.show_day_selector ? `<select id="days" aria-label="Time range">${daysOpts}</select>` : ""}
          <button id="refresh" title="Refresh" aria-label="Refresh"><ha-icon icon="mdi:refresh"></ha-icon></button>
        </div>
        ${chips}
        <div class="list" ${maxH}>${body}</div>
      </ha-card>
      ${this._current ? this._playerHtml() : ""}
    `;
    this._wire();
  }

  _rowHtml(e, dk, locale) {
    const c = this._config;
    const icon = LABEL_ICONS[e.label] || "mdi:motion-sensor";
    const what = e.sub_label
      ? `${titleCase(Array.isArray(e.sub_label) ? e.sub_label[0] : e.sub_label)} (${titleCase(e.label)})`
      : titleCase(e.label);
    const zones = c.show_zones && e.zones?.length ? `<span>${e.zones.map(titleCase).map(esc).join(", ")}</span>` : "";
    const rawScore = e.data?.top_score ?? e.top_score;
    const score = c.show_score && rawScore ? `<span>${Math.round(rawScore * 100)}%</span>` : "";
    const dur = fmtDuration(e.start_time, e.end_time);
    const ongoing = !e.end_time ? `<span>In progress</span>` : "";
    const showDate = !c.group_by_day
      ? new Date(e.start_time * 1000).toLocaleDateString(locale, { day: "numeric", month: "short" })
      : "";
    const thumb = c.show_thumbnails
      ? `<div class="thumb" data-thumb="${esc(e.id)}">
           <ha-icon icon="mdi:image-outline"></ha-icon>
           ${dur ? `<span class="dur">${esc(dur)}</span>` : ""}
           ${e.has_clip === false ? `<ha-icon class="noclip" icon="mdi:video-off"></ha-icon>` : ""}
         </div>`
      : "";
    return `
      <button class="event" data-id="${esc(e.id)}">
        ${thumb}
        <div class="info">
          <div class="what"><ha-icon icon="${icon}"></ha-icon><span>${esc(what)}</span></div>
          <div class="meta"><span class="cam">${esc(this._camName(e.camera))}</span>${zones}${score}${ongoing}</div>
        </div>
        <div class="time">${esc(fmtTime(e.start_time))}<small>${esc(showDate || dur)}</small></div>
      </button>`;
  }

  _wire() {
    const root = this.shadowRoot;
    root.getElementById("refresh")?.addEventListener("click", () => this._load());
    root.getElementById("days")?.addEventListener("change", (ev) => {
      this._days = Number(ev.target.value);
      this._load();
    });
    root.querySelectorAll(".chip").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.dataset.cam;
        if (this._selectedCams.has(id)) this._selectedCams.delete(id);
        else this._selectedCams.add(id);
        this._render();
      })
    );
    root.querySelectorAll(".event").forEach((el) =>
      el.addEventListener("click", () => {
        const ev = this._events.find((x) => x.id === el.dataset.id);
        if (ev) this._openPlayer(ev);
      })
    );
    this._observeThumbs();
    if (this._current) this._wirePlayer();
  }

  _observeThumbs() {
    this._io?.disconnect();
    const thumbs = this.shadowRoot.querySelectorAll("[data-thumb]");
    if (!thumbs.length) return;
    this._io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          this._io.unobserve(en.target);
          this._loadThumb(en.target);
        }
      },
      { rootMargin: "200px" }
    );
    thumbs.forEach((t) => this._io.observe(t));
  }

  async _loadThumb(el) {
    try {
      const instance = await this._resolveInstance();
      const url = await this._sign(`/api/frigate/${instance}/thumbnail/${el.dataset.thumb}`);
      const img = new Image();
      img.alt = "";
      img.onload = () => el.querySelector("ha-icon:not(.noclip)")?.replaceWith(img);
      img.src = url;
    } catch (_) {
      /* keep placeholder */
    }
  }

  /* ---- player ---- */

  _playerHtml() {
    const e = this._current;
    const list = this._visible();
    const i = list.findIndex((x) => x.id === e.id);
    const when = new Date(e.start_time * 1000).toLocaleString(this._hass?.locale?.language);
    return `
      <div class="overlay" id="overlay">
        <div class="player" role="dialog" aria-modal="true">
          <div class="bar">
            <div class="t"><b>${esc(titleCase(e.label))} · ${esc(this._camName(e.camera))}</b><small>${esc(when)}${
      e.end_time ? " · " + esc(fmtDuration(e.start_time, e.end_time)) : ""
    }</small></div>
            <button id="newer" title="Newer event" ${i <= 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button id="older" title="Older event" ${i < 0 || i >= list.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button id="close" title="Close"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="media" id="media"><div class="msg">Loading…</div></div>
        </div>
      </div>`;
  }

  _openPlayer(e) {
    this._hls?.destroy();
    this._hls = null;
    this._current = e;
    this._render();
  }

  _closePlayer() {
    this._hls?.destroy();
    this._hls = null;
    this._current = null;
    this._player = null;
    this._render();
  }

  _step(dir) {
    const list = this._visible();
    const i = list.findIndex((x) => x.id === this._current?.id);
    const next = list[i + dir];
    if (next) this._openPlayer(next);
  }

  /*
   * Prefer MSE playback (HA's ha-hls-player, else hls.js) over native HLS:
   * native HLS in Android WebViews is unreliable. Native is the last resort
   * (iOS Safari without MSE).
   */
  async _mountPlayer(media, url, e) {
    const fail = (msg) => {
      if (this._current === e) media.innerHTML = `<div class="msg">Could not play video: ${esc(msg)}</div>`;
    };
    const video = () => {
      const v = document.createElement("video");
      v.controls = true;
      v.autoplay = true;
      v.muted = true; // required for autoplay on most kiosk browsers
      v.playsInline = true;
      return v;
    };

    if (customElements.get("ha-hls-player")) {
      const p = document.createElement("ha-hls-player");
      p.hass = this._hass;
      p.url = url;
      p.controls = true;
      p.autoPlay = true;
      p.muted = true;
      p.playsInline = true;
      this._player = p;
      media.appendChild(p);
      return;
    }

    let Hls = window.Hls;
    if (!Hls) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = HLS_JS_URL;
          s.onload = resolve;
          s.onerror = () => reject(new Error("could not load hls.js"));
          document.head.appendChild(s);
        });
        Hls = window.Hls;
      } catch (_) {
        /* try native below */
      }
    }
    if (this._current !== e) return;

    const v = video();
    if (Hls?.isSupported?.()) {
      const hls = new Hls();
      this._hls = hls;
      hls.on(Hls.Events.ERROR, (_ev, d) => {
        if (d.fatal) fail(`${d.type}: ${d.details}`);
      });
      hls.loadSource(url);
      hls.attachMedia(v);
      media.appendChild(v);
      v.play().catch(() => {});
      return;
    }
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url;
      v.addEventListener("error", () => fail(`media error ${v.error?.code ?? ""}`));
      media.appendChild(v);
      return;
    }
    fail("this browser can neither play HLS natively nor load hls.js");
  }

  async _wirePlayer() {
    const root = this.shadowRoot;
    root.getElementById("close").addEventListener("click", () => this._closePlayer());
    root.getElementById("newer").addEventListener("click", () => this._step(-1));
    root.getElementById("older").addEventListener("click", () => this._step(1));
    root.getElementById("overlay").addEventListener("click", (ev) => {
      if (ev.target.id === "overlay") this._closePlayer();
    });

    const media = root.getElementById("media");
    const e = this._current;
    try {
      const instance = await this._resolveInstance();
      if (this._current !== e) return;
      if (e.has_clip === false) {
        const url = await this._sign(`/api/frigate/${instance}/snapshot/${e.id}`);
        media.innerHTML = `<img alt="Snapshot" src="${esc(url)}">`;
        return;
      }
      const url = await this._sign(`/api/frigate/${instance}/vod/event/${e.id}/index.m3u8`);
      if (this._current !== e) return;
      media.innerHTML = "";
      await this._mountPlayer(media, url, e);
    } catch (err) {
      media.innerHTML = `<div class="msg">Could not load video: ${esc(err?.message || err?.code || "unknown error")}</div>`;
    }
  }
}

/* ---- visual editor ---- */

class FrigateCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _fields() {
    return [
      ["title", "Title", "text"],
      ["frigate_client_id", "Frigate client ID (mqtt client_id from the Frigate config, blank = auto-detect)", "text"],
      ["cameras", "Default cameras (comma separated Frigate camera names, blank = all)", "list"],
      ["days", "Days to show", "number"],
      ["limit", "Max events", "number"],
      ["labels", "Only these labels (comma separated, blank = all)", "list"],
      ["zones", "Only these zones (comma separated, blank = all)", "list"],
      ["refresh_seconds", "Auto refresh (seconds, 0 = off)", "number"],
      ["max_height", "Max list height in px (0 = unlimited)", "number"],
      ["has_clip", "Only events with a clip", "bool"],
      ["group_by_day", "Group by day", "bool"],
      ["show_thumbnails", "Show thumbnails", "bool"],
      ["show_filters", "Show filters (master switch)", "bool"],
      ["show_camera_filter", "Show camera switcher chips", "bool"],
      ["show_day_selector", "Show day range selector", "bool"],
      ["show_zones", "Show zones", "bool"],
      ["show_score", "Show score", "bool"],
    ];
  }

  _build() {
    const cfg = { ...DEFAULTS, ...this._config };
    this.innerHTML = `
      <style>
        .row { display:flex; flex-direction:column; gap:2px; margin:10px 0; font-size:.9em; }
        .row.bool { flex-direction:row; align-items:center; gap:8px; }
        .row input[type=text], .row input[type=number] {
          padding:8px; border:1px solid var(--divider-color); border-radius:6px;
          background:var(--card-background-color); color:var(--primary-text-color); font:inherit;
        }
        .hint { color:var(--secondary-text-color); font-size:.8em; margin-top:8px; }
      </style>
      ${this._fields()
        .map(([key, label, kind]) => {
          const v = cfg[key];
          if (kind === "bool")
            return `<label class="row bool"><input type="checkbox" data-k="${key}" ${v ? "checked" : ""}> ${label}</label>`;
          const val =
            kind === "list"
              ? normalizeCameras(v || []).map((c) => c.id).join(", ")
              : v ?? "";
          return `<label class="row">${label}<input type="${kind === "number" ? "number" : "text"}" data-k="${key}" data-kind="${kind}" value="${esc(val)}"></label>`;
        })
        .join("")}
      <div class="hint">Per-camera display names are available in YAML: cameras: [{camera: front, name: "Front door"}].</div>`;
    this.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => this._changed(el)));
  }

  _changed(el) {
    const key = el.dataset.k;
    const config = { ...this._config };
    if (el.type === "checkbox") config[key] = el.checked;
    else if (el.dataset.kind === "number") {
      if (el.value === "") delete config[key];
      else config[key] = Number(el.value);
    } else if (el.dataset.kind === "list") {
      const items = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      // keep object-form entries (with names) when the id is unchanged
      const old = new Map(normalizeCameras(this._config[key]).map((c, i) => [c.id, (this._config[key] || [])[i]]));
      if (items.length) config[key] = items.map((id) => (typeof old.get(id) === "object" ? old.get(id) : id));
      else delete config[key];
    } else if (el.value === "") delete config[key];
    else config[key] = el.value;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

customElements.define("frigate-card", FrigateCard);
customElements.define("frigate-card-editor", FrigateCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "frigate-card",
  name: "Frigate Card",
  description: "Timeline-style list of Frigate events with thumbnails and a clip player.",
  preview: false,
});

console.info(
  `%c FRIGATE-CARD %c ${CARD_VERSION} `,
  "color:#fff;background:#03a9f4;font-weight:700",
  "color:#03a9f4;background:#fff;font-weight:700"
);
