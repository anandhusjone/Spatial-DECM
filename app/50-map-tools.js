/* =============================================================
   50-map-tools.js — Locate (GPS) + Measure (distance/area)
   ============================================================= */

(function () {
  "use strict";

  // ── Shared helpers ──────────────────────────────────────────

  function haversineMeters(latlng1, latlng2) {
    const R = 6371000;
    const φ1 = (latlng1.lat * Math.PI) / 180;
    const φ2 = (latlng2.lat * Math.PI) / 180;
    const Δφ = ((latlng2.lat - latlng1.lat) * Math.PI) / 180;
    const Δλ = ((latlng2.lng - latlng1.lng) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDistance(meters) {
    if (meters < 1000) return `${meters.toFixed(1)} m`;
    return `${(meters / 1000).toFixed(3)} km`;
  }

  function formatArea(sqm) {
    if (sqm < 10000) return `${sqm.toFixed(1)} m²`;
    if (sqm < 1e6) return `${(sqm / 10000).toFixed(3)} ha`;
    return `${(sqm / 1e6).toFixed(4)} km²`;
  }

  /** Spherical polygon area (shoelace on sphere) in m² */
  function sphericalArea(latlngs) {
    if (latlngs.length < 3) return 0;
    const R = 6371000;
    let area = 0;
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const φ1 = (latlngs[i].lat * Math.PI) / 180;
      const φ2 = (latlngs[j].lat * Math.PI) / 180;
      const Δλ = ((latlngs[j].lng - latlngs[i].lng) * Math.PI) / 180;
      area += Δλ * (2 + Math.sin(φ1) + Math.sin(φ2));
    }
    return Math.abs((area * R * R) / 2);
  }

  // ── Locate ──────────────────────────────────────────────────

  const locateBtn = document.getElementById("locate-btn");
  let locateMarker = null;
  let locateAccuracyCircle = null;
  let locating = false;

  const locatePulseIcon = L.divIcon({
    className: "locate-pulse-icon",
    html: '<span class="locate-dot"></span><span class="locate-ring"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  function clearLocate() {
    if (locateMarker) { map.removeLayer(locateMarker); locateMarker = null; }
    if (locateAccuracyCircle) { map.removeLayer(locateAccuracyCircle); locateAccuracyCircle = null; }
  }

  function onLocationFound(e) {
    locating = false;
    locateBtn.classList.remove("locating");
    locateBtn.classList.add("located");

    clearLocate();

    locateAccuracyCircle = L.circle(e.latlng, {
      radius: e.accuracy / 2,
      color: "#3fcf8e",
      fillColor: "#3fcf8e",
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: "4 4",
      interactive: false,
    }).addTo(map);

    locateMarker = L.marker(e.latlng, { icon: locatePulseIcon, zIndexOffset: 800 })
      .addTo(map)
      .bindPopup(
        `<strong>Your location</strong><br>` +
        `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}<br>` +
        `Accuracy: ±${formatDistance(e.accuracy / 2)}`,
        { offset: [0, -6] }
      )
      .openPopup();

    map.setView(e.latlng, Math.max(map.getZoom(), 14));
    updateStatus(`Location found. Accuracy ±${formatDistance(e.accuracy / 2)}.`);
  }

  function onLocationError(e) {
    locating = false;
    locateBtn.classList.remove("locating");
    updateStatus("Location unavailable: " + e.message, true);
  }

  map.on("locationfound", onLocationFound);
  map.on("locationerror", onLocationError);

  locateBtn.addEventListener("click", () => {
    if (locating) {
      // second click cancels
      map.stopLocate();
      locating = false;
      locateBtn.classList.remove("locating");
      return;
    }
    if (locateMarker) {
      // third click clears
      clearLocate();
      locateBtn.classList.remove("located");
      return;
    }
    locating = true;
    locateBtn.classList.add("locating");
    map.locate({ setView: false, maxZoom: 16, enableHighAccuracy: true });
  });

  // ── Measure ─────────────────────────────────────────────────

  const measureBtn = document.getElementById("measure-btn");

  let measuring = false;
  let measurePoints = [];       // L.LatLng[]
  let measurePolyline = null;   // drawn segments
  let measurePolygon = null;    // fill when ≥3 pts
  let measureDots = [];         // vertex circle markers
  let measureTooltip = null;    // floating label
  let measurePreviewLine = null;// ghost line to cursor
  let measureResult = null;     // final result marker

  const MEASURE_STYLE = {
    line: { color: "#ffb454", weight: 2.5, dashArray: "6 4", interactive: false },
    preview: { color: "#ffb454", weight: 1.5, dashArray: "4 4", opacity: 0.55, interactive: false },
    fill: { color: "#ffb454", fillColor: "#ffb454", fillOpacity: 0.08, weight: 0, interactive: false },
    dot: (first) => ({
      radius: first ? 6 : 4,
      color: first ? "#fff" : "#ffb454",
      fillColor: first ? "#ffb454" : "#fff",
      fillOpacity: 1,
      weight: 2,
      interactive: first,  // first dot is clickable to close polygon
    }),
  };

  function measureTotalLength(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += haversineMeters(pts[i - 1], pts[i]);
    return d;
  }

  function updateMeasureDisplay(cursorLatLng) {
    if (!measuring || !measurePoints.length) return;

    const pts = cursorLatLng ? [...measurePoints, cursorLatLng] : measurePoints;
    const len = measureTotalLength(pts);
    const area = pts.length >= 3 ? sphericalArea(pts) : 0;

    // update preview ghost line to cursor
    if (cursorLatLng && measurePoints.length >= 1) {
      const previewPts = [measurePoints[measurePoints.length - 1], cursorLatLng];
      if (measurePreviewLine) {
        measurePreviewLine.setLatLngs(previewPts);
      } else {
        measurePreviewLine = L.polyline(previewPts, measureStyle("preview")).addTo(map);
      }
    }

    // update polyline through fixed points
    if (measurePolyline) {
      measurePolyline.setLatLngs(measurePoints);
    }

    // update polygon fill
    if (measurePoints.length >= 3) {
      if (measurePolygon) {
        measurePolygon.setLatLngs(measurePoints);
      } else {
        measurePolygon = L.polygon(measurePoints, measureStyle("fill")).addTo(map);
      }
    }

    // tooltip
    const labelPt = cursorLatLng || measurePoints[measurePoints.length - 1];
    const labelHtml =
      `<span class="measure-label-dist">${formatDistance(len)}</span>` +
      (area > 0 ? `<span class="measure-label-area">${formatArea(area)}</span>` : "");

    if (measureTooltip) {
      measureTooltip.setLatLng(labelPt).setContent(labelHtml);
    } else {
      measureTooltip = L.tooltip({ permanent: true, className: "measure-tooltip", offset: [12, -8], direction: "right" })
        .setContent(labelHtml)
        .setLatLng(labelPt)
        .addTo(map);
    }
  }

  function measureStyle(key) {
    return MEASURE_STYLE[key];
  }

  function addMeasurePoint(latlng) {
    measurePoints.push(latlng);

    const isFirst = measurePoints.length === 1;
    const dot = L.circleMarker(latlng, measureStyle("dot")(isFirst)).addTo(map);

    if (isFirst) {
      dot.on("click", finishMeasure);  // click origin to close as polygon
      dot.getElement()?.classList.add("measure-close-hint");
    }

    measureDots.push(dot);

    if (!measurePolyline) {
      measurePolyline = L.polyline(measurePoints, measureStyle("line")).addTo(map);
    }

    updateMeasureDisplay(null);
  }

  function finishMeasure(e) {
    if (e) L.DomEvent.stop(e);
    if (!measuring || measurePoints.length < 2) {
      stopMeasure();
      return;
    }

    const isClosed = measurePoints.length >= 3;
    const len = measureTotalLength(measurePoints);
    const area = isClosed ? sphericalArea(measurePoints) : 0;

    // show persistent result popup at centroid
    let center;
    if (isClosed) {
      center = measurePoints.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat / measurePoints.length, lng: acc.lng + p.lng / measurePoints.length }),
        { lat: 0, lng: 0 }
      );
    } else {
      center = measurePoints[measurePoints.length - 1];
    }

    const resultHtml =
      `<strong>Measurement</strong><br>` +
      `Distance: ${formatDistance(len)}` +
      (area > 0 ? `<br>Area: ${formatArea(area)}` : "");

    measureResult = L.popup({ closeButton: true, className: "measure-result-popup", offset: [0, -4] })
      .setLatLng(center)
      .setContent(resultHtml)
      .openOn(map);

    stopMeasure(true);
  }

  function stopMeasure(keepDrawing) {
    measuring = false;
    measureBtn.classList.remove("active");
    measureBtn.setAttribute("aria-pressed", "false");
    map.off("click", onMeasureClick);
    map.off("mousemove", onMeasureMove);
    map.off("dblclick", onMeasureDblClick);
    map.getContainer().classList.remove("measuring");

    if (!keepDrawing) {
      clearMeasure();
    } else {
      // remove only the transient preview pieces
      if (measurePreviewLine) { map.removeLayer(measurePreviewLine); measurePreviewLine = null; }
      if (measureTooltip) { map.removeLayer(measureTooltip); measureTooltip = null; }
    }
  }

  function clearMeasure() {
    [measurePolyline, measurePolygon, measurePreviewLine, measureTooltip, measureResult].forEach(
      (layer) => { if (layer) map.removeLayer(layer); }
    );
    measureDots.forEach((d) => map.removeLayer(d));
    measurePolyline = null;
    measurePolygon = null;
    measurePreviewLine = null;
    measureTooltip = null;
    measureResult = null;
    measureDots = [];
    measurePoints = [];
  }

  function onMeasureClick(e) {
    // Leaflet fires click after dblclick — suppress the second click of a dblclick
    if (e.originalEvent._measureSkip) return;
    addMeasurePoint(e.latlng);
  }

  function onMeasureMove(e) {
    updateMeasureDisplay(e.latlng);
  }

  function onMeasureDblClick(e) {
    // mark the event so the trailing click is ignored
    e.originalEvent._measureSkip = true;
    // remove last point (it was added by the first click of dblclick)
    if (measurePoints.length > 1) measurePoints.pop();
    if (measureDots.length > 1) {
      map.removeLayer(measureDots.pop());
    }
    finishMeasure(null);
  }

  function startMeasure() {
    measuring = true;
    measureBtn.classList.add("active");
    measureBtn.setAttribute("aria-pressed", "true");
    measurePoints = [];
    clearMeasure();
    map.getContainer().classList.add("measuring");
    map.on("click", onMeasureClick);
    map.on("mousemove", onMeasureMove);
    map.on("dblclick", onMeasureDblClick);
    updateStatus("Click to add points. Double-click or click the first point to finish. Click ruler again to cancel.");
  }

  measureBtn.addEventListener("click", () => {
    if (measuring) {
      stopMeasure(false);
      updateStatus("Measurement cancelled.");
    } else {
      startMeasure();
    }
  });

  // also clear on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && measuring) {
      stopMeasure(false);
      updateStatus("Measurement cancelled.");
    }
  });

})();
