"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { bakeStudioLens, STUDIO_DISPERSION, type StudioLensSize } from "./studio-lens";

const svgNamespace = "http://www.w3.org/2000/svg";
const surfaceSelector = '.af-glass-surface, [data-site-surface="panel"], [data-site-surface="popover"]';
const opticsAttribute = "data-af-glass-optics";
const studioFilter = "--af-studio-filter";
const studioRim = "--af-studio-rim";
const maxUnusedLenses = 24;
const androidBackdrop = "blur(3px) saturate(1.28)";
const channelMatrices = [
  "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
] as const;

function appendSvg(parent: SVGElement, tag: string, attributes: Record<string, string>) {
  const node = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent.append(node);
  return node;
}

function createFilter(svg: SVGSVGElement, id: string, map: string, scale: number, disperse: boolean) {
  const filter = appendSvg(svg, "filter", {
    id, x: "0%", y: "0%", width: "100%", height: "100%", "color-interpolation-filters": "sRGB",
  });
  appendSvg(filter, "feImage", {
    href: map, x: "0%", y: "0%", width: "100%", height: "100%", preserveAspectRatio: "none", result: "studioLens",
  });
  const sample = { in: "SourceGraphic", in2: "studioLens", xChannelSelector: "R", yChannelSelector: "G" };
  if (!disperse) {
    appendSvg(filter, "feDisplacementMap", { ...sample, scale: String(scale) });
    return filter;
  }
  for (const [channel, factor] of STUDIO_DISPERSION.entries()) {
    appendSvg(filter, "feDisplacementMap", {
      ...sample, scale: String(scale * factor), result: `sample${channel}`,
    });
    appendSvg(filter, "feColorMatrix", {
      in: `sample${channel}`, type: "matrix", values: channelMatrices[channel], result: `channel${channel}`,
    });
  }
  appendSvg(filter, "feBlend", { in: "channel0", in2: "channel1", mode: "screen", result: "redGreen" });
  appendSvg(filter, "feBlend", { in: "redGreen", in2: "channel2", mode: "screen" });
  return filter;
}

function getSize(surface: HTMLElement): StudioLensSize | null {
  const { offsetWidth: width, offsetHeight: height } = surface;
  if (width < 2 || height < 2) return null;
  const style = getComputedStyle(surface);
  const value = style.borderTopLeftRadius;
  const rawRadius = Number.parseFloat(value) || 0;
  // Semantic roles also appear on unframed groups. Their layout needs no rim.
  if (!surface.classList.contains("af-glass-surface") && !rawRadius && !Number.parseFloat(style.borderTopWidth)) return null;
  const radius = Math.min(width / 2, height / 2, value.endsWith("%") ? rawRadius / 100 * width : rawRadius);
  return { width, height, radius };
}

type CachedLens = { filter: SVGElement | null; rim: string; backdrop: string; users: number };

function getSurfacePath(surface: HTMLElement) {
  const path: string[] = [];
  for (let element: Element | null = surface; element && element !== document.body; element = element.parentElement) {
    if (element.id && document.getElementById(element.id) === element) {
      path.unshift(`#${CSS.escape(element.id)}`);
      return path.join(" > ");
    }
    let position = 1;
    for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) position++;
    path.unshift(`${element.localName}:nth-child(${position})`);
  }
  return ["body", ...path].join(" > ");
}

export type GlassOpticsProps = {
  targetRef?: RefObject<HTMLElement | null>;
  cssVariable: `--${string}`;
  displacementScale?: number;
  onActiveChange?: (target: HTMLElement, active: boolean) => void;
};

export function SiteGlassOptics() {
  return <GlassOptics cssVariable="--af-glass-optics" displacementScale={28} />;
}

export function GlassOptics({ targetRef, cssVariable, displacementScale = 42, onActiveChange }: GlassOpticsProps) {
  const idPrefix = `af-studio-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const target = targetRef ? targetRef.current : document.body;
    const svg = svgRef.current;
    if (!target || !svg || !Array.isArray(document.adoptedStyleSheets)) return;
    const filters: SVGSVGElement = svg;
    const stylesheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet];
    const agent = navigator.userAgent;
    const androidSite = !targetRef && /Android/.test(agent);
    const supportsRefraction = /Chrome|Chromium|Edg/.test(agent) && !/iPhone|iPad|iPod/.test(agent) &&
      CSS.supports("backdrop-filter", `url("#${idPrefix}")`);
    // Android WebView can refract a floating control, but stacking filters across a list is expensive.
    const siteRefraction = supportsRefraction && !androidSite;
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    let sequence = 0;
    const cache = new Map<string, CachedLens>();
    const unusedLenses = new Set<string>();
    const attached = new Map<HTMLElement, string>();
    const visible = new Set<HTMLElement>();
    const tracked = new Set<HTMLElement>();
    let frame = 0;
    let currentStyles = "";

    // Keep responsive styles outside the React tree. Streamed content can still be hydrating.
    function writeStyles() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const imports = !transparency.matches && siteBackdrop
          ? [`${getSurfacePath(target!)} { ${cssVariable}: ${siteBackdrop}; }`]
          : [];
        const selectorsByLens = new Map<CachedLens, string[]>();
        for (const [surface, key] of attached) {
          const lens = cache.get(key);
          if (!lens || !surface.isConnected) continue;
          const selector = getSurfacePath(surface);
          const selectors = selectorsByLens.get(lens);
          if (selectors) selectors.push(selector);
          else selectorsByLens.set(lens, [selector]);
        }
        for (const [lens, selectors] of selectorsByLens) {
          const backdrop = lens.filter ? `${studioFilter}: ${lens.backdrop};` : "";
          imports.push(`${selectors.join(", ")} { ${backdrop} ${studioRim}: url("${lens.rim}"); }`);
        }
        const nextStyles = imports.join("\n");
        if (nextStyles === currentStyles) return;
        stylesheet.replaceSync(nextStyles ? `@media screen { ${nextStyles} }` : "");
        currentStyles = nextStyles;
      });
    }

    function acquire(size: StudioLensSize, key: string, refraction: boolean) {
      const known = cache.get(key);
      if (known) {
        known.users++;
        unusedLenses.delete(key);
        return known;
      }
      const baked = bakeStudioLens(size, refraction);
      if (!baked) return null;
      const id = `${idPrefix}-${++sequence}`;
      const scale = Math.min(displacementScale, size.height * 0.6);
      const filter = baked.map ? createFilter(filters, id, baked.map, scale, !androidSite) : null;
      const result = { filter, rim: baked.rim, backdrop: `blur(3px) url("#${id}") saturate(1.28)`, users: 1 };
      cache.set(key, result);
      return result;
    }

    function release(key: string) {
      const lens = cache.get(key);
      if (!lens || --lens.users) return;
      // Retain recently viewed shapes so scrolling back does not re-encode their maps.
      unusedLenses.add(key);
      if (unusedLenses.size <= maxUnusedLenses) return;
      const oldest = unusedLenses.values().next().value;
      if (oldest === undefined) return;
      cache.get(oldest)?.filter?.remove();
      cache.delete(oldest);
      unusedLenses.delete(oldest);
    }

    function clear(surface: HTMLElement) {
      const key = attached.get(surface);
      if (!key) return;
      attached.delete(surface);
      release(key);
      writeStyles();
    }

    function update(surface: HTMLElement) {
      if (transparency.matches || !visible.has(surface)) return clear(surface);
      const size = getSize(surface);
      if (!size) return clear(surface);
      const refraction = siteRefraction || (supportsRefraction && surface.getAttribute(opticsAttribute) === "lens");
      const key = `${size.width}:${size.height}:${size.radius}:${refraction}`;
      if (attached.get(surface) === key) return;
      const lens = acquire(size, key, refraction);
      if (!lens) return;
      clear(surface);
      attached.set(surface, key);
      writeStyles();
    }

    const resize = new ResizeObserver(entries => {
      for (const { target: surface } of entries) update(surface as HTMLElement);
    });
    const intersection = new IntersectionObserver(entries => {
      for (const { target: surface, isIntersecting } of entries) {
        const element = surface as HTMLElement;
        if (!tracked.has(element)) continue;
        if (isIntersecting) visible.add(element);
        else visible.delete(element);
        update(element);
      }
    }, { rootMargin: "120px" });

    function register(surface: HTMLElement) {
      if (tracked.has(surface)) return;
      tracked.add(surface);
      resize.observe(surface);
      intersection.observe(surface);
    }

    function unregister(surface: HTMLElement) {
      if (!tracked.delete(surface)) return;
      resize.unobserve(surface);
      intersection.unobserve(surface);
      visible.delete(surface);
      clear(surface);
    }

    const mutations = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") {
          const surface = record.target as HTMLElement;
          if (record.attributeName === opticsAttribute) {
            if (visible.has(surface)) update(surface);
          } else if (surface.matches(surfaceSelector)) register(surface);
          else unregister(surface);
          continue;
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(surfaceSelector)) register(node);
          node.querySelectorAll<HTMLElement>(surfaceSelector).forEach(register);
        }
      }
      if (records.some(record => record.type === "childList" &&
        ([...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLElement)))) {
        for (const surface of tracked) if (!surface.isConnected) unregister(surface);
        writeStyles();
      }
    });

    // Host aliases that cannot supply their own shape still use the Studio curve.
    const baseKey = "site";
    const base = siteRefraction ? acquire({ width: 216, height: 112, radius: 16 }, baseKey, true) : null;
    const siteBackdrop = base?.backdrop ?? (androidSite ? androidBackdrop : null);
    const updatePreference = () => {
      onActiveChange?.(target, Boolean(base?.filter && !transparency.matches));
      for (const surface of visible) update(surface);
      writeStyles();
    };
    if (!targetRef) {
      target.querySelectorAll<HTMLElement>(surfaceSelector).forEach(register);
      mutations.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-site-surface", opticsAttribute] });
    }
    updatePreference();
    transparency.addEventListener("change", updatePreference);

    return () => {
      resize.disconnect();
      intersection.disconnect();
      mutations.disconnect();
      transparency.removeEventListener("change", updatePreference);
      cancelAnimationFrame(frame);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== stylesheet);
      for (const lens of cache.values()) lens.filter?.remove();
      onActiveChange?.(target, false);
    };
  }, [cssVariable, displacementScale, idPrefix, onActiveChange, targetRef]);

  return <svg ref={svgRef} width="0" height="0" aria-hidden="true" focusable="false"
    style={{ position: "absolute", pointerEvents: "none" }} />;
}
