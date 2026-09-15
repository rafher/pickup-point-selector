/**
 * Selector de punto de recogida — lógica del bloque de carrito.
 *
 * Sin dependencias de build: este archivo se sirve tal cual desde la
 * theme app extension, así que solo usa JS estándar de navegador.
 *
 * Flujo:
 *  1. Al pulsar el campo se abre un modal con dos pestañas (lista / mapa).
 *  2. Los puntos se piden al App Proxy de la app
 *     (`/apps/pickup-points/points`, mismo origen que la tienda).
 *  3. Al elegir un punto y confirmar, se guarda como atributo del pedido
 *     con la Cart AJAX API (`/cart/update.js`), sin depender de que este
 *     bloque esté dentro del <form> nativo del carrito del tema.
 */
(function () {
  "use strict";

  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

  var STRINGS = {
    es: {
      loading: "Cargando puntos de recogida…",
      empty: "No se han encontrado puntos de recogida.",
      select: "Seleccionar",
      selected: "Seleccionado",
      confirming: "Guardando…",
      confirmError: "No se ha podido guardar tu selección. Inténtalo de nuevo.",
    },
    en: {
      loading: "Loading pickup points…",
      empty: "No pickup points found.",
      select: "Select",
      selected: "Selected",
      confirming: "Saving…",
      confirmError: "We couldn't save your selection. Please try again.",
    },
  };

  var lang = (document.documentElement.lang || "es").slice(0, 2).toLowerCase();
  var t = STRINGS[lang] || STRINGS.es;

  var leafletPromise = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-pickup-point-leaflet-css]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.setAttribute("data-pickup-point-leaflet-css", "true");
        document.head.appendChild(link);
      }

      var script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = function () {
        resolve(window.L);
      };
      script.onerror = function () {
        reject(new Error("No se pudo cargar Leaflet"));
      };
      document.body.appendChild(script);
    });

    return leafletPromise;
  }

  function debounce(fn, wait) {
    var timeout;
    return function () {
      var args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function formatAddress(point) {
    var parts = [point.address.line1];
    if (point.address.line2) parts.push(point.address.line2);
    var cityLine = [point.address.postalCode, point.address.city].filter(Boolean).join(" ");
    if (cityLine) parts.push(cityLine);
    return parts.join(", ");
  }

  function formatSummary(point) {
    return point.name + " — " + formatAddress(point);
  }

  function formatDistance(distanceKm, template) {
    if (distanceKm == null || Number.isNaN(distanceKm)) return "";
    var value = distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString();
    value = value.replace(".", ",");
    return (template || "a {km} km").replace("{km}", value);
  }

  function setupPicker(root) {
    var data = root.dataset;
    var trigger = root.querySelector("[data-pickup-point-trigger]");
    var selectedTextEl = root.querySelector("[data-pickup-point-selected-text]");
    var hintEl = root.querySelector("[data-pickup-point-hint]");

    var state = {
      points: [],
      loaded: false,
      loading: false,
      error: null,
      view: data.defaultView === "map" ? "map" : "list",
      selectedPoint: null,
      confirmedPointId: null,
      map: null,
      markers: [],
    };

    var modal = null;
    var els = {};

    prefillFromCart();

    trigger.addEventListener("click", function () {
      openModal();
    });

    function prefillFromCart() {
      fetch("/cart.js", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (cart) {
          if (!cart || !cart.attributes) return;
          var summary = cart.attributes[data.cartAttribute];
          var pointId = cart.attributes["_pickup_point_id"];
          if (summary) {
            selectedTextEl.textContent = summary;
            trigger.dataset.selected = "true";
          }
          if (pointId) {
            state.confirmedPointId = pointId;
          }
        })
        .catch(function () {
          /* silencioso: si falla, simplemente no se precarga selección previa */
        });
    }

    function buildModal() {
      var overlay = document.createElement("div");
      overlay.className = "pickup-point-modal-overlay";
      overlay.setAttribute("data-pickup-point-overlay", "");

      overlay.innerHTML =
        '<div class="pickup-point-modal" role="dialog" aria-modal="true" aria-labelledby="PickupPointModalTitle-' +
        data.blockId +
        '">' +
        '<div class="pickup-point-modal__header">' +
        '<h2 class="pickup-point-modal__title" id="PickupPointModalTitle-' +
        data.blockId +
        '">' +
        escapeHtml(data.modalTitle) +
        "</h2>" +
        '<button type="button" class="pickup-point-modal__close" data-close aria-label="Cerrar">&times;</button>' +
        "</div>" +
        '<div class="pickup-point-modal__tabs" role="tablist">' +
        '<button type="button" class="pickup-point-modal__tab" data-tab="list" role="tab">' +
        escapeHtml(data.listTabLabel) +
        "</button>" +
        '<button type="button" class="pickup-point-modal__tab" data-tab="map" role="tab">' +
        escapeHtml(data.mapTabLabel) +
        "</button>" +
        "</div>" +
        '<div class="pickup-point-modal__search">' +
        '<input type="search" data-search placeholder="' +
        escapeHtml(data.searchPlaceholder) +
        '" />' +
        "</div>" +
        '<div class="pickup-point-modal__body" data-body></div>' +
        '<div class="pickup-point-modal__footer">' +
        '<button type="button" class="pickup-point-modal__confirm" data-confirm disabled>' +
        escapeHtml(data.ctaLabel) +
        "</button>" +
        "</div>" +
        "</div>";

      document.body.appendChild(overlay);

      els.overlay = overlay;
      els.body = overlay.querySelector("[data-body]");
      els.confirmBtn = overlay.querySelector("[data-confirm]");
      els.search = overlay.querySelector("[data-search]");
      els.tabs = overlay.querySelectorAll("[data-tab]");

      // Si el cliente tiene sesión iniciada y dirección guardada, se usa
      // como origen por defecto para poder mostrar distancias sin que
      // tenga que escribir nada.
      if (data.customerPostalCode || data.customerCity) {
        els.search.value = data.customerPostalCode || data.customerCity;
      }

      overlay.querySelector("[data-close]").addEventListener("click", closeModal);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) closeModal();
      });
      document.addEventListener("keydown", onKeydown);

      els.tabs.forEach(function (tabBtn) {
        tabBtn.addEventListener("click", function () {
          setView(tabBtn.getAttribute("data-tab"));
        });
      });

      els.search.addEventListener(
        "input",
        debounce(function () {
          loadPoints(els.search.value);
        }, 350),
      );

      els.confirmBtn.addEventListener("click", confirmSelection);

      return overlay;
    }

    function onKeydown(event) {
      if (event.key === "Escape") closeModal();
    }

    function openModal() {
      if (!modal) modal = buildModal();
      modal.style.display = "flex";
      setView(state.view);
      if (!state.loaded && !state.loading) loadPoints(els.search.value);
      els.confirmBtn.focus();
    }

    function closeModal() {
      if (modal) modal.style.display = "none";
    }

    function setView(view) {
      state.view = view;
      els.tabs.forEach(function (tabBtn) {
        var active = tabBtn.getAttribute("data-tab") === view;
        tabBtn.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderBody();
    }

    function loadPoints(query) {
      state.loading = true;
      state.error = null;
      renderBody();

      var url = new URL(data.proxyUrl, window.location.origin);
      if (query) {
        if (/^\d/.test(query.trim())) {
          url.searchParams.set("postalCode", query.trim());
        } else {
          url.searchParams.set("city", query.trim());
        }
      }

      fetch(url.toString(), { headers: { Accept: "application/json" } })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (payload) {
          state.points = payload.points || [];
          state.loaded = true;
          state.loading = false;

          if (state.confirmedPointId) {
            var match = state.points.filter(function (p) {
              return p.id === state.confirmedPointId;
            })[0];
            if (match) state.selectedPoint = match;
          }

          renderBody();
        })
        .catch(function (error) {
          console.error("[pickup-point-picker]", error);
          state.loading = false;
          state.error = data.errorMessage || t.confirmError;
          renderBody();
        });
    }

    function renderBody() {
      if (!els.body) return;

      if (state.loading) {
        els.body.innerHTML = '<p class="pickup-point-modal__status">' + escapeHtml(t.loading) + "</p>";
        return;
      }

      if (state.error) {
        els.body.innerHTML =
          '<p class="pickup-point-modal__status" data-tone="error">' + escapeHtml(state.error) + "</p>";
        return;
      }

      if (!state.points.length) {
        els.body.innerHTML = '<p class="pickup-point-modal__status">' + escapeHtml(t.empty) + "</p>";
        return;
      }

      if (state.view === "map") {
        renderMap();
      } else {
        renderList();
      }
    }

    function renderList() {
      els.body.innerHTML = "";
      var list = document.createElement("div");
      list.className = "pickup-point-list";

      state.points.forEach(function (point) {
        list.appendChild(buildCard(point));
      });

      els.body.appendChild(list);
    }

    function buildCard(point) {
      var isSelected = state.selectedPoint && state.selectedPoint.id === point.id;

      var card = document.createElement("div");
      card.className = "pickup-point-card";
      card.dataset.selected = isSelected ? "true" : "false";

      var hours = (point.openingHours || []).join(" · ");
      var distance = formatDistance(point.distanceKm, data.distanceLabel);

      card.innerHTML =
        '<span class="pickup-point-card__top-row">' +
        '<span class="pickup-point-card__carrier">' +
        escapeHtml(point.carrier || "") +
        "</span>" +
        (distance
          ? '<span class="pickup-point-card__distance">' + escapeHtml(distance) + "</span>"
          : "") +
        "</span>" +
        '<span class="pickup-point-card__name">' +
        escapeHtml(point.name) +
        "</span>" +
        '<span class="pickup-point-card__address">' +
        escapeHtml(formatAddress(point)) +
        "</span>" +
        (hours ? '<span class="pickup-point-card__hours">' + escapeHtml(hours) + "</span>" : "") +
        '<button type="button" class="pickup-point-card__select">' +
        (isSelected ? escapeHtml(t.selected) : escapeHtml(t.select)) +
        "</button>";

      var selectBtn = card.querySelector(".pickup-point-card__select");
      var select = function () {
        selectPoint(point);
      };
      card.addEventListener("click", select);
      selectBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        select();
      });

      return card;
    }

    function renderMap() {
      els.body.innerHTML = '<div class="pickup-point-map-wrapper"><div class="pickup-point-map" data-map></div></div>';
      var mapEl = els.body.querySelector("[data-map]");

      loadLeaflet()
        .then(function (L) {
          if (state.map) {
            state.map.remove();
            state.map = null;
          }

          var center = state.points[0];
          state.map = L.map(mapEl).setView([center.lat, center.lng], 6);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 19,
          }).addTo(state.map);

          state.markers = state.points.map(function (point) {
            var marker = L.marker([point.lat, point.lng]).addTo(state.map);
            marker.bindPopup(buildPopupContent(point));
            return marker;
          });

          if (state.points.length > 1) {
            var bounds = L.latLngBounds(state.points.map(function (p) { return [p.lat, p.lng]; }));
            state.map.fitBounds(bounds, { padding: [24, 24] });
          }

          // Si ya había un punto seleccionado, abre su popup.
          if (state.selectedPoint) {
            var idx = state.points.findIndex(function (p) {
              return p.id === state.selectedPoint.id;
            });
            if (idx > -1) state.markers[idx].openPopup();
          }

          // El mapa se pinta en un contenedor que puede haber estado
          // oculto (pestaña "Lista"); recalcula el tamaño tras insertarlo.
          setTimeout(function () {
            state.map.invalidateSize();
          }, 50);
        })
        .catch(function (error) {
          console.error("[pickup-point-picker]", error);
          els.body.innerHTML =
            '<p class="pickup-point-modal__status" data-tone="error">' +
            escapeHtml(data.errorMessage || t.confirmError) +
            "</p>";
        });
    }

    function buildPopupContent(point) {
      var container = document.createElement("div");

      var name = document.createElement("strong");
      name.textContent = point.name;
      container.appendChild(name);

      var distanceText = formatDistance(point.distanceKm, data.distanceLabel);
      if (distanceText) {
        var distanceEl = document.createElement("div");
        distanceEl.className = "pickup-point-map-popup__distance";
        distanceEl.textContent = distanceText;
        container.appendChild(distanceEl);
      }

      var address = document.createElement("div");
      address.textContent = formatAddress(point);
      container.appendChild(address);

      if (point.openingHours && point.openingHours.length) {
        var hours = document.createElement("div");
        hours.textContent = point.openingHours.join(" · ");
        container.appendChild(hours);
      }

      var button = document.createElement("button");
      button.type = "button";
      button.className = "pickup-point-map-popup__select";
      button.textContent =
        state.selectedPoint && state.selectedPoint.id === point.id ? t.selected : t.select;
      button.addEventListener("click", function () {
        selectPoint(point);
      });

      container.appendChild(button);

      return container;
    }

    function selectPoint(point) {
      state.selectedPoint = point;
      els.confirmBtn.disabled = false;
      renderBody();
    }

    function confirmSelection() {
      if (!state.selectedPoint) return;

      var point = state.selectedPoint;
      var attributes = {};
      attributes[data.cartAttribute] = formatSummary(point);
      attributes["_pickup_point_id"] = point.id;

      els.confirmBtn.disabled = true;
      els.confirmBtn.textContent = t.confirming;

      fetch("/cart/update.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: attributes }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function () {
          state.confirmedPointId = point.id;
          selectedTextEl.textContent = formatSummary(point);
          trigger.dataset.selected = "true";
          hintEl.hidden = true;

          root.dispatchEvent(
            new CustomEvent("pickup-point:selected", {
              bubbles: true,
              detail: { point: point },
            }),
          );

          closeModal();
        })
        .catch(function (error) {
          console.error("[pickup-point-picker]", error);
          hintEl.hidden = false;
          hintEl.textContent = t.confirmError;
        })
        .finally(function () {
          els.confirmBtn.disabled = false;
          els.confirmBtn.textContent = data.ctaLabel;
        });
    }
  }

  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init() {
    document.querySelectorAll("[data-pickup-point-picker]").forEach(setupPicker);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
