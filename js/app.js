// ID de la hoja de cálculo de Google Drive.
// Reemplaza esto si el ID de tu hoja cambia.
const SHEET_ID = '1RR-9_QpWa1X8HBFh4pjYndn64DnyGR0BYF0k6VMio9s';
// gid=0 es para la primera pestaña (Hoja 1). Si usas otra pestaña, cambia el gid.
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;

document.addEventListener('DOMContentLoaded', () => {
    fetchCSVData();
});

/**
 * Filtra los datos para incluir solo los fenómenos de interés
 * (RAF, TOR, FUN, o RAF | GRA)
 * @param {object} row - Una fila de datos del CSV.
 * @returns {boolean} - True si la fila contiene un fenómeno de interés.
 */
function isRelevantPhenomenon(row) {
    const fen1 = row['Tipo de fenómeno ORIG (GRA/RAF/TOR)'];
    const fen2 = row.Fen2; // Columna 'Fen2'

    // Casos principales: RAF, TOR, FUN.
    if (['RAF', 'TOR', 'FUN'].includes(fen1)) {
        return true;
    }

    // Caso de RAF con granizo: Buscamos GRA en Fen2 si Fen1 es RAF
    if (fen1 === 'RAF' && fen2 === 'GRA') {
        return true;
    }

    // Nota: El ejemplo de tu CSV usa 'RAF | GRA' en la descripción, 
    // pero se asume que las columnas Fen1/Fen2 son las principales para el filtro.
    // Si necesitas más lógica de filtrado, ajusta esta función.

    return false;
}

/**
 * Descarga y parsea el CSV de Google Drive.
 */
function fetchCSVData() {
    console.log(`Intentando cargar datos desde: ${CSV_URL}`);
    
    Papa.parse(CSV_URL, {
        download: true, // Indica a Papa Parse que descargue el archivo desde la URL
        header: true,   // Trata la primera fila como encabezados de columna
        skipEmptyLines: true,
        complete: function(results) {
            console.log("Parseo completado. Resultados:", results);

            if (results.errors.length > 0) {
                displayError("Error al parsear los datos.", results.errors);
                return;
            }

            // 1. Filtrar los datos relevantes
            const filteredData = results.data.filter(isRelevantPhenomenon);

            // 2. Mostrar los resultados
            displayData(filteredData);
        },
        error: function(error, file) {
            displayError("Error en la descarga del archivo CSV.", error);
        }
    });
}

/**
 * Muestra los datos filtrados en la página.
 * @param {Array<object>} data - Arreglo de objetos de datos filtrados.
 */
function displayData(data) {
    const outputDiv = document.getElementById('data-output');
    
    if (data.length === 0) {
        outputDiv.innerHTML = '<p>No se encontraron fenómenos de interés (RAF, TOR, FUN, o RAF|GRA).</p>';
        return;
    }

    // Construir la tabla
    let html = '<h2>Resultados Filtrados</h2>';
    html += `<p>Total de registros relevantes encontrados: <strong>${data.length}</strong></p>`;
    
    // Obtener los encabezados de las columnas para la tabla (si hay datos)
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    html += '<table border="1" style="width: 100%; border-collapse: collapse;">';
    
    // Encabezados de la tabla
    html += '<thead><tr>';
    // Muestra solo algunas columnas clave para no sobrecargar la vista
    const keyHeaders = ['Fecha', 'Horario (UTC)', 'Localidad', 'Departamento', 'Tipo de fenómeno ORIG (GRA/RAF/TOR)', 'Fen2', 'Descripción / Información adicional'];
    keyHeaders.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead>';

    // Filas de datos
    html += '<tbody>';
    data.forEach(row => {
        html += '<tr>';
        keyHeaders.forEach(header => {
            // Asegurarse de que el valor exista antes de intentar acceder a él
            const value = row[header] !== undefined ? row[header] : 'N/D';
            html += `<td>${value}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';
    html += '</table>';

    outputDiv.innerHTML = html;
}

/**
 * Muestra un mensaje de error en la página y la consola.
 * @param {string} message - El mensaje de error principal.
 * @param {*} errorDetails - Los detalles del error.
 */
function displayError(message, errorDetails) {
    const outputDiv = document.getElementById('data-output');
    outputDiv.innerHTML = `<h2 style="color: red;">🚨 ¡Error!</h2><p>${message}</p>`;
    console.error(message, errorDetails);
}
