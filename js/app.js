/* ---------- CONFIG ---------- */
const SHEET_ID = '1RR-9_QpWa1X8HBFh4pjYndn64DnyGRpBYF0k6VMio9s';
const el = id => document.getElementById(id);
const gidInput = el('gidInput');
const logEl = el('log');


function log(msg){ console.log(msg); logEl.textContent = (new Date()).toLocaleTimeString() + ' – ' + msg + '\n' + logEl.textContent; }


/* ---------- Parsing helpers ---------- */
function tryParseNumber(v){ if(v===null||v===undefined) return null; if(typeof v==='number') return v; const s = String(v).trim().replace(/\s+/g,'').replace(/,/g,'.').replace(/[^0-9.\-\.eE]/g,''); if(s===''||s=='.'||s==='-.') return null; const n=Number(s); return Number.isFinite(n)?n:null; }
function tryParseDate(v){ if(!v && v!==0) return null; if(v instanceof Date) return v; const s = String(v).trim(); // ISO
let d = new Date(s); if(!isNaN(d)) return d; const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){ const day=+m[1], mon=+m[2]-1, year=+m[3]; d=new Date(year<100?(2000+year):year,mon,day); if(!isNaN(d)) return d; } return null; }


/* ---------- gviz parser ---------- */
function parseGviz(text){ const jsonTextMatch = text.match(/\{[\s\S]*\}\);?\s*$/m); if(!jsonTextMatch) throw new Error('Respuesta gviz no reconocida'); const jsonText = jsonTextMatch[0].replace(/\);\s*$/,''); const data = JSON.parse(jsonText); const cols = data.table.cols.map(c=> (c.label||c.id||'').trim()); const rows = data.table.rows.map(r=>{ const obj={}; r.c.forEach((cell,i)=>{ obj[cols[i]||('col'+i)] = cell && (cell.v !== undefined ? cell.v : cell.f !== undefined ? cell.f : null); }); return obj; }); return {cols, rows}; }


/* ---------- PapaParse fallback ---------- */
function parseCSVtext(text){ const parsed = Papa.parse(text, {header:true, dynamicTyping:false, skipEmptyLines:true}); if(parsed.errors && parsed.errors.length) log('PapaParse errores: '+JSON.stringify(parsed.errors.slice(0,3))); const cols = parsed.meta.fields; const rows = parsed.data; return {cols, rows}; }


/* ---------- Análisis de columnas ---------- */
function analyzeColumns(cols, rows){ const info={dateCols:[], numCols:[], catCols:[], latCols:[], lonCols:[], coordCols:[]}; const lower = s=> (s||'').toLowerCase(); cols.forEach(c=>{ const n=lower(c); if(/fecha|date|time|day|timestamp|anio|año/.test(n)) info.dateCols.push(c); if(/lat|latitude|latitud/.test(n)) info.latCols.push(c); if(/lon|lng|long|longitude|longitud/.test(n)) info.lonCols.push(c); if(/coord|coordenad/.test(n)) info.coordCols.push(c); }); const sample = Math.min(50, rows.length); cols.forEach(col=>{ let nNumeric=0,nEmpty=0,nTotal=0; const unique=new Set(); for(let i=0;i<sample;i++){ const v = rows[i][col]; if(v===null||v===undefined||String(v).trim()===''){ nEmpty++; continue;} nTotal++; const maybeN = tryParseNumber(v); if(maybeN!==null) nNumeric++; unique.add(String(v).trim().toLowerCase()); } const uniqueRatio = unique.size/Math.max(1,nTotal); if(nTotal>0 && nNumeric/nTotal>0.7) info.numCols.push(col); else if(unique.size <= Math.max(10, Math.ceil(rows.length*0.2))) info.catCols.push(col); }); return info; }


/* ---------- Aggregations ---------- */
function aggregateTimeSeries(rows,dateCol,valueCol,freq='day'){ const map=new Map(); rows.forEach(r=>{ const d = tryParseDate(r[dateCol]); if(!d) return; let key; if(freq==='month') key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); else key = d.toISOString().slice(0,10); const val = tryParseNumber(r[valueCol]); const cur = map.get(key)||{sum:0,count:0}; if(val!==null){ cur.sum += val; cur.count +=1; } else cur.count+=1; map.set(key,cur); }); const sorted = Array.from(map.keys()).sort(); return {labels:sorted, dataAvg:sorted.map(k=>{const m=map.get(k); return m.count>0?(m.sum/m.count):null;}), counts:sorted.map(k=>map.get(k).count)}; }
function aggregateCategory(rows,catCol,topN=10){ const freq=new Map(); rows.forEach(r=>{ const k = (r[catCol]===null||r[catCol]===undefined||String(r[catCol]).trim()==='')? '(vacío)': String(r[catCol]).trim(); freq.set(k,(freq.get(k)||0)+1); }); const arr=Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,topN); return {labels:arr.map(a=>a[0]), data:arr.map(a=>a[1])}; }


/* ---------- Map helpers ---------- */
let mapInstance=null, markersLayer=null;
function initMap(){ if(mapInstance) return; mapInstance = L.map('map').setView([-25,-57],5); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors' }).addTo(mapInstance); markersLayer = L.layerGroup().addTo(mapInstance); }
function placeMarkers(rows, latCol, lonCol){ markersLayer.clearLayers(); const pts=[]; rows.forEach(r=>{ let lat = tryParseNumber(r[latCol]); let lon = tryParseNumber(r[lonCol]); if((lat===null||lon===null) && r['coord']){ const m = String(r['coord']).split(/[,;\s]+/).map(s=>tryParseNumber(s)); if(m.length>=2){ lat=m[0]; lon=m[1]; } } if(lat===null||lon===null) return; pts.push([lat,lon]); const popup = Object.keys(r).slice(0,8).map(k=>`<b>${k}</b>: ${r[k]}`).join('<br>'); L.marker([lat,lon]).bindPopup(popup).addTo(markersLayer); }); if(pts.length>0){ const bounds = L.latLngBounds(pts); mapInstance.fitBounds(bounds.pad(0.2)); } }


/* ---------- Chart helpers ---------- */
let lineChartInst=null, barChartInst=null;
function createOrUpdateLine(labels,data,label){ const ctx = el('lineChart').getContext('2d'); const cfg={ type:'line', data:{ labels, datasets:[{ label:label||'Serie', data, fill:false, tension:0.3 }]}, options:{ responsive:true, maintainAspectRatio:false } }; if(lineChartInst){ lineChartInst.data.labels=labels; lineChartInst.data.datasets[0].data=data; lineChartInst.data.datasets[0].label=label; lineChartInst.update(); } else lineChartInst = new Chart(ctx,cfg); }
function createOrUpdateBar(labels,data,label){ const ctx = el('barChart').getContext('2d'); const cfg={ type:'bar', data:{ labels, datasets:[{ label:label||'Frecuencia', data }]}, options:{ responsive:true, maintainAspectRatio:false } }; if(barChartInst){ barChartInst.data.labels=labels; barChartInst.data.datasets[0].data=data; barChartInst.update(); } else barChartInst = new Chart(ctx,cfg); }


/* ---------- Load sheet (gviz -> CSV) ---------- */
async function loadSheet(){ const gid = gidInput.value || '0'; el('rowCount').textContent='—'; el('colCount').textContent='—'; el('aut
