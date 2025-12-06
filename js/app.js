/* Tablero Meteorológico Severo - Paraguay
 * Preparado para GitHub Pages con datos desde Google Sheets (CSV gviz o pub).
 */

/* ========================================================================== */
/* CONFIGURACIÓN GLOBAL */
/* ========================================================================== */

const CONFIG = {
    SHEET_ID: "1RR-9_QpWa1X8HBFh4pjYndn64DnyGRpBYF0k6VMio9s",
    PAGE_SIZE: 50,
    MAP_CENTER: [-23.4425, -58.4438],
    MAP_ZOOM: 6,
    CACHE_KEY_DATA: "severeWxData",
    CACHE_KEY_TIME: "severeWxDataTime",
    CACHE_TTL_MS: 5 * 60 * 1000,
    DEBOUNCE_DELAY: 300,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,
    DEBUG_MODE: false
};

function getSheetsCSVUrl() {
    return "https://docs.google.com/spreadsheets/d/" +
        CONFIG.SHEET_ID +
        "/gviz/tq?tqx=out:csv";
}

function getSheetsCSVUrlPub() {
    return "https://docs.google.com/spreadsheets/d/" +
        CONFIG.SHEET_ID +
        "/pub?output=csv";
}

/* ========================================================================== */
/* UTILIDADES */
/* ========================================================================== */

const Logger = {
    info: function () {
        if (CONFIG.DEBUG_MODE && typeof console !== "undefined" && console.log) {
            console.log.apply(console, ["[INFO]"].concat(Array.prototype.slice.call(arguments)));
        }
    },
    warn: function () {
        if (typeof console !== "undefined" && console.warn) {
            console.warn.apply(console, ["[WARN]"].concat(Array.prototype.slice.call(arguments)));
        }
    },
    error: function () {
        if (typeof console !== "undefined" && console.error) {
            console.error.apply(console, ["[ERROR]"].concat(Array.prototype.slice.call(arguments)));
        }
    }
};

const Sanitizer = {
    escapeHTML: function (str) {
        if (typeof str !== "string") return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    },
    isValidURL: function (url) {
        try {
            const u = new URL(url);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch (e) {
            return false;
        }
    },
    sanitizeText: function (text, maxLength) {
        const safe = Sanitizer.escapeHTML(text || "");
        if (typeof maxLength === "number" && safe.length > maxLength) {
            return safe.substring(0, maxLength) + "...";
        }
        return safe;
    }
};

function debounce(fn, delay) {
    let timeout = null;
    return function () {
        const args = arguments;
        const ctx = this;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            fn.apply(ctx, args);
        }, delay);
    };
}

/* ========================================================================== */
/* PARSER CSV */
/* ========================================================================== */

const CSVParser = {
    parse: function (csvText) {
        if (!csvText || typeof csvText !== "string") {
            throw new Error("Contenido CSV inválido o vacío");
        }

        const lines = csvText.split(/\r?\n/).filter(function (line) {
            return line.trim().length > 0;
        });

        if (lines.length < 2) {
            throw new Error("CSV sin filas de datos suficientes");
        }

        const headers = CSVParser.parseLine(lines[0]);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = CSVParser.parseLine(lines[i]);
            if (values.length !== headers.length) {
                Logger.warn(
                    "Línea " + (i + 1) + " tiene " + values.length +
                    " columnas, se esperaban " + headers.length
                );
                continue;
            }

            const row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = values[j];
            }

            if (CSVParser.isValidRow(row)) {
                data.push(CSVParser.cleanRow(row));
            }
        }

        if (data.length === 0) {
            throw new Error("No se encontraron filas válidas en el CSV");
        }

        Logger.info("CSV parseado: " + data.length + " filas válidas");
        return data;
    },

    parseLine: function (line) {
        const result = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = line[i + 1];

            if (ch === "\"") {
                if (inQuotes && next === "\"") {
                    current += "\"";
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === "," && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += ch;
            }
        }

        result.push(current);

        for (let k = 0; k < result.length; k++) {
            let v = result[k].trim();
            if (v.length >= 2 && v[0] === "\"" && v[v.length - 1] === "\"") {
                v = v.substring(1, v.length - 1);
            }
            result[k] = v;
        }

        return result;
    },

    isValidRow: function (row) {
        const dept = (row["Departamento_corr"] || "").trim();
        const tipo = (row["Tipo de fenómeno CORR (GRA/RAF/TOR/FUN)"] || "").trim();
        const fecha = (row["Fecha"] || "").trim();
        if (!dept || !tipo || !/^\d{8}$/.test(fecha)) {
            return false;
        }
        return true;
    },

    cleanRow: function (row) {
        const fechaRaw = (row["Fecha"] || "").trim();
        if (/^\d{8}$/.test(fechaRaw)) {
            const y = fechaRaw.substring(0, 4);
            const m = fechaRaw.substring(4, 6);
            const d = fechaRaw.substring(6, 8);
            row["Fecha"] = y + "-" + m + "-" + d;
            row.timestamp = Date.parse(y + "-" + m + "-" + d + "T00:00:00Z") || 0;
        } else {
            row.timestamp = 0;
        }

        const latStr = (row["Latitud (grados, 4 dec.)"] || "").toString().replace(",", ".");
        const lonStr = (row["Longitud (grados, 4 dec.)"] || "").toString().replace(",", ".");
        const lat = parseFloat(latStr);
        const lon = parseFloat(lonStr);

        if (isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            row["Latitud (grados, 4 dec.)"] = lat;
            row["Longitud (grados, 4 dec.)"] = lon;
        } else {
            row["Latitud (grados, 4 dec.)"] = null;
            row["Longitud (grados, 4 dec.)"] = null;
        }

        Object.keys(row).forEach(function (key) {
            if (typeof row[key] === "string") {
                row[key] = row[key].trim();
            }
        });

        return row;
    }
};

/* ========================================================================== */
/* DATA MANAGER */
/* ========================================================================== */

class DataManager {
    constructor() {
        this.rawData = [];
        this.filteredData = [];
        this.departamentos = [];
        this.fenomenos = [];
        this.cacheFilters = new Map();
    }

    async loadData() {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY_DATA);
            const cachedTime = parseInt(localStorage.getItem(CONFIG.CACHE_KEY_TIME) || "0", 10);
            const now = Date.now();
            if (cached && cachedTime && now - cachedTime < CONFIG.CACHE_TTL_MS) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.rawData = parsed;
                    this.extractMetadata();
                    return this.rawData;
                }
            }
        } catch (e) {
            Logger.warn("No se pudo utilizar cache localStorage", e);
        }

        let lastError = null;
        const urls = [getSheetsCSVUrl(), getSheetsCSVUrlPub()];

        for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
            for (let idx = 0; idx < urls.length; idx++) {
                const url = urls[idx];
                try {
                    Logger.info("Intento " + attempt + " descargando CSV desde: " + url);
                    const csvText = await this.fetchCSV(url);
                    const data = CSVParser.parse(csvText);
                    this.rawData = data;
                    this.extractMetadata();
                    try {
                        localStorage.setItem(CONFIG.CACHE_KEY_DATA, JSON.stringify(this.rawData));
                        localStorage.setItem(CONFIG.CACHE_KEY_TIME, String(Date.now()));
                    } catch (e) {
                        Logger.warn("No se pudo almacenar en cache localStorage", e);
                    }
                    return this.rawData;
                } catch (err) {
                    lastError = err;
                    Logger.warn("Fallo con URL " + url + ": " + (err && err.message ? err.message : err));
                }
            }
            await new Promise(function (resolve) {
                setTimeout(resolve, CONFIG.RETRY_DELAY_MS);
            });
        }

        throw new Error(
            lastError && lastError.message
                ? lastError.message
                : "Error al cargar datos desde Google Sheets"
        );
    }

    async fetchCSV(url) {
        const controller = new AbortController();
        const timeout = setTimeout(function () {
            controller.abort();
        }, 15000);

        try {
            const resp = await fetch(url, {
                method: "GET",
                headers: { "Accept": "text/csv" },
                signal: controller.signal
            });
            if (!resp.ok) {
                throw new Error("HTTP " + resp.status + ": " + resp.statusText);
            }
            const text = await resp.text();
            if (!text || text.trim().length === 0) {
                throw new Error("El archivo CSV está vacío");
            }
            return text;
        } finally {
            clearTimeout(timeout);
        }
    }

    extractMetadata() {
        const deptSet = new Set();
        const fenSet = new Set();
        this.rawData.forEach(function (row) {
            if (row["Departamento_corr"]) {
                deptSet.add(row["Departamento_corr"]);
            }
            if (row["Tipo de fenómeno CORR (GRA/RAF/TOR)"]) {
                fenSet.add(row["Tipo de fenómeno CORR (GRA/RAF/TOR)"]);
            }
        });
        this.departamentos = Array.from(deptSet).sort();
        this.fenomenos = Array.from(fenSet).sort();
        Logger.info(
            "Metadata: " + this.departamentos.length + " departamentos, " +
            this.fenomenos.length + " tipos de fenómeno"
        );
    }

    filterData(filters) {
        const key = JSON.stringify(filters);
        if (this.cacheFilters.has(key)) {
            this.filteredData = this.cacheFilters.get(key);
            return this.filteredData;
        }

        const result = this.rawData.filter(function (row) {
            const dept = row["Departamento_corr"] || "";
            const tipo = row["Tipo de fenómeno CORR (GRA/RAF/TOR)"] || "";
            const lat = row["Latitud (grados, 4 dec.)"];
            const lon = row["Longitud (grados, 4 dec.)"];

            if (filters.departamento && dept !== filters.departamento) {
                return false;
            }
            if (filters.fenomenos && filters.fenomenos.length > 0 &&
                filters.fenomenos.indexOf(tipo) === -1) {
                return false;
            }
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return false;
            }
            return true;
        });

        this.filteredData = result;
        this.cacheFilters.set(key, result);
        Logger.info("Filtrado: " + result.length + " registros");
        return result;
    }

    getStats(currentData) {
        const data = currentData || this.filteredData;
        const byFenomeno = {};
        const byDepartamento = {};
        data.forEach(function (row) {
            const tipo = row["Tipo de fenómeno CORR (GRA/RAF/TOR)"] || "Desconocido";
            const dept = row["Departamento_corr"] || "Desconocido";
            byFenomeno[tipo] = (byFenomeno[tipo] || 0) + 1;
            byDepartamento[dept] = (byDepartamento[dept] || 0) + 1;
        });
        return {
            total: data.length,
            byFenomeno: byFenomeno,
            byDepartamento: byDepartamento
        };
    }
}

/* ========================================================================== */
/* UI MANAGER */
/* ========================================================================== */

class UIManager {
    constructor() {
        this.loading = document.getElementById("loadingState");
        this.error = document.getElementById("errorState");
        this.errorMessage = document.getElementById("errorMessage");
        this.errorDetails = document.getElementById("errorDetails");
        this.retryButton = document.getElementById("retryButton");
        this.debugButton = document.getElementById("debugButton");
        this.debugPanel = document.getElementById("debugPanel");
        this.main = document.getElementById("mainContent");
        this.filterStatus = document.getElementById("filterStatus");
    }

    showLoading(message) {
        this.hideAll();
        if (this.loading) {
            this.loading.style.display = "block";
            const p = this.loading.querySelector("p");
            if (p && message) {
                p.textContent = message;
            }
        }
    }

    showMain() {
        this.hideAll();
        if (this.main) {
            this.main.style.display = "block";
        }
    }

    showError(message, details, onRetry) {
        this.hideAll();
        if (!this.error) return;

        this.error.style.display = "block";
        this.errorMessage.innerHTML = message || "Error inesperado";

        if (details) {
            this.errorDetails.textContent = details;
            this.errorDetails.style.display = "block";
        } else {
            this.errorDetails.style.display = "none";
        }

        if (this.retryButton) {
            if (onRetry) {
                this.retryButton.style.display = "inline-block";
                this.retryButton.onclick = onRetry;
            } else {
                this.retryButton.style.display = "none";
            }
        }

        if (this.debugButton) {
            if (CONFIG.DEBUG_MODE) {
                this.debugButton.style.display = "inline-block";
                this.debugButton.onclick = this.toggleDebug.bind(this);
            } else {
                this.debugButton.style.display = "none";
            }
        }
    }

    hideAll() {
        if (this.loading) this.loading.style.display = "none";
        if (this.error) this.error.style.display = "none";
        if (this.main) this.main.style.display = "none";
        if (this.debugPanel) this.debugPanel.style.display = "none";
    }

    toggleDebug() {
        if (!this.debugPanel) return;
        this.debugPanel.style.display =
            this.debugPanel.style.display === "block" ? "none" : "block";
    }

    updateDebug(url, status, count) {
        if (!CONFIG.DEBUG_MODE || !this.debugPanel) return;
        const urlSpan = document.getElementById("debugURL");
        const stSpan = document.getElementById("debugStatus");
        const cSpan = document.getElementById("debugDataCount");
        if (urlSpan) urlSpan.textContent = url;
        if (stSpan) stSpan.textContent = status;
        if (cSpan) cSpan.textContent = String(count);
    }

    updateFilterStatus(total, filtered) {
        if (!this.filterStatus) return;
        if (total > 0 && filtered !== total) {
            this.filterStatus.textContent =
                "Mostrando " + filtered + " de " + total + " registros";
            this.filterStatus.style.display = "inline";
        } else {
            this.filterStatus.textContent = "";
            this.filterStatus.style.display = "none";
        }
    }
}

/* ========================================================================== */
/* MAPA */
/* ========================================================================== */

class MapManager {
    constructor(mapId) {
        this.mapElement = document.getElementById(mapId);
        this.map = null;
        this.layer = null;
        this.init();
    }

    init() {
        if (!this.mapElement || typeof L === "undefined") {
            throw new Error("No se pudo inicializar el mapa Leaflet");
        }

        this.map = L.map(this.mapElement, {
            center: CONFIG.MAP_CENTER,
            zoom: CONFIG.MAP_ZOOM,
            zoomControl: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 18
        }).addTo(this.map);

        this.layer = L.layerGroup().addTo(this.map);
    }

    update(data) {
        if (!this.map || !this.layer) return;
        this.layer.clearLayers();

        if (!data || data.length === 0) {
            this.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
            return;
        }

        const bounds = [];

        data.forEach(function (row) {
            const lat = row["Latitud (grados, 4 dec.)"];
            const lon = row["Longitud (grados, 4 dec.)"];
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return;
            }

            const tipo = row["Tipo de fenómeno CORR (GRA/RAF/TOR)"] || "";
            const color = MapManager.getColor(tipo);

            const popup =
                '<div class="popup-content">' +
                "<h6>" + Sanitizer.sanitizeText(row["Localidad"]) + "</h6>" +
                "<div>" +
                "<strong>Departamento:</strong> " +
                Sanitizer.sanitizeText(row["Departamento_corr"]) + "<br>" +
                "<strong>Fenómeno:</strong> " +
                '<span class="badge" style="background:' + color + ';">' +
                Sanitizer.sanitizeText(tipo) + "</span><br>" +
                "<strong>Fecha:</strong> " +
                Sanitizer.sanitizeText(row["Fecha"]) + "<br>" +
                "<strong>Intensidad:</strong> " +
                Sanitizer.sanitizeText(row["Intensidad / Tamaño / Escala"]) + "<br>" +
                "<hr>" +
                "<p>" +
                Sanitizer.sanitizeText(
                    row["Descripción / Información adicional"],
                    220
                ) +
                "</p>" +
                (row["Fuente"] && Sanitizer.isValidURL(row["Fuente"])
                    ? '<a href="' + row["Fuente"] +
                      '" target="_blank" rel="noopener noreferrer">Ver fuente</a>'
                    : "") +
                "</div></div>";

            const icon = L.divIcon({
                html:
                    '<div style="' +
                    "width:12px;height:12px;border-radius:50%;" +
                    "background:" + color + ";" +
                    "border:2px solid #ffffff;" +
                    "box-shadow:0 2px 6px rgba(0,0,0,0.4);" +
                    '"></div>',
                className: "custom-marker",
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const marker = L.marker([lat, lon], { icon: icon }).bindPopup(popup);
            marker.addTo(this.layer);
            bounds.push([lat, lon]);
        }, this);

        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
        }
    }

    static getColor(tipo) {
        if (tipo === "GRA") return "#dc3545";
        if (tipo === "RAF") return "#0d6efd";
        if (tipo === "TOR") return "#ffc107";
        return "#6c757d";
    }
}

/* ========================================================================== */
/* GRÁFICOS */
/* ========================================================================== */

class ChartManager {
    constructor() {
        this.fenomenoChart = null;
        this.deptoChart = null;
        this.init();
    }

    init() {
        if (typeof Chart === "undefined") {
            throw new Error("Chart.js no está disponible");
        }

        const fenCtx = document.getElementById("fenomenoChart");
        const depCtx = document.getElementById("departamentoChart");
        if (!fenCtx || !depCtx) {
            throw new Error("No se encontraron elementos canvas");
        }

        this.fenomenoChart = new Chart(fenCtx.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        "#dc3545",
                        "#0d6efd",
                        "#ffc107",
                        "#198754",
                        "#6c757d"
                    ],
                    borderColor: "#ffffff",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const label = ctx.label || "";
                                const value = ctx.parsed || 0;
                                const total = ctx.dataset.data.reduce(
                                    function (a, b) { return a + b; },
                                    0
                                );
                                const pct = total > 0
                                    ? ((value / total) * 100).toFixed(1)
                                    : "0.0";
                                return label + ": " + value + " (" + pct + "%)";
                            }
                        }
                    }
                }
            }
        });

        this.deptoChart = new Chart(depCtx.getContext("2d"), {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: "Número de eventos",
                    data: [],
                    backgroundColor: "rgba(13,110,253,0.85)",
                    borderColor: "rgba(13,110,253,1)",
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: {
                            autoSkip: false,
                            maxRotation: 60,
                            minRotation: 30
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(0,0,0,0.08)" }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    update(stats) {
        if (!this.fenomenoChart || !this.deptoChart) return;

        const byFen = stats.byFenomeno || {};
        const byDep = stats.byDepartamento || {};

        const fenLabels = Object.keys(byFen);
        const fenValues = fenLabels.map(function (k) { return byFen[k]; });
        this.fenomenoChart.data.labels = fenLabels;
        this.fenomenoChart.data.datasets[0].data = fenValues;
        this.fenomenoChart.update();

        const depEntries = Object.entries(byDep)
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 10);

        this.deptoChart.data.labels = depEntries.map(function (d) { return d[0]; });
        this.deptoChart.data.datasets[0].data = depEntries.map(function (d) { return d[1]; });
        this.deptoChart.update();
    }
}

/* ========================================================================== */
/* TABLA */
/* ========================================================================== */

class TableManager {
    constructor() {
        this.data = [];
        this.currentPage = 1;
        this.sortField = "timestamp";
        this.sortDir = "desc";
        this.tbody = document.getElementById("tableBody");
        this.paginationInfo = document.getElementById("paginationInfo");
        this.paginationControls = document.getElementById("paginationControls");
    }

    update(data) {
        this.data = Array.isArray(data) ? data.slice() : [];
        this.currentPage = 1;
        this.sortField = "timestamp";
        this.sortDir = "desc";
        this.applySorting();
        this.render();
    }

    setSort(field) {
        if (this.sortField === field) {
            this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
        } else {
            this.sortField = field;
            this.sortDir = "asc";
        }
        this.applySorting();
        this.currentPage = 1;
        this.render();
    }

    applySorting() {
        const field = this.sortField;
        const dir = this.sortDir;
        this.data.sort(function (a, b) {
            let va = a[field];
            let vb = b[field];

            if (field === "timestamp") {
                va = a.timestamp || 0;
                vb = b.timestamp || 0;
            }

            if (typeof va === "string") va = va.toLowerCase();
            if (typeof vb === "string") vb = vb.toLowerCase();

            if (va < vb) return dir === "asc" ? -1 : 1;
            if (va > vb) return dir === "asc" ? 1 : -1;
            return 0;
        });
    }

    render() {
        if (!this.tbody) return;

        const total = this.data.length;
        const totalPages = total > 0 ? Math.ceil(total / CONFIG.PAGE_SIZE) : 0;

        if (total === 0) {
            this.tbody.innerHTML =
                '<tr><td colspan="7" class="text-center py-5 text-muted">' +
                '<i class="bi bi-inbox" style="font-size:2rem;"></i>' +
                '<p class="mt-2 mb-0">No se encontraron registros para los filtros seleccionados</p>' +
                "</td></tr>";
            this.updatePagination(0, 0, 0, 0);
            return;
        }

        if (this.currentPage < 1) this.currentPage = 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;

        const start = (this.currentPage - 1) * CONFIG.PAGE_SIZE;
        const end = Math.min(start + CONFIG.PAGE_SIZE, total);
        const pageData = this.data.slice(start, end);

        const rows = pageData.map(function (row) {
            const tipo = row["Tipo de fenómeno CORR (GRA/RAF/TOR)"] || "";
            const color = MapManager.getColor(tipo);

            const fuenteHTML = row["Fuente"] && Sanitizer.isValidURL(row["Fuente"])
                ? '<a href="' + Sanitizer.escapeHTML(row["Fuente"]) +
                  '" target="_blank" rel="noopener noreferrer" ' +
                  'class="btn btn-sm btn-outline-primary" title="Abrir fuente">' +
                  '<i class="bi bi-box-arrow-up-right"></i></a>'
                : '<span class="text-muted"><i class="bi bi-dash"></i></span>';

            return (
                "<tr>" +
                "<td>" + Sanitizer.sanitizeText(row["Fecha"]) + "</td>" +
                "<td>" + Sanitizer.sanitizeText(row["Localidad"]) + "</td>" +
                "<td>" + Sanitizer.sanitizeText(row["Departamento_corr"]) + "</td>" +
                '<td><span class="badge" style="background:' + color + ';">' +
                Sanitizer.sanitizeText(tipo) + "</span></td>" +
                "<td>" + Sanitizer.sanitizeText(row["Intensidad / Tamaño / Escala"]) + "</td>" +
                "<td>" + Sanitizer.sanitizeText(
                    row["Descripción / Información adicional"],
                    150
                ) + "</td>" +
                "<td>" + fuenteHTML + "</td>" +
                "</tr>"
            );
        }).join("");

        this.tbody.innerHTML = rows;
        this.updatePagination(total, totalPages, start + 1, end);
    }

    updatePagination(total, totalPages, start, end) {
        if (!this.paginationInfo || !this.paginationControls) return;

        if (total === 0 || totalPages === 0) {
            this.paginationInfo.textContent = "";
            this.paginationControls.innerHTML = "";
            return;
        }

        this.paginationInfo.textContent =
            "Mostrando " + start + "-" + end + " de " + total + " registros";

        const current = this.currentPage;
        const self = this;

        function createPageItem(page, label, disabled, active) {
            const li = document.createElement("li");
            li.className =
                "page-item" +
                (disabled ? " disabled" : "") +
                (active ? " active" : "");
            const a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.textContent = label;
            if (!disabled) {
                a.dataset.page = String(page);
            }
            li.appendChild(a);
            return li;
        }

        this.paginationControls.innerHTML = "";

        this.paginationControls.appendChild(
            createPageItem(current - 1, "Anterior", current === 1, false)
        );

        const maxButtons = 5;
        let startPage = Math.max(1, current - Math.floor(maxButtons / 2));
        let endPage = startPage + maxButtons - 1;
        if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            this.paginationControls.appendChild(
                createPageItem(p, String(p), false, p === current)
            );
        }

        this.paginationControls.appendChild(
            createPageItem(current + 1, "Siguiente", current === totalPages, false)
        );

        this.paginationControls
            .querySelectorAll(".page-link")
            .forEach(function (a) {
                a.addEventListener("click", function (ev) {
                    ev.preventDefault();
                    const pageAttr = a.dataset.page;
                    if (!pageAttr) return;
                    const page = parseInt(pageAttr, 10);
                    if (!isNaN(page) && page >= 1 && page <= totalPages) {
                        self.currentPage = page;
                        self.render();
                    }
                });
            });
    }
}

/* ========================================================================== */
/* FILTROS Y EXPORTACIÓN */
/* ========================================================================== */

class FilterManager {
    constructor(dataManager, onChange) {
        this.dataManager = dataManager;
        this.onChange = onChange;
        this.filters = {
            departamento: "",
            fenomenos: []
        };
        this.deptSelect = document.getElementById("departamentoFilter");
        this.fenContainer = document.getElementById("fenomenoFilter");
        this.clearButton = document.getElementById("clearFilters");
        this.loadFromStorage();
        this.buildUI();
        this.attachEvents();
        this.triggerChange();
    }

    buildUI() {
        if (this.deptSelect) {
            const options = ['<option value="">Todos los Departamentos</option>']
                .concat(this.dataManager.departamentos.map((d) => {
                    const val = Sanitizer.escapeHTML(d);
                    const selected = this.filters.departamento === d ? " selected" : "";
                    return '<option value="' + val + '"' + selected + ">" + val + "</option>";
                }));
            this.deptSelect.innerHTML = options.join("");
        }

        if (this.fenContainer) {
            const fens = this.dataManager.fenomenos.length > 0
                ? this.dataManager.fenomenos
                : ["GRA", "RAF", "TOR"];

            if (!this.filters.fenomenos || this.filters.fenomenos.length === 0) {
                this.filters.fenomenos = fens.slice();
            }

            this.fenContainer.innerHTML = fens.map((code) => {
                const checked =
                    this.filters.fenomenos.indexOf(code) !== -1 ? " checked" : "";
                const label = this.getFenomenoLabel(code);
                return (
                    '<div class="form-check form-check-inline">' +
                    '<input class="form-check-input" type="checkbox" id="fen_' + code + '"' +
                    ' value="' + code + '"' + checked + ">" +
                    '<label class="form-check-label" for="fen_' + code + '">' +
                    Sanitizer.escapeHTML(label) +
                    "</label>" +
                    "</div>"
                );
            }).join("");
        }
    }

    getFenomenoLabel(code) {
        if (code === "GRA") return "Granizo (GRA)";
        if (code === "RAF") return "Ráfagas (RAF)";
        if (code === "TOR") return "Tornado (TOR)";
        return code;
    }

    attachEvents() {
        const self = this;

        if (this.deptSelect) {
            this.deptSelect.addEventListener("change", debounce(function () {
                self.updateFiltersFromUI();
            }, CONFIG.DEBOUNCE_DELAY));
        }

        if (this.fenContainer) {
            this.fenContainer.addEventListener("change", debounce(function () {
                self.updateFiltersFromUI();
            }, CONFIG.DEBOUNCE_DELAY));
        }

        if (this.clearButton) {
            this.clearButton.addEventListener("click", function () {
                self.resetFilters();
            });
        }

        document
            .querySelectorAll("#dataTable th[data-sort]")
            .forEach(function (th) {
                th.addEventListener("click", function () {
                    const field = th.getAttribute("data-sort");
                    if (field && window.tableManager) {
                        if (field === "fecha") {
                            window.tableManager.setSort("timestamp");
                        } else {
                            window.tableManager.setSort(field);
                        }
                    }
                });
            });

        const exportBtn = document.getElementById("exportCSV");
        if (exportBtn) {
            exportBtn.addEventListener("click", function () {
                self.exportCurrentCSV();
            });
        }
    }

    updateFiltersFromUI() {
        if (this.deptSelect) {
            this.filters.departamento = this.deptSelect.value || "";
        }
        if (this.fenContainer) {
            const selected = [];
            this.fenContainer
                .querySelectorAll("input[type=checkbox]")
                .forEach(function (cb) {
                    if (cb.checked) {
                        selected.push(cb.value);
                    }
                });
            this.filters.fenomenos = selected;
        }
        this.saveToStorage();
        this.triggerChange();
    }

    resetFilters() {
        this.filters.departamento = "";
        this.filters.fenomenos = this.dataManager.fenomenos.length > 0
            ? this.dataManager.fenomenos.slice()
            : ["GRA", "RAF", "TOR"];
        this.saveToStorage();
        this.buildUI();
        this.triggerChange();
    }

    triggerChange() {
        if (typeof this.onChange === "function") {
            this.onChange(this.filters);
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem("severeWxFilters", JSON.stringify(this.filters));
        } catch (e) {
            Logger.warn("No se pudo guardar filtros en localStorage", e);
        }
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem("severeWxFilters");
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === "object") {
                    this.filters = {
                        departamento: obj.departamento || "",
                        fenomenos: Array.isArray(obj.fenomenos) ? obj.fenomenos : []
                    };
                }
            }
        } catch (e) {
            Logger.warn("No se pudo leer filtros desde localStorage", e);
        }
    }

    exportCurrentCSV() {
        const data = window.dataManager
            ? window.dataManager.filteredData || []
            : [];
        if (!data.length) return;

        const headers = [
            "Fecha",
            "Localidad",
            "Departamento_corr",
            "Tipo de fenómeno CORR (GRA/RAF/TOR)",
            "Intensidad / Tamaño / Escala",
            "Descripción / Información adicional",
            "Latitud (grados, 4 dec.)",
            "Longitud (grados, 4 dec.)",
            "Fuente"
        ];

        const rows = data.map(function (row) {
            return headers.map(function (h) {
                const value = row[h] != null ? String(row[h]) : "";
                return "\"" + value.replace(/"/g, "\"\"") + "\"";
            }).join(",");
        });

        const csvContent = [headers.join(",")].concat(rows).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const today = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = "eventos_meteorologicos_" + today + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/* ========================================================================== */
/* CONTROLADOR PRINCIPAL */
/* ========================================================================== */

class DashboardController {
    constructor() {
        this.dataManager = new DataManager();
        this.ui = new UIManager();
        this.map = null;
        this.charts = null;
        this.table = null;
        this.filters = null;
    }

    async init() {
        try {
            this.ui.showLoading("Cargando datos desde Google Sheets...");
            const data = await this.dataManager.loadData();
            if (!data || !data.length) {
                throw new Error("No se recibieron datos válidos desde la hoja");
            }

            this.map = new MapManager("map");
            this.charts = new ChartManager();
            this.table = new TableManager();

            window.dataManager = this.dataManager;
            window.tableManager = this.table;

            this.filters = new FilterManager(this.dataManager, (filters) => {
                this.updateDashboard(filters);
            });

            this.updateDashboard(this.filters.filters);
            this.ui.showMain();

            if ("serviceWorker" in navigator) {
                navigator.serviceWorker
                    .register("sw.js")
                    .catch(function (err) {
                        Logger.warn("No se pudo registrar el Service Worker", err);
                    });
            }

            Logger.info("Tablero inicializado correctamente");
        } catch (e) {
            Logger.error("Error en inicialización del tablero", e);
            const msg = e && e.message ? e.message : "Error desconocido al inicializar";
            this.ui.showError(msg, "", function () {
                location.reload();
            });
        }
    }

    updateDashboard(filters) {
        try {
            const filtered = this.dataManager.filterData(filters);
            const stats = this.dataManager.getStats(filtered);

            if (this.map) this.map.update(filtered);
            if (this.charts) this.charts.update(stats);
            if (this.table) this.table.update(filtered);

            this.updateKPIs(stats, filtered.length);
            this.ui.updateFilterStatus(this.dataManager.rawData.length, filtered.length);
            this.ui.updateDebug(getSheetsCSVUrl(), "OK", filtered.length);
        } catch (e) {
            Logger.error("Error al actualizar el tablero", e);
            this.ui.showError(
                "Error al actualizar la visualización",
                e && e.message ? e.message : ""
            );
        }
    }

    updateKPIs(stats, filteredCount) {
        const container = document.getElementById("kpiContainer");
        if (!container) return;

        const totalRegistros = this.dataManager.rawData.length;
        const tasaGeo = totalRegistros > 0
            ? ((filteredCount / totalRegistros) * 100).toFixed(1)
            : "0.0";

        const tipos = Object.keys(stats.byFenomeno || {}).length;
        const deptos = Object.keys(stats.byDepartamento || {}).length;

        container.innerHTML =
            '<div class="col-md-3">' +
            '<div class="dashboard-card text-center">' +
            '<h3 class="text-primary">' + filteredCount + "</h3>" +
            '<p class="mb-0 text-muted">Eventos geolocalizados en mapa</p>' +
            "</div></div>" +

            '<div class="col-md-3">' +
            '<div class="dashboard-card text-center">' +
            '<h3 class="text-success">' + tasaGeo + "%</h3>" +
            '<p class="mb-0 text-muted">Tasa de geolocalización sobre el total</p>' +
            "</div></div>" +

            '<div class="col-md-3">' +
            '<div class="dashboard-card text-center">' +
            '<h3 class="text-warning">' + tipos + "</h3>" +
            '<p class="mb-0 text-muted">Tipos de fenómeno registrados</p>' +
            "</div></div>" +

            '<div class="col-md-3">' +
            '<div class="dashboard-card text-center">' +
            '<h3 class="text-info">' + deptos + "</h3>" +
            '<p class="mb-0 text-muted">Departamentos con reportes</p>' +
            "</div></div>";
    }
}

/* ========================================================================== */
/* INICIALIZACIÓN */
/* ========================================================================== */

(function () {
    function start() {
        const app = new DashboardController();
        app.init();
        window.DashboardApp = app;
        Logger.info("URL Sheets configurada:", getSheetsCSVUrl());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
