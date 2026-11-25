# Flowers For Her

An animated ASCII lily bouquet website.

It opens on a little blue folder labelled **"For Asmaa"**. Tap it and three papers come
out: the **"Flowers for her"** card (a peek at the bouquet, a "new" badge, a little note and the song), and two
**"Upcoming"** placeholder cards (skeleton picture and lines, a "soon" badge). Tapping the Flowers card opens the page. (The folder is the React Bits
`<Folder />` component, in `public/folder.js` + `folder.css`; React itself loads from a CDN.
If React can't load, the page falls back to a plain "tap to open" screen.)

Then it starts with a cute cartoon calico cat trotting in from the left. It skids to
a stop in the middle, hops, says **"Asmaa!"** in a comic speech bubble and
waves, then zooms off to the right. Once it's gone, the flowers start growing.

A 3D bouquet of stargazer-style lilies (pink stripes, pale edges, speckles and
orange stamens) with buds, leaves and a pink ribbon bow, drawn as coloured
ASCII characters on a black background. The stems grow, the lilies bloom open
one after another from the middle outwards and stay open, gently swaying and
breathing, while pastel stars twinkle behind them.

## Website (Vercel)

Everything lives in `public/` (plain JavaScript, no build step): `index.html`,
`flowers.js` (the animation and music), `welcome.js` + `folder.js` + `folder.css` (the
opening folder) and `bouquet.webp` (the polaroid's picture, a frame of the bouquet).

Try it locally with any static file server, for example:

```
npx serve public
```

and open the address it prints.

Deploy on Vercel (either way works):

- **GitHub:** push this repo, then in Vercel click *Add New -> Project*, import the
  repo, keep the framework preset as **Other**, and deploy. `vercel.json` already
  tells Vercel to serve the `public/` folder.
- **CLI:** run `npx vercel` in this folder (then `npx vercel --prod`).

Options go in the URL:

| URL option          | Example                      | What it does                        |
|---------------------|------------------------------|-------------------------------------|
| `say`               | `?say=Asmaa!`                | what the cat says                   |
| `message`           | `?message=For%20you`         | line under the bouquet              |
| `intro=0`           | `?intro=0`                   | skip the cat                        |
| `tint`              | `?tint=0`                    | pure ASCII on black                 |
| `seed`              | `?seed=3`                    | a different bouquet                 |
| `music=0`           | `?music=0`                   | no music                            |
| `yt`                | `?yt=WOD_R7Yu8vw`            | which YouTube video plays           |
| `folder=0`          | `?folder=0`                  | skip the folder ("tap to open")     |

Once the lilies have bloomed, a **Re-bloom** button appears at the bottom; it
regrows the bouquet from the start (without replaying the cat). The small **home**
button in the top-left corner fades the flowers and the song out and brings the folder
back.

The folder and the flowers are two pages: home (the folder) and **`#flowers`** (cat,
bouquet, Re-bloom, sound control, home button). The music belongs to the flowers page
only: leaving it stops the song, and if anything starts it while the folder is showing
(phone lock-screen or headphone controls, media keys) it is paused straight away. The
browser's back/forward buttons move between the two pages, and a link straight to
`…/#flowers` opens the flowers page with a "tap to open" (phones need a tap before music).

### Music

"Heartbeat" (Joe Hisaishi, *Howl's Moving Castle*) plays from YouTube
(https://youtu.be/WOD_R7Yu8vw) through YouTube's player, kept invisible (note: YouTube's
API terms ask for a visible player of at least 200x200). It starts on the same frame
as the flowers: the song is buffered (muted) while the cat walks, and the bouquet waits
until YouTube is really playing (never more than 3 s). It loops while the bouquet stays,
and starts again with **Re-bloom**.

- Browsers only allow sound after a tap, so the page only starts when the "Flowers for
  her" polaroid in the folder is tapped (or the plain **"tap to open"** screen, without
  the folder). That tap works once YouTube has loaded (until then the hint says "one
  moment…"), and it starts the player (silently, to buffer). iPhones only allow the song later
  if the player was started during a tap, so this is what makes the first bloom play
  there too. The video itself never shows, and there is no other button to tap.
- The top-right button mutes/unmutes; the slider next to it sets the volume (it shows
  on hover on a computer and is always visible on phones; iPhones only get mute, since
  their volume is the side buttons). The setting is remembered on that device.
- `?yt=VIDEO_ID` plays a different YouTube video, `?ytstart=1.5` skips the first 1.5 s of
  it, and `?music=0` turns the music off.

Keys: Space = pause, R = restart.
