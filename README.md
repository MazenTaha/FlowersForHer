# Flowers For Her

An animated ASCII lily bouquet written in Python.

It starts with a cute 2D calico cat walking in from the left. It stops in the
middle, hops, and says **"Asmaa!"** in a comic speech bubble, then walks off
to the right. Once it's gone, the flowers start growing.

A 3D bouquet of stargazer-style lilies (pink stripes, pale edges, speckles and
orange stamens) with buds, leaves and a pink ribbon bow, drawn as coloured
ASCII characters on a black background. The stems grow, the lilies bloom open
one after another from the middle outwards and stay open, gently swaying and
breathing, while pastel stars twinkle behind them.

## Website (Vercel)

The web version lives in `public/` (`index.html` + `flowers.js`, plain JavaScript,
no build step). It does the same thing as the Python version: the calico cat
intro, then the lily bouquet.

Try it locally:

```
python -m http.server 5173 --directory public
```

and open http://localhost:5173.

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

Once the lilies have bloomed, a **Re-bloom** button appears at the bottom; it
regrows the bouquet from the start (without replaying the cat).

### Music

"Heartbeat" (Joe Hisaishi, *Howl's Moving Castle*) plays from YouTube
(https://youtu.be/WOD_R7Yu8vw) through YouTube's player, kept invisible (note: YouTube's
API terms ask for a visible player of at least 200x200). It starts on the same frame
as the flowers: the song is buffered (muted) while the cat walks, and the bouquet waits
until YouTube is really playing (never more than 3 s). It loops while the bouquet stays,
and starts again with **Re-bloom**.

- Browsers only allow sound after a tap, so the page opens with a little
  **"tap to open"** screen first. The invisible player lies over that screen, so the
  opening tap lands on it directly; that is what lets even iPhones play the song later.
  The video itself never shows, and there is no other button to tap.
- The top-right button mutes/unmutes; the slider next to it sets the volume (it shows
  on hover on a computer and is always visible on phones; iPhones only get mute, since
  their volume is the side buttons). The setting is remembered on that device.
- `?yt=VIDEO_ID` plays a different YouTube video, `?ytstart=1.5` skips the first 1.5 s of
  it, and `?music=0` turns the music off.

Keys: Space = pause, R = restart.

## Run (Python)

```
pip install -r requirements.txt
python flowers.py
```

Run it in the terminal instead of a window (Windows Terminal recommended, maximise it and shrink the font for more detail):

```
python flowers.py --terminal
```

Add a line under the bouquet:

```
python flowers.py --message "For you"
```

## Keys (window)

| Key        | Action          |
|------------|-----------------|
| Space      | pause / resume  |
| S          | save screenshot |
| Esc / Q    | quit            |

## Options

| Option            | Default | What it does                                              |
|-------------------|---------|-----------------------------------------------------------|
| `--terminal`      | off     | draw in the terminal instead of a window                  |
| `--message TEXT`  | none    | text shown under the bouquet                              |
| `--say TEXT`      | Asmaa!  | what the cat says in its speech bubble                    |
| `--no-intro`      | off     | skip the cat and start straight with the flowers          |
| `--font-size N`   | 9       | window character size; smaller means more detail           |
| `--width/--height`| auto    | window size in pixels                                     |
| `--tint 0-1`      | 0.45    | dim colour behind each character; `0` = pure ASCII on black |
| `--seed N`        | 7       | a different seed gives a different bouquet                |
| `--fps N`         | 30      | frame rate                                                |
| `--save FILE --at T` | -    | render the frame at time `T` seconds to a PNG and exit    |
