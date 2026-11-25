// Optics ported from Liquid Glass Studio's fragment-main.glsl (MIT).
// See NOTICE.md for the source revision and copyright notice.

export type StudioLensSize = { width: number; height: number; radius: number };

export const STUDIO_DISPERSION = [1.14, 1, 0.86] as const;

const REFRACTIVE_INDEX = 1.4;
const MAX_EDGE_THICKNESS = 20;
const NEUTRAL_CHANNEL = 128;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function edgeFactor(depth: number, thickness: number) {
  const surface = clamp(1 - depth / thickness, 0, 1) ** 2;
  const incidence = Math.asin(surface);
  const transmission = Math.asin(surface / REFRACTIVE_INDEX);
  return Math.tan(incidence - transmission);
}

const SURFACE_EDGE_FACTOR = edgeFactor(0, MAX_EDGE_THICKNESS);

function highlight(depth: number, normalX: number, normalY: number) {
  // The shader uses a fifth-power falloff and a double-angle light with two peaks.
  const fresnel = Math.max(0, 1 - depth / 5.4) ** 5;
  const angle = Math.atan2(-normalY, normalX);
  const phase = ((angle + 2 * Math.PI) % (2 * Math.PI) - Math.PI / 4) * 2;
  const oppositeSide = phase > Math.PI * 1.5 && phase < Math.PI * 3.5;
  const glare = ((0.5 + Math.sin(phase) * 0.5) * (oppositeSide ? 0.38 : 0.7)) ** 0.86;
  return 1 - (1 - fresnel * 0.17) * (1 - fresnel * glare);
}

export function bakeStudioLens({ width, height, radius }: StudioLensSize) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, 320);
  canvas.height = Math.min(height, 224);
  const context = canvas.getContext("2d");
  if (!context) return null;

  const displacement = context.createImageData(canvas.width, canvas.height);
  const rim = context.createImageData(canvas.width, canvas.height);
  const rimThickness = Math.min(MAX_EDGE_THICKNESS, width / 4, height / 4);
  const contactWidth = Math.max(2, 1.5 * width / canvas.width, 1.5 * height / canvas.height);
  const innerHalfWidth = width / 2 - radius;
  const innerHalfHeight = height / 2 - radius;

  for (let row = 0; row < canvas.height; row++) {
    const y = (row + 0.5) * height / canvas.height - height / 2;
    for (let column = 0; column < canvas.width; column++) {
      const x = (column + 0.5) * width / canvas.width - width / 2;
      const offset = 4 * (row * canvas.width + column);
      displacement.data[offset] = NEUTRAL_CHANNEL;
      displacement.data[offset + 1] = NEUTRAL_CHANNEL;
      displacement.data[offset + 3] = 255;

      const dx = Math.abs(x) - innerHalfWidth;
      const dy = Math.abs(y) - innerHalfHeight;
      const roundedX = Math.max(0, dx);
      const roundedY = Math.max(0, dy);
      const cornerDistance = Math.hypot(roundedX, roundedY);
      const depth = radius - cornerDistance - Math.min(0, Math.max(dx, dy));
      if (depth < -1 || depth >= rimThickness) continue;

      const sideX = dx >= dy ? 1 : 0;
      const normalX = Math.sign(x) * (cornerDistance ? roundedX / cornerDistance : sideX);
      const normalY = Math.sign(y) * (cornerDistance ? roundedY / cornerDistance : 1 - sideX);
      // Let all three color samples meet the unchanged backdrop at the contact edge.
      const contact = clamp(depth / contactWidth, 0, 1);
      const contactFade = contact * contact * (3 - 2 * contact);
      const bend = contactFade * edgeFactor(Math.max(0, depth), rimThickness) / SURFACE_EDGE_FACTOR;
      displacement.data[offset] -= Math.round(127 * normalX * bend);
      displacement.data[offset + 1] -= Math.round(127 * normalY * bend);

      rim.data[offset] = 255;
      rim.data[offset + 1] = 255;
      rim.data[offset + 2] = 255;
      rim.data[offset + 3] = Math.round(255 * highlight(Math.max(0, depth), normalX, normalY));
    }
  }

  context.putImageData(displacement, 0, 0);
  const map = canvas.toDataURL();
  context.putImageData(rim, 0, 0);
  return { map, rim: canvas.toDataURL() };
}
