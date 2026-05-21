# TTS Speaking Overlay Design

## Goal

Clicking the Claudio bar opens a full-screen TTS speaking overlay that matches the provided reference: black analyzer header, white rounded playback card, timestamped transcript, and bottom mini player. Closing the overlay returns to the existing home page.

## Scope

The implementation follows the engineering diagram's USER, BRAIN, MUSIC, VOICE I/O, runtime aggregation, and PWA layers. UPnP/Naim integration is explicitly out of scope. Existing DeepSeek chat, NCM playback, scheduler, favorites, and regular player behavior must remain intact.

## Backend Contract

DeepSeek still produces complete structured text through the existing chat route. The TTS layer upgrades Fish Audio to the timestamp streaming endpoint:

`POST https://api.fish.audio/v1/tts/stream/with-timestamp`

The request uses `s2-pro`, the configured default `reference_id`, and the Clash proxy at `127.0.0.1:7897` when Fish is available. The service collects each SSE `audio_base64` chunk, concatenates the audio bytes, normalizes Fish alignment snapshots into global `{ text, start, end }` segments, writes the cached audio file, and returns:

```json
{
  "audioUrl": "/cache/tts/<hash>.mp3",
  "duration": 29000,
  "alignment": {
    "segments": [
      { "text": "1971年", "start": 5.0, "end": 6.2 }
    ]
  }
}
```

If Fish timestamp synthesis fails, the existing MiMo or Fish non-timestamp fallback may still return audio without alignment so chat does not break.

## Frontend Behavior

The Claudio bar becomes clickable. When the newest DJ message has a TTS URL, the overlay opens and plays that TTS audio in its own `<audio>` element. `audio.currentTime` drives the progress bar, visible time labels, and transcript highlighting. Once the overlay narration ends, the existing music playlist may continue through the current player logic.

The overlay contains:

- Black top area with avatar, dot-matrix Claudio display name, green "Speaking..." breathing status, timer, close button, and a white vertical-line spectrum.
- Real Web Audio `AnalyserNode` spectrum from the overlay audio element. No random fake waveform for the main spectrum.
- White rounded card with title/artist, play-pause button, progress track, timestamped transcript, and bottom mini spectrum.
- Transcript styles: read text black, current segment mint green background with black text, unread text light gray.

## Error Handling

If no TTS message exists, clicking Claudio opens the overlay with the current song metadata and an empty transcript state. If browser autoplay blocks playback, the overlay remains open and the user can press play. If Web Audio cannot initialize, playback and transcript still work.

## Verification

Run server and web TypeScript builds. Fix the pre-existing server `stream.ts` header type error so the backend build is a useful gate. Verify the overlay in a browser against the supplied visual reference.
