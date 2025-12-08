// URL CSV PUBLICADO
const urlCSV =
 "https://docs.google.com/spreadsheets/d/1bcNjxh9ZSpPXEnu3ZQfgYWHtrBPGWgqOUL0DJyqRtFs/export?format=csv";

let DATA = [];

// Cargar CSV
Papa.parse(urlCSV, {
    download: true,
    header: true,
    complete: function (results) {
        DATA = results.data;
        initTablero();
    }
});

function initTablero() {
    construirTabla(DATA);
    cargarVariables(DATA);
    actualizarAnalisis();
}

function cargarVariables(data) {
    const select = document.getElementById("variableSelect");
    const columnas = Object.keys(data[0]);

    columnas.forEach(col => {
        const op = document.createElement("option");
        op.value = col;
        op.textContent = col;
        select.appendChild(op);
    });

    select.value = columnas[1]; // por defecto elegir segunda columna
    select.addEventListener("change", actualizarAnalisis);
}

function actualizarAnalisis() {
    const variable = document.getElementById("variableSelect").value;
    const valores = DATA.map(d => parseFloat(d[variable])).filter(v => !isNaN(v));

    calcularStats(valores);
    graficarLinea(variable, valores);
    graficarBarras(variable, valores);
    graficarHist(variable, valores);
}

function calcularStats(valores) {
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const mediana = [...valores].sort((a,b)=>a-b)[Math.floor(valores.length/2)];
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    const p90 = [...valores].sort((a,b)=>a-b)[Math.floor(valores.length*0.9)];
    
    const varianza = valores.reduce((a,b)=>a+(b-media)**2,0)/valores.length;

    document.getElementById("statMedia").textContent = media.toFixed(2);
    document.getElementById("statMediana").textContent = mediana.toFixed(2);
    document.getElementById("statMax").textContent = max.toFixed(2);
    document.getElementById("statMin").textContent = min.toFixed(2);
    document.getElementById("statP90").textContent = p90.toFixed(2);
    document.getElementById("statVar").textContent = varianza.toFixed(2);
}

// --- Gráficos ---
let chartLinea, chartBarras, chartHist;

function graficarLinea(variable, valores) {
    const fechas = DATA.map(d => d.Fecha || d.fecha);

    if (chartLinea) chartLinea.destroy();

    chartLinea = new Chart(document.getElementById("chartLinea"), {
        type: "line",
        data: {
            labels: fechas,
            datasets: [{
                label: variable,
                data: valores,
                borderWidth: 2
            }]
        }
    });
}

function graficarBarras(variable, valores) {
    if (chartBarras) chartBarras.destroy();

    chartBarras = new Chart(document.getElementById("chartBarras"), {
        type: "bar",
        data: {
            labels: DATA.map(d => d.Fecha || d.fecha),
            datasets: [{
                label: variable,
                data: valores
            }]
        }
    });
}

function graficarHist(variable, valores) {
    if (chartHist) chartHist.destroy();

    const bins = 10;
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const ancho = (max - min) / bins;

    let freq = Array(bins).fill(0);

    valores.forEach(v => {
        const idx = Math.min(bins - 1, Math.floor((v - min) / ancho));
        freq[idx]++;
    });

    chartHist = new Chart(document.getElementById("chartHist"), {
        type: "bar",
        data: {
            labels: freq.map((_, i) =>
                `${(min + i * ancho).toFixed(1)} - ${(min + (i + 1) * ancho).toFixed(1)}`
            ),
            datasets: [{
                label: "Frecuencia",
                data: freq
            }]
        }
    });
}

// --- Tabla ---
function construirTabla(data) {
    const tabla = document.getElementById("tablaDatos");
    tabla.innerHTML = "";

    if (data.length === 0) return;

    const headers = Object.keys(data[0]);

    let thead = "<tr>";
    headers.forEach(h => thead += `<th>${h}</th>`);
    thead += "</tr>";

    let filas = "";
    data.forEach(row => {
        filas += "<tr>";
        headers.forEach(h => filas += `<td>${row[h] || ""}</td>`);
        filas += "</tr>";
    });

    tabla.innerHTML = thead + filas;
}
