# Light Direction 🔦

Read the form, place the light — trains the values instinct of tracing a
highlight and terminator back to the light source. A hidden sun lambert-shades
a matte form (spheres, then lumpy blended blobs, contrast falling and
elevations going extreme as the round ramps); you place a sun marker on an
azimuth ring + elevation arc and lock it in. After every guess the true sun is
revealed with side-by-side shaded patches and the miss in degrees.

Scoring is pure geometry: per form `100 · clamp(1 − max(0, angErr − 3°) / 42°)`
— 100 within a 3° grace cone, 0 at 45° off — where `angErr` is the 3D angle
between your light vector and the true one; a round is the mean of 6 forms.

Run it: `python3 -m http.server 8080` in this folder — zero build, zero deps.

Part of [Art Daily](https://artdaily.sadeali.com/) · more at [sadeali.com](https://sadeali.com/)
