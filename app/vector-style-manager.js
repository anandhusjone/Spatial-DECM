(function initVectorStyleManager(global) {
  const defaultFontFamily = "Inter, Segoe UI, Arial, sans-serif";

  function mergeDeep(base, override) {
    const output = { ...base };
    Object.keys(override || {}).forEach((key) => {
      if (
        override[key] &&
        typeof override[key] === "object" &&
        !Array.isArray(override[key]) &&
        base[key] &&
        typeof base[key] === "object" &&
        !Array.isArray(base[key])
      ) {
        output[key] = mergeDeep(base[key], override[key]);
      } else if (override[key] !== undefined) {
        output[key] = override[key];
      }
    });
    return output;
  }

  function createDefaultStyleConfig(color = "#1db7a6") {
    return {
      mode: "single",
      field: "",
      singleColor: color,
      categorized: { valueColors: {} },
      graduated: { ramp: "teal-blue", method: "equal", classCount: 5 },
      rules: [],
      point: {
        shape: "circle",
        size: 14,
        fillColor: color,
        strokeColor: "#ffffff",
        strokeWidth: 2,
        opacity: 0.95,
        iconUrl: "",
      },
      line: {
        color,
        width: 3,
        opacity: 0.92,
        dashStyle: "solid",
        dashPattern: "",
        lineCap: "round",
        lineJoin: "round",
      },
      polygon: {
        fillColor: color,
        fillOpacity: 0.22,
        strokeColor: color,
        strokeWidth: 3,
        strokeOpacity: 0.92,
        strokeStyle: "solid",
        outlineOnly: false,
      },
    };
  }

  function cloneStyleConfig(styleConfig, fallbackColor = "#1db7a6") {
    return mergeDeep(createDefaultStyleConfig(fallbackColor), styleConfig || {});
  }

  function createDefaultLabelConfig() {
    return {
      enabled: false,
      field: "",
      expression: "",
      placement: "auto",
      linePlacement: "parallel",
      polygonPlacement: "centroid",
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      minZoom: 0,
      maxZoom: 22,
      priority: 5,
      avoidOverlap: true,
      repeat: false,
      wrap: 24,
      style: {
        fontFamily: defaultFontFamily,
        fontSize: 12,
        bold: false,
        italic: false,
        underline: false,
        color: "#f8fafc",
        opacity: 1,
        haloColor: "#07111d",
        haloSize: 2,
        backgroundColor: "transparent",
        borderColor: "transparent",
        borderRadius: 0,
        shadow: false,
      },
    };
  }

  function cloneLabelConfig(labelConfig) {
    return mergeDeep(createDefaultLabelConfig(), labelConfig || {});
  }

  function getGeometryKind(feature) {
    const type = feature?.geometry?.type || "";
    if (type.includes("Point")) return "point";
    if (type.includes("LineString")) return "line";
    if (type.includes("Polygon")) return "polygon";
    return "unknown";
  }

  function getDisplayValue(value) {
    if (value === null || value === undefined || value === "") return "(empty)";
    return String(value);
  }

  function normalizeFeatureValue(feature, field) {
    return feature?.properties?.[field];
  }

  function getRuleMatch(feature, rules = []) {
    return rules.find((rule) => {
      if (!rule?.field) return false;
      const left = normalizeFeatureValue(feature, rule.field);
      const right = rule.value;
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
      if (rule.operator === "contains") return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
      if (rule.operator === "!=") return numeric ? leftNumber !== rightNumber : String(left ?? "") !== String(right ?? "");
      if (rule.operator === ">") return numeric && leftNumber > rightNumber;
      if (rule.operator === "<") return numeric && leftNumber < rightNumber;
      if (rule.operator === ">=") return numeric && leftNumber >= rightNumber;
      if (rule.operator === "<=") return numeric && leftNumber <= rightNumber;
      return numeric ? leftNumber === rightNumber : String(left ?? "") === String(right ?? "");
    }) || null;
  }

  function resolveFeatureColor(layerRecord, feature) {
    const styleConfig = cloneStyleConfig(layerRecord?.styleConfig, layerRecord?.color || "#1db7a6");
    if (styleConfig.mode === "rule" || styleConfig.mode === "rule-based") {
      return getRuleMatch(feature, styleConfig.rules)?.color || styleConfig.singleColor || layerRecord.color;
    }
    if (styleConfig.mode === "categorized" && styleConfig.field) {
      const displayValue = getDisplayValue(normalizeFeatureValue(feature, styleConfig.field));
      return styleConfig.categorized.valueColors[displayValue] || styleConfig.singleColor || layerRecord.color;
    }
    if (styleConfig.mode === "graduated" && styleConfig.field && typeof computeGraduatedBreaks === "function" && typeof buildColorRamp === "function") {
      const numericValue = Number(normalizeFeatureValue(feature, styleConfig.field));
      if (Number.isFinite(numericValue)) {
        const breaks = computeGraduatedBreaks(layerRecord, styleConfig.field, styleConfig.graduated.classCount, styleConfig.graduated.method);
        const rampColors = buildColorRamp(styleConfig.graduated.ramp, breaks.length || 1);
        const breakIndex = breaks.findIndex((currentBreak, index) =>
          index === breaks.length - 1
            ? numericValue >= currentBreak.min && numericValue <= currentBreak.max
            : numericValue >= currentBreak.min && numericValue < currentBreak.max
        );
        if (breakIndex >= 0) return rampColors[breakIndex];
      }
    }
    return styleConfig.singleColor || layerRecord?.color || "#1db7a6";
  }

  function getDashArray(style, width = 3) {
    if (style.dashStyle === "custom" && style.dashPattern) return style.dashPattern;
    if (style.dashStyle === "dashed") return `${width * 3} ${width * 2}`;
    if (style.dashStyle === "dotted") return `${Math.max(1, width)} ${width * 2}`;
    return null;
  }

  function createPathStyle(layerRecord, feature) {
    const styleConfig = cloneStyleConfig(layerRecord?.styleConfig, layerRecord?.color || "#1db7a6");
    const color = resolveFeatureColor(layerRecord, feature);
    const kind = getGeometryKind(feature);
    // When in a per-feature color mode (categorized, graduated, rule-based),
    // the resolved `color` must override the static geometry fill/stroke colors.
    const isPerFeatureMode = styleConfig.mode === "categorized" || styleConfig.mode === "graduated" ||
      styleConfig.mode === "rule" || styleConfig.mode === "rule-based";
    if (kind === "polygon") {
      const polygon = styleConfig.polygon;
      const strokeWidth = Number(polygon.strokeWidth) || 0;
      // In per-feature mode: use resolved color for both fill and stroke.
      // In single mode: respect the user-configured polygon colors.
      const effectiveFill = isPerFeatureMode ? color : (polygon.fillColor || color);
      const effectiveStroke = isPerFeatureMode ? color : (polygon.strokeColor || color);
      return {
        color: effectiveStroke,
        weight: strokeWidth,
        opacity: Number(polygon.strokeOpacity ?? 0.92),
        dashArray: getDashArray({ dashStyle: polygon.strokeStyle }, strokeWidth),
        fillColor: polygon.outlineOnly ? "transparent" : effectiveFill,
        fillOpacity: polygon.outlineOnly ? 0 : Number(polygon.fillOpacity ?? 0.22),
        lineCap: polygon.lineCap || "round",
        lineJoin: polygon.lineJoin || "round",
      };
    }

    const line = styleConfig.line;
    const width = Number(line.width) || 3;
    // In per-feature mode: use resolved color; in single mode: respect line.color.
    const effectiveLineColor = isPerFeatureMode ? color : (line.color || color);
    return {
      color: effectiveLineColor,
      weight: width,
      opacity: Number(line.opacity ?? 0.92),
      dashArray: getDashArray(line, width),
      lineCap: line.lineCap || "round",
      lineJoin: line.lineJoin || "round",
    };
  }

  function shapeMarkup(shape, size, fillColor, strokeColor, strokeWidth, opacity, iconUrl) {
    const sw = Number(strokeWidth) || 0;
    // Use inset box-shadow for the stroke so it stays inside element bounds,
    // respecting clip-path (star) and border-radius (circle/square) without
    // inflating the element size or breaking iconAnchor alignment.
    const strokeShadow = sw > 0 ? `inset 0 0 0 ${sw}px ${strokeColor}` : "none";
    const base = `width:${size}px;height:${size}px;background:${fillColor};opacity:${opacity};box-shadow:${strokeShadow};`;
    if (shape === "custom" && iconUrl) {
      return `<img src="${String(iconUrl).replace(/"/g, "&quot;")}" alt="" style="width:${size}px;height:${size}px;opacity:${opacity};display:block;" />`;
    }
    if (shape === "square") return `<span class="vector-symbol vector-symbol-square" style="${base}"></span>`;
    if (shape === "triangle") {
      // CSS border-triangle cannot use inset box-shadow; use drop-shadow filter instead
      const shadow = sw > 0
        ? `drop-shadow(0 0 ${sw}px ${strokeColor}) drop-shadow(0 0 ${Math.ceil(sw / 2)}px ${strokeColor})`
        : "none";
      return `<span class="vector-symbol vector-symbol-triangle" style="width:0;height:0;border-left:${size / 2}px solid transparent;border-right:${size / 2}px solid transparent;border-bottom:${size}px solid ${fillColor};opacity:${opacity};filter:${shadow};"></span>`;
    }
    if (shape === "star") return `<span class="vector-symbol vector-symbol-star" style="${base}"></span>`;
    if (shape === "cross") return `<span class="vector-symbol vector-symbol-cross" style="--symbol-size:${size}px;--symbol-fill:${fillColor};--symbol-stroke:${strokeColor};--symbol-sw:${sw}px;opacity:${opacity};"></span>`;
    // circle (default)
    return `<span class="vector-symbol vector-symbol-circle" style="${base}"></span>`;
  }

  function createPointIcon(layerRecord, feature) {
    const styleConfig = cloneStyleConfig(layerRecord?.styleConfig, layerRecord?.color || "#1db7a6");
    const point = styleConfig.point;
    const fill = resolveFeatureColor(layerRecord, feature) || point.fillColor;
    const size = Math.max(4, Number(point.size) || 14);
    return L.divIcon({
      className: "custom-point-icon vector-point-icon",
      html: shapeMarkup(point.shape, size, fill || point.fillColor, point.strokeColor, Number(point.strokeWidth) || 0, Number(point.opacity ?? 0.95), point.iconUrl),
      iconSize: [size + 8, size + 8],
      iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    });
  }

  function getLabelText(feature, labelConfig) {
    if (!labelConfig.enabled) return "";
    let raw = "";
    if (labelConfig.expression?.trim()) {
      raw = labelConfig.expression.replace(/\{([^}]+)\}/g, (_, field) => getDisplayValue(feature?.properties?.[field.trim()]));
    } else {
      if (!labelConfig.field) return "";
      const value = feature?.properties?.[labelConfig.field];
      raw = value == null ? "" : String(value);
    }
    // Strip embedded newlines/carriage returns from field values — they cause
    // single-character-per-line vertical rendering when white-space: pre-line is set.
    return raw.replace(/[\r\n]+/g, " ").trim();
  }

  function getTooltipDirection(kind, labelConfig) {
    if (kind === "point") {
      const placement = labelConfig.placement;
      if (["top", "bottom", "left", "right", "center"].includes(placement)) return placement;
      return "top"; // sensible default for points instead of "center" (which overlaps the marker)
    }
    if (kind === "line") {
      // Leaflet supports "center" for midpoint placement; "auto" is not a valid Leaflet direction
      return "center";
    }
    // polygon — always centroid-anchored, center direction
    return "center";
  }

  // Registry of injected label style tags keyed by a stable hash of the style config.
  // Prevents one <style> tag being injected per feature per rebuild (memory/perf leak).
  const _labelStyleRegistry = new Map(); // hash -> { className, styleTag, refCount }

  function _hashLabelConfig(labelConfig) {
    const s = labelConfig.style;
    return [
      s.color, s.opacity, s.fontFamily, s.fontSize, s.bold, s.italic, s.underline,
      s.haloColor, s.haloSize, s.backgroundColor, s.borderColor, s.borderRadius, s.shadow,
      labelConfig.offsetX, labelConfig.offsetY, labelConfig.rotation,
    ].join("|");
  }

  function createLabelClass(labelConfig) {
    const hash = _hashLabelConfig(labelConfig);
    if (_labelStyleRegistry.has(hash)) {
      const entry = _labelStyleRegistry.get(hash);
      entry.refCount += 1;
      return {
        className: entry.className,
        // No-op styleTag remove — keep the shared tag alive; we do ref-counting below
        styleTag: { remove: () => {
          entry.refCount -= 1;
          if (entry.refCount <= 0) {
            entry.styleTag.remove();
            _labelStyleRegistry.delete(hash);
          }
        }},
      };
    }

    const style = labelConfig.style;
    const id = `vector-label-${hash.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`;

    // Build cross-browser halo using text-shadow (works in all browsers).
    // -webkit-text-stroke in the base CSS handles Blink/WebKit for sharper halos.
    const haloSize = Number(style.haloSize) || 0;
    const haloColor = style.haloColor || "transparent";
    const haloShadows = haloSize > 0
      ? [
          `${-haloSize}px ${-haloSize}px 0 ${haloColor}`,
          ` ${haloSize}px ${-haloSize}px 0 ${haloColor}`,
          `${-haloSize}px  ${haloSize}px 0 ${haloColor}`,
          ` ${haloSize}px  ${haloSize}px 0 ${haloColor}`,
          `0 ${-haloSize}px 0 ${haloColor}`,
          `0  ${haloSize}px 0 ${haloColor}`,
          `${-haloSize}px 0 0 ${haloColor}`,
          ` ${haloSize}px 0 0 ${haloColor}`,
        ].join(",")
      : "none";
    const textShadow = style.shadow
      ? (haloSize > 0 ? haloShadows + ", 0 1px 3px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.55)")
      : haloShadows;

    const css = `
      .${id} {
        --label-halo-color: ${haloColor};
        --label-halo-size: ${haloSize}px;
        color: ${style.color};
        opacity: ${Number(style.opacity ?? 1)};
        font-family: ${style.fontFamily || defaultFontFamily};
        font-size: ${Number(style.fontSize) || 12}px;
        font-weight: ${style.bold ? 700 : 400};
        font-style: ${style.italic ? "italic" : "normal"};
        text-decoration: ${style.underline ? "underline" : "none"};
        background: ${style.backgroundColor || "transparent"};
        border: 1px solid ${style.borderColor || "transparent"};
        border-radius: ${Number(style.borderRadius) || 0}px;
        text-shadow: ${textShadow};
        transform: translate(${Number(labelConfig.offsetX) || 0}px, ${Number(labelConfig.offsetY) || 0}px) rotate(${Number(labelConfig.rotation) || 0}deg);
      }
    `;
    const styleTag = document.createElement("style");
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
    const entry = { className: id, styleTag, refCount: 1 };
    _labelStyleRegistry.set(hash, entry);
    return {
      className: id,
      styleTag: { remove: () => {
        entry.refCount -= 1;
        if (entry.refCount <= 0) {
          entry.styleTag.remove();
          _labelStyleRegistry.delete(hash);
        }
      }},
    };
  }

  function bindLabel(layerRecord, leafletLayer, feature) {
    const labelConfig = cloneLabelConfig(layerRecord?.labelConfig);
    const currentZoom = typeof map !== "undefined" ? map.getZoom() : 0;
    if (!labelConfig.enabled || currentZoom < Number(labelConfig.minZoom) || currentZoom > Number(labelConfig.maxZoom)) return;
    const text = getLabelText(feature, labelConfig);
    if (!text) return;
    const kind = getGeometryKind(feature);
    const labelClass = createLabelClass(labelConfig);
    const wrappedText = (() => {
      const wrapAt = Number(labelConfig.wrap);
      if (wrapAt <= 0) return String(text);
      // Only break at whitespace — never slice mid-word (which causes one-char-per-line vertical text)
      const words = String(text).split(/\s+/);
      const lines = [];
      let current = "";
      for (const word of words) {
        if (!word) continue;
        if (!current) {
          current = word;
        } else if (current.length + 1 + word.length <= wrapAt) {
          current += " " + word;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.join("\n");
    })();
    leafletLayer.bindTooltip(wrappedText, {
      permanent: true,
      direction: getTooltipDirection(kind, labelConfig),
      className: `vector-feature-label ${labelClass.className}`,
      opacity: Number(labelConfig.style.opacity ?? 1),
      sticky: kind === "line" && labelConfig.linePlacement === "parallel",
      interactive: false,
    });
    leafletLayer.on("add", () => {
      if (!labelConfig.avoidOverlap) return;
      // Use rAF → setTimeout chain to ensure the tooltip has been fully laid out
      // before reading getBoundingClientRect (setTimeout(0) fires before paint).
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          const tooltip = leafletLayer.getTooltip?.();
          const element = tooltip?.getElement?.();
          if (!element) return;
          element.dataset.labelPriority = String(labelConfig.priority || 0);
          const rect = element.getBoundingClientRect();
          // Bail out if the element has not been laid out yet (zero-size rect)
          if (rect.width === 0 && rect.height === 0) return;
          const overlaps = Array.from(document.querySelectorAll(".vector-feature-label"))
            .filter((candidate) => candidate !== element && candidate.style.display !== "none")
            .some((candidate) => {
              const candidateRect = candidate.getBoundingClientRect();
              const intersects = !(rect.right < candidateRect.left || rect.left > candidateRect.right || rect.bottom < candidateRect.top || rect.top > candidateRect.bottom);
              if (!intersects) return false;
              const candidatePriority = Number(candidate.dataset.labelPriority || 0);
              return candidatePriority >= Number(labelConfig.priority || 0);
            });
          if (overlaps) {
            element.style.display = "none";
          }
        }, 0);
      });
    });
    leafletLayer.once("remove", () => labelClass.styleTag.remove());
  }

  global.VectorStyleManager = {
    createDefaultStyleConfig,
    cloneStyleConfig,
    createDefaultLabelConfig,
    cloneLabelConfig,
    resolveFeatureColor,
    createPathStyle,
    createPointIcon,
    bindLabel,
    getGeometryKind,
  };
})(window);
