// URL del CSV exportado desde Google Sheets
const urlCSV = "https://docs.google.com/spreadsheets/d/1RR-9_QpWa1X8HBFh4pjYndn64DnyGRpBYF0k6VMio9s/export?format=csv";

// Función para convertir CSV → array de objetos
function parseCSV(csv) {
    const filas = csv.trim().split("\n");
    const headers = filas[0].split(",").map(h => h.trim());

    return filas.slice(1).map(row => {
        const cols = row.split(",").map(c => c.trim());
        let obj = {};
        headers.forEach((header, i) => {
            obj[header] = cols[i];
        });
        return obj;
    });
}

// Cargar CSV
fetch(urlCSV)
    .then(res => res.text())
    .then(csv => {
        const datos = parseCSV(csv);

        document.getElementById("status").innerText = "Datos cargados correctamente.";
        cargarTabla(datos);

        // Ejemplo: filtrar por tipo de fenómeno
        const fenomenos = datos.filter(d => 
            ["RAF", "RAF | GRA", "TOR", "FUN"].includes(d.FENOMENO)
        );

        console.log("Fenómenos severos encontrados:", fenomenos);
    })
    .catch(err => {
        document.getElementById("status").innerText = "Error al cargar los datos.";
        console.error(err);
    });

// Mostrar tabla HTML
function cargarTabla(data) {
    if (data.length === 0) return;

    const tabla = document.getElementById("tabla");
    tabla.style.display = "table";

    const thead = document.getElementById("thead");
    const tbody = document.getElementById("tbody");

    // Encabezados
    thead.innerHTML = `
        <tr>
            ${Object.keys(data[0]).map(h => `<th>${h}</th>`).join("")}
        </tr>
    `;

    // Filas
    tbody.innerHTML = data
        .map(row => `
            <tr>
                ${Object.values(row).map(v => `<td>${v}</td>`).join("")}
            </tr>
        `)
        .join("");
}
