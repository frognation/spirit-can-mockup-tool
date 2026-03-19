# CanEditor Original

Local dev: npm install && npm run dev, then open http://localhost:3000

## Versioning

- Archived `1.0` baseline: Git tag `v1.0.0`
- Maintenance branch for `1.x`: `release/1.0`
- Current development line on `main`: `2.0.0`

## Publishing (Vercel + GitHub Pages redirect)

### What happens when you push

- Pushing to `main` updates the code on GitHub.
- If this repo is connected to Vercel, Vercel will build/deploy automatically on push.
- GitHub Pages for this repo is configured as a simple redirect site that forwards visitors to the Vercel URL.

### Redirect target

- Vercel URL: https://can-editor-original.vercel.app/

If you ever change the Vercel domain, update it in:

- `docs/index.html`
- `docs/404.html`

Then commit + push. GitHub Pages will start redirecting to the new URL after the Pages workflow finishes.

### GitHub user homepage “Live” link

If your `frognation.github.io` project list links to this repo’s Pages URL (e.g. `https://frognation.github.io/CanEditor_Original/`), it will redirect to Vercel automatically.

## Default Settings

The initial defaults for lighting, bar highlight, camera FOV, label roughness, and metal colors live in `src/app/page.tsx`.

- Label roughness: `0.21`
- Camera FOV: `10`
- Bar Light: enabled, color `#fafafa`, intensity `1.10`, rotation `360°`, y `-1.91`, distance `3.6`, width `10.1`, height `11.1`
- Other Lights: strength `1.61×`, rotation `130°`, ambient `2.7`, fill `4.3`, rim `5.6`, directional `4.2`, base env intensity `2.32`, directional position `[1000, 500, 500]`
- Metal:
  - Top: color `#c7c7c7`, roughness `0.48`, brightness `1.35`, emissive `0.01`, receiveShadow ✅
  - Bottom: color `#b8b8b8`, roughness `0.46`, brightness `1.40`, emissive `0.01`, receiveShadow ✅

"Reset to Default" uses the same values.

To change these later, edit the corresponding `useState` initializers and the `resetToDefault` function in `src/app/page.tsx`.

## Presets (JSON)

You can now save and load presets.

- Buttons: sidebar → Controls → Presets → Save JSON / Load JSON
- A file named `can-editor-preset.json` will be downloaded for saves.

### JSON schema

```
{
  "version": 1,
  "canSize": "355ml" | "475ml",
  "labelRoughness": 0.21,
  "cameraFov": 10,
  "metalSettings": {
    "top": { "color": "#c7c7c7", "brightness": 1.35, "roughness": 0.48, "emissiveIntensity": 0.01, "castShadow": false, "receiveShadow": true, "envMapIntensity": 1.4 },
    "bottom": { "color": "#b8b8b8", "brightness": 1.40, "roughness": 0.46, "emissiveIntensity": 0.01, "castShadow": false, "receiveShadow": true, "envMapIntensity": 1.5 }
  },
  "lightingSettings": {
    "exposure": 1.43,
    "envIntensity": 2.32,
    "ambientIntensity": 2.7,
    "fillLightIntensity": 4.3,
    "fillLightPosition": [5, 0, 5],
    "rimLightIntensity": 5.6,
    "rimLightPosition": [-5, 0, 5],
    "directionalIntensity": 4.2,
    "directionalPosition": [1000, 500, 500],
    "otherRotation": 2.2689280275926285,
    "otherStrength": 1.61
  },
  "bar": {
    "enabled": true,
    "color": "#fafafa",
    "intensity": 1.1,
    "width": 10.1,
    "height": 11.1,
    "distance": 3.6,
    "rotation": 6.283185307179586,
    "y": -1.91
  },
  "rotation": [0, 0, 0],
  "isAutoRotating": false
}
```

Unknown fields are ignored. Missing fields keep their current values.
