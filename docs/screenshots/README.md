# Screenshots

Every image here is a capture of the studio actually running, at 1440x900, in
a pinned Chromium. None of them is a mock-up and none has been retouched.

| File | Screen |
|---|---|
| [studio.png](studio.png) | The studio: the film, the room preview, the transport, and the timeline over the demo score |
| [studio-film-picker.png](studio-film-picker.png) | The film picker open and filtering, with the current film marked |
| [studio-menu.png](studio-menu.png) | The right-click menu on the timeline ruler |
| [library.png](library.png) | The library: films, whether each has a score, and the analysis queue |
| [admin-rigs.png](admin-rigs.png) | Admin, Rigs: which rigs exist and which is in use |
| [admin-devices.png](admin-devices.png) | Admin, Devices: what the loaded rig says is out there |
| [admin-boards.png](admin-boards.png) | Admin, Boards: what is physically wired to an ESP32 |
| [admin-firmware.png](admin-firmware.png) | Admin, Firmware: putting the node firmware on a board |
| [admin-room.png](admin-room.png) | Admin, Room preview: how the 3D preview opens |

## What is not real in them

This matters more than the list above, because a screenshot is trusted in a
way prose is not.

- **The films are zero-byte fixtures.** The video pane is therefore empty and
  the transport reads 0:00. With a real film it shows the film. The names are
  real release names because that is what makes a search box worth having, but
  there is no video behind any of them.
- **The score is `examples/demo.componium`**: two minutes, two tracks, three
  cues and a sunrise. A feature film's score has thousands of cues across nine
  tracks, which looks denser and is the case the timeline was actually designed
  for. What is on screen is the shape, not the scale.
- **The room is drawn by SwiftShader**, software WebGL, because there is no GPU
  and no display. It is a real browser running real three.js, which is the
  point, but the frame counter in its corner (0 to 4 fps) is measuring the
  software renderer rather than anything a person would see.
- **Admin, Boards shows the empty state on purpose.** The capture studio is
  started without a `-boards` file, so the page correctly says nothing can be
  remembered. That is the honest state for a machine with no boards attached,
  and it is what a new installation looks like.
- **The library's analysis queue is empty**, for the same reason: nothing has
  been analysed, because there is nothing to analyse.

## Refreshing them

```sh
cd web
npm run shots
```

It starts its own studio over the fixture films and its own dev server, takes
the pictures, and stops both. Nothing on the machine is touched, and the images
land in this directory, so the diff shows exactly which screens changed.

They are captured by a Playwright project (`web/e2e/shots/`) rather than a
script, which is not ceremony: the servers, the fixture and the pinned browser
were all built for the browser suite and there is no reason to have a second
copy of any of them. It also means each capture is an assertion. A page that
renders an error instead of itself fails the run rather than being
photographed, which is the failure mode of every screenshot pipeline and has
happened here before: an older script twice photographed a stale process, and
both images looked entirely plausible.

There is no pixel comparison against these. They exist for people reading the
documentation, and tying the build to them would turn every legitimate design
change into a red build.
