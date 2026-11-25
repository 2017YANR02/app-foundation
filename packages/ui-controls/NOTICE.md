Derived from CubeRoot core/packages/timer-ui/src/BoolToggle.tsx and bool-toggle.css, and core/packages/client/components/PillToggle/PillToggle.tsx and PillToggle.css. Original author: 2017YANR02. GPL-3.0-only retained. Adaptations: namespaced CSS, injected theme tokens, visible keyboard focus and reduced-motion support. No application state or services included.

0.2.0: SearchInput derives from CubeRoot core/packages/timer-ui/src/SearchInput.tsx; Tooltip from core/packages/client/components/Tooltip.tsx. PasswordInput combines CubeRoot components/PasswordInput.tsx and Mira apps/mira-web/src/components/forms/PasswordInput.tsx. Dialog generalizes Mira RegistrationDialog.tsx and QrCodeDialog.tsx. All author 2017YANR02, GPL-3.0-only. Localization, icons, application routing, QR assets and authentication stay in consumers.

0.2.1: GlassOptics derives from CubeRoot `core/packages/app-ui/src/PrimaryNavigationOptics.tsx`, introduced in `54cdb0183` and updated through `eaa027a99`. Mira previously ported it to `apps/mira-web/src/components/layout/NavigationGlassOptics.tsx` in `337d4d74`. GPL-3.0-only retained. Hosts supply the target, CSS property and activation handling.

0.2.2: Glass surface styles derive from CubeRoot `core/packages/client/components/site-surfaces.css` and `core/packages/app-ui/src/appearance-material.css`. GPL-3.0-only retained. Hosts supply layout, state and theme colors.

0.2.4: Edge refraction, optical dispersion and Fresnel/directional highlights ported from Liquid Glass Studio, src/shaders/fragment-main.glsl. The web port runs on the browser backdrop through per-surface SVG displacement and a baked highlight. Full upstream MIT license follows.

Liquid Glass Studio upstream revision: 36e8ef2e512886605c488ad760f1899b909b64ee

MIT License

Copyright (c) 2024 Charles Yin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
