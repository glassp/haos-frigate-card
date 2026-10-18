# Frigate Card

A Home Assistant Lovelace card that shows [Frigate](https://frigate.video) events as a timeline-style list: thumbnail, time, date, camera, detected object (and recognised sub label), zones, score and duration. Selecting an event opens a player overlay with the full clip.

Requires the [Frigate integration](https://github.com/blakeblackshear/frigate-hass-integration) for Home Assistant.

## Install

Manual:

1. Copy `frigate-card.js` to `/config/www/frigate-card.js`.
2. Add a dashboard resource: URL `/local/frigate-card.js`, type **JavaScript module**.
3. Reload the browser.

HACS: open HACS, three-dot menu, **Custom repositories**, add `https://github.com/glassp/haos-frigate-card` with type **Dashboard**, then download **Frigate Card**. Or use this button:

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=glassp&repository=haos-frigate-card&category=plugin)

HACS adds the dashboard resource automatically.

## Configuration

```yaml
type: custom:frigate-card
title: Events
days: 3
limit: 200
cameras:
  - front_door
  - camera: garden
    name: Garden
labels:
  - person
  - car
```

| Option | Default | Description |
| --- | --- | --- |
| `title` | `Frigate events` | Card title. |
| `frigate_client_id` | auto | The `mqtt: client_id` from your Frigate config (Frigate's default is `frigate`). Detected automatically via the integration's media source; set it if detection fails or you run several Frigate instances. |
| `cameras` | all | Cameras shown by default. Strings (Frigate camera names) or `{camera, name}` objects for a display name. Empty means all cameras. |
| `days` | `3` | How many days back to load. The card also has a day selector. |
| `limit` | `200` | Maximum number of events loaded. |
| `labels` | all | Only events with these labels. |
| `zones` | all | Only events in these zones. |
| `has_clip` | `true` | Only events that have a recorded clip. |
| `group_by_day` | `true` | Day headers in the list. |
| `show_thumbnails` | `true` | Show event thumbnails. |
| `show_filters` | `true` | Master switch: `false` hides both the camera switcher and day selector. |
| `show_camera_filter` | `true` | Camera switcher chips. They toggle cameras at runtime (not saved). |
| `show_day_selector` | `true` | Day range dropdown. |
| `show_zones` / `show_score` | `true` | Show zones and top score in the row. |
| `refresh_seconds` | `60` | Auto refresh interval, `0` disables it. |
| `max_height` | `0` | Max list height in px, `0` for unlimited. |

The player supports Esc to close and the left/right arrow keys to step to newer/older events. Clips are played via the integration's HLS (`vod`) endpoint using Home Assistant's `ha-hls-player`, or natively in Safari.

## License

MIT
