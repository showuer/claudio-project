# AIDJ Entry And Refresh Boundary Design

## Goal

Separate navigation into the AIDJ room from the deliberate action that requests a new narrated AIDJ queue.

## Interaction Boundary

- Clicking the top `AIDJ` mode tab enters the AIDJ page.
- Entering AIDJ automatically requests a queue only when there is no recoverable playlist and no request is already streaming.
- Repeated top-tab clicks while a queue exists only restore the AIDJ page.
- The AIDJ player exposes an explicit refresh action for requesting a fresh narrated queue.
- Random, Cafe, and Library retain their existing station refresh path.

## State Rule

`stationViewMode` controls the visible page. `p.playlist` determines whether AIDJ has recoverable playback content. `c.isStreaming` prevents duplicate AIDJ requests.

## Verification

- Top-tab AIDJ navigation does not request a fresh queue when a playlist exists.
- Empty AIDJ entry requests one initial queue.
- AIDJ refresh explicitly requests a new queue.
- Other station refresh behavior remains unchanged.
