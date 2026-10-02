/* PDF — motor de informe (patrón js/pdf.js de Auditoría Técnica).
   Paginación automática con espacio(), pie con numeración, paleta leída del CSS,
   datos Enriquecidos de la franquicia (dirección/razón social/provincia),
   semáforo de agua con porQue, ubicación con link a Google Maps y
   resumen de acciones pendientes para gerencia. */
window.InformePDF = (function () {
    'use strict';

    /* Paleta: lee las variables CSS de marca → una sola fuente de verdad app/PDF */
    var paletteCache = null;
    function rgbDe(rolo) {
        if (!paletteCache) {
            var st = window.getComputedStyle(document.documentElement);
            paletteCache = {};
            ['marca', 'marcaOscuro', 'tinta', 'label', 'verde', 'amarillo', 'naranja', 'rojo', 'sinMedir'].forEach(function (k) {
                var map = { marca: '--c-marca', marcaOscuro: '--c-marca-oscuro', tinta: '--c-tinta', label: '--c-label',
                             verde: '--c-verde', amarillo: '--c-amarillo', naranja: '--c-naranja', rojo: '--c-rojo', sinMedir: '--c-sin-medir' };
                var v = (st.getPropertyValue(map[k]) || '').trim() || '#666666';
                if (v.charAt(0) !== '#') v = '#666666';
                if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
                paletteCache[k] = [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
            });
        }
        return paletteCache[rolo] || [102, 102, 102];
    }
    function colorSem(sem) {
        return rgbDe(({ verde: 'verde', amarillo: 'amarillo', naranja: 'naranja', rojo: 'rojo', gris: 'sinMedir' })[sem] || 'sinMedir');
    }
    function rotuloAgua(sem) {
        return ({ verde: 'AGUA EN RANGO', amarillo: 'AGUA EN ALERTA', naranja: 'AGUA BLANDA', rojo: 'AGUA CRÍTICA', gris: 'AGUA SIN MEDIR' })[sem] || 'AGUA';
    }
    function fechaLargaCorta(iso) {
        var d = iso ? new Date(iso) : new Date();
        function z(n) { return (n < 10 ? '0' : '') + n; }
        return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    function blobADataURL(blob) {
        return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(blob); });
    }

    /* Carga de binarios necesarios para el PDF */
    function cargarTodo(estado) {
        var pLogo = fetch('img/logo.png?v=' + window.MTZ_VERSION).then(function (r) { return r.ok ? r.blob() : null; })
            .then(function (b) { return b ? blobADataURL(b) : null; }).catch(function () { return null; });
        var pFotos = estado.fotos.reduce(function (prom, f) {
            return prom.then(function (mapa) {
                return window.Almacen.leerBinario(f.id).then(function (reg) {
                    if (!reg || !reg.blob) return mapa;
                    return blobADataURL(reg.blob).then(function (u) { mapa[f.id] = u; return mapa; });
                });
            });
        }, Promise.resolve({}));
        var pFT = window.Almacen.leerBinario('firmaT').then(function (r) { return r && r.blob ? blobADataURL(r.blob) : null; });
        var pFE = window.Almacen.leerBinario('firmaE').then(function (r) { return r && r.blob ? blobADataURL(r.blob) : null; });
        return Promise.all([pLogo, pFotos, pFT, pFE]).then(function (r) { return { logo: r[0], fotos: r[1], firmaT: r[2], firmaE: r[3] }; });
    }

    function construir(estado, bin) {
        var ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!ctor) throw new Error('jsPDF no está cargado');
        var doc = new ctor({ unit: 'mm', format: 'a4' });
        var W = 210, H = 297, mx = 14, y = 0, pag = 1;
        var cM = rgbDe('marca'), cMO = rgbDe('rojo'), cTinta = rgbDe('tinta'), cLabel = rgbDe('label');
        var L = estado.local || {};

        function pie() {
            doc.setFontSize(7); doc.setTextColor(150, 150, 150);
            doc.text(window.CONFIG.pieCorporativo, W / 2, H - 8, { align: 'center' });
            doc.text('Página ' + pag, W - mx, H - 8, { align: 'right' });
        }
        function logoCirculo() {
            doc.setFillColor(cMO[0], cMO[1], cMO[2]); doc.circle(mx + 7, 15, 6, 'F');
            doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
            doc.text('M', mx + 7, 17.5, { align: 'center' });
        }
        function encabezado() {
            if (bin.logo) { try { doc.addImage(bin.logo, 'PNG', mx, 8, 14, 14); } catch (e) { logoCirculo(); } }
            else logoCirculo();
            doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
            doc.text('INFORME TÉCNICO DE MANTENIMIENTO', W / 2 + 6, 16, { align: 'center' });
            doc.setFontSize(7.5); doc.setTextColor(cLabel[0], cLabel[1], cLabel[2]); doc.setFont('helvetica', 'normal');
            doc.text(estado.fecha || fechaLargaCorta(), W - mx, 12, { align: 'right' });
            doc.setFont('helvetica', 'bold'); doc.setTextColor(cM[0], cM[1], cM[2]); doc.setFontSize(8);
            doc.text(estado.codigo || 'S/D', W - mx, 16.5, { align: 'right' });
            doc.setDrawColor(cM[0], cM[1], cM[2]); doc.setLineWidth(1); doc.line(mx, 26, W - mx, 26);
            doc.setLineWidth(0.2); doc.setTextColor(0, 0, 0); y = 33;
        }
        function nuevaPagina() { pie(); doc.addPage(); pag++; encabezado(); }
        function espacio(alto) { if (y + alto > H - 16) nuevaPagina(); }
        function titulo(txt) {
            espacio(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
            doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]); doc.text(txt.toUpperCase(), mx, y); y += 5;
            doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(mx, y, W - mx, y); y += 4.5;
        }
        function dato(k, val) {
            espacio(6); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.setTextColor(cLabel[0], cLabel[1], cLabel[2]); doc.text(k + ':', mx, y);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
            var lines = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), W - mx * 2 - 42);
            doc.text(lines, mx + 42, y); y += Math.max(5, lines.length * 4.6);
        }
        function parrafo(txt, size) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 9); doc.setTextColor(50, 50, 50);
            var lines = doc.splitTextToSize(String(txt == null ? '' : txt), W - mx * 2);
            lines.forEach(function (ln) { espacio(5); doc.text(ln, mx, y); y += 4.6; });
        }

        /* ---------- Página 1+: cuerpo del informe ---------- */
        encabezado();
        titulo('1 · Datos de la intervención');
        var siglas = [L.s && ('sis. ' + L.s), L.t && ('tic. ' + L.t)].filter(Boolean).join(' / ');
        dato('Franquicia', L.n + (siglas ? '  (' + siglas + ')' : '') + (L.manual ? ' [carga manual]' : ''));
        var dir = [L.dir, L.cd, L.pr].filter(Boolean).join(' — ');
        if (dir) dato('Dirección', dir);
        if (L.rs) dato('Razón social', L.rs);
        dato('Fecha', estado.fecha || 'S/D');
        dato('Ticket N°', estado.ticket);
        dato('Técnico responsable', estado.tecnico + (estado.codTec ? ' — código ' + estado.codTec : ''));
        dato('Tiempo de labor', (estado.labor || '0') + ' hs   ·   Traslado: ' + (estado.traslado || '0') + ' hs');
        dato('Prioridad / Tipo de servicio', estado.prioridad || 'S/D');
        dato('Encargado (conformidad)', estado.encargado);
        if (estado.geo && estado.geo.lat != null) {
            var url = 'https://www.google.com/maps?q=' + estado.geo.lat + ',' + estado.geo.lng;
            dato('Ubicación del relevamiento', estado.geo.lat.toFixed(5) + ', ' + estado.geo.lng.toFixed(5) +
                 (estado.geo.precision ? ' (±' + estado.geo.precision + ' m)' : ''));
            espacio(6); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.setTextColor(cM[0], cM[1], cM[2]);
            doc.textWithLink('Ver ubicación en Google Maps', mx + 42, y, { url: url }); y += 6;
        }
        y += 2;

        titulo('2 · Calidad de agua');
        window.Agua.calcular(estado.agua);
        var colA = colorSem(estado.agua.semaforo);
        doc.setFillColor(colA[0], colA[1], colA[2]); doc.circle(mx + 3, y - 1, 3, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]);
        doc.text(rotuloAgua(estado.agua.semaforo), mx + 9, y); y += 6;
        var ppmTxt = (estado.agua.ppm.estado === 'sin_medir' || estado.agua.ppm.valor == null) ? 'sin medir' : estado.agua.ppm.valor;
        dato('PPM post-filtrado', ppmTxt);
        dato('Filtro / Ablandador / Ósmosis', estado.agua.filtro + '  ·  ' + estado.agua.ablandador + '  ·  ' + estado.agua.osmosis);
        espacio(10); doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
        parrafo('Motivo: ' + estado.agua.porQue, 8.5);
        if (String(estado.agua.detalle || '').trim()) dato('Instalación hídrica', estado.agua.detalle);
        y += 2;

        titulo('3 · Observaciones iniciales (arribo)');
        parrafo(estado.obsPrevias || 'Sin observaciones.', 9); y += 3;

        var totalGastos = 0;
        (estado.equipos || []).forEach(function (eq, i) {
            titulo('4.' + (i + 1) + ' · Equipo ' + eq.mod + (eq.sn ? '  (SN: ' + eq.sn + ')' : '') + (eq.shots ? '  ·  Shoots: ' + eq.shots : ''));
            var sCol = eq.est.indexOf('FUERA') !== -1 ? colorSem('rojo') : (eq.est.indexOf('OBS') !== -1 ? colorSem('amarillo') : colorSem('verde'));
            doc.setFillColor(sCol[0], sCol[1], sCol[2]); doc.circle(mx + 3, y - 1, 2.5, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]);
            doc.text('Estado: ' + eq.est, mx + 9, y); y += 6;
            if (String(eq.diag || '').trim()) { espacio(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]); doc.text('Diagnóstico:', mx, y); y += 4.5; parrafo(eq.diag, 9); }
            if (String(eq.det || '').trim()) { espacio(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]); doc.text('Trabajos realizados:', mx, y); y += 4.5; parrafo(eq.det, 9); }
            if (eq.hL != null) dato('Higiene', 'Lanza vapor ' + eq.hL + ' · Tolvas ' + eq.hT + ' · Circuito leche ' + eq.hLe + ' · General ' + eq.hG);
            if (eq.sP != null) dato('Stock insumos', 'Pastillas ' + eq.sP + ' · Líquido ' + eq.sL + ' · Sal ' + eq.sS);
            dato('Pedido de repuestos', eq.repN || 'Ninguno');
            var g = parseFloat(eq.gasF || '0') || 0; totalGastos += g;
            dato('Gastos ferretería/insumos', '$' + g.toFixed(2) + ' ARS');
            y += 2;
        });

        /* ---------- Registro fotográfico ---------- */
        if (estado.fotos && estado.fotos.length) {
            titulo('5 · Registro fotográfico');
            var anchoMm = (W - mx * 2 - 6) / 2; var xs = [mx, mx + anchoMm + 6];
            for (var i = 0; i < estado.fotos.length; i += 2) {
                var fila = estado.fotos.slice(i, i + 2);
                var alturas = fila.map(function (f) { var ar = (f.w && f.h) ? (f.h / f.w) : 0.75; return Math.min(anchoMm * ar, 80); });
                var altoMax = Math.max.apply(null, alturas);
                espacio(altoMax + 3);
                fila.forEach(function (f, j) {
                    var du = bin.fotos[f.id]; if (!du) return;
                    try { doc.addImage(du, 'JPEG', xs[j], y, anchoMm, alturas[j]); } catch (e) {}
                });
                y += altoMax + 3;
            }
        }

        titulo('6 · Recomendaciones finales');
        parrafo(estado.obsFinales || 'Sin recomendaciones.', 9); y += 4;

        /* ---------- Firmas ---------- */
        espacio(48);
        var fw = window.CONFIG.firmas.anchoMm, fh = window.CONFIG.firmas.altoMm;
        var y0 = y, x1 = mx, x2 = W / 2 + 4;
        if (bin.firmaT) { try { doc.addImage(bin.firmaT, 'PNG', x1, y0, fw, fh); } catch (e) {} }
        if (bin.firmaE) { try { doc.addImage(bin.firmaE, 'PNG', x2, y0, fw, fh); } catch (e) {} }
        var yl = y0 + fh + 2;
        doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3);
        doc.line(x1, yl, x1 + fw, yl); doc.line(x2, yl, x2 + fw, yl);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(cLabel[0], cLabel[1], cLabel[2]);
        doc.text('FIRMA TÉCNICO', x1, yl + 4); doc.text('FIRMA ENCARGADO', x2, yl + 4);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        doc.text(estado.tecnico || '', x1, yl + 9);
        doc.text(estado.encargado || '', x2, yl + 9);

        /* ---------- Resumen para gerencia ---------- */
        doc.addPage(); pag++;
        if (bin.logo) { try { doc.addImage(bin.logo, 'PNG', mx, 8, 14, 14); } catch (e) { logoCirculo(); } } else logoCirculo();
        doc.setFont('helvetica', 'bold'); doc.setTextColor(cTinta[0], cTinta[1], cTinta[2]); doc.setFontSize(13);
        doc.text('RESUMEN DE ESTADO PARA GERENCIA', W / 2 + 6, 17, { align: 'center' });
        doc.setFillColor(cM[0], cM[1], cM[2]); doc.rect(mx, 26, W - mx * 2, 9, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(10);
        doc.text((L.n || 'SIN LOCAL') + '   ·   ' + (estado.fecha || fechaLargaCorta()), W / 2, 31.8, { align: 'center' });
        y = 42;
        doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('DATOS DE CONTROL', mx, y); y += 5;
        doc.setFont('helvetica', 'normal');
        doc.text('Ticket: ' + (estado.ticket || 'S/D') + '   ·   Prioridad: ' + (estado.prioridad || 'S/D') +
                 '   ·   Técnico: ' + (estado.tecnico || 'S/D') + (estado.codTec ? ' (' + estado.codTec + ')' : ''), mx, y); y += 4.5;
        doc.text('Código: ' + (estado.codigo || 'S/D') + '   ·   Labor: ' + (estado.labor || '0') + ' hs   ·   Traslado: ' + (estado.traslado || '0') + ' hs', mx, y);
        if (L.dir) { y += 4.5; doc.text('Dirección: ' + [L.dir, L.cd, L.pr].filter(Boolean).join(', '), mx, y); }
        if (L.rs) { y += 4.5; doc.text('Razón social: ' + L.rs, mx, y); }
        var respons = [];
        if (L.sup) respons.push('Supervisor: ' + L.sup);
        if (L.reg) respons.push('Regional: ' + L.reg);
        if (L.co) respons.push('Coordinador: ' + L.co);
        if (respons.length) {
            y += 4.5;
            var rt = doc.splitTextToSize(respons.join('   ·   '), W - mx * 2);
            doc.text(rt, mx, y); y += (rt.length - 1) * 4.5;
        }
        y += 7;

        doc.setFont('helvetica', 'bold'); doc.text('ESTADO DE AGUA', mx, y);
        doc.setFillColor(colA[0], colA[1], colA[2]); doc.circle(mx + 33, y - 1, 2.5, 'F');
        doc.text(rotuloAgua(estado.agua.semaforo) + '  (PPM ' + ppmTxt + ')', mx + 38, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        var pq = doc.splitTextToSize(estado.agua.porQue, W - mx * 2); doc.text(pq, mx, y); y += pq.length * 4 + 4;

        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('ACCIONES POR EQUIPO', mx, y); y += 6;
        (estado.equipos || []).forEach(function (eq) {
            espacio(12);
            var c = eq.est.indexOf('FUERA') !== -1 ? colorSem('rojo') : (eq.est.indexOf('OBS') !== -1 ? colorSem('amarillo') : colorSem('verde'));
            doc.setFillColor(c[0], c[1], c[2]); doc.circle(mx + 3, y - 1, 2, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
            var linea = eq.mod + ': ' + eq.est;
            doc.text(doc.splitTextToSize(linea, W - mx * 2 - 10), mx + 8, y); y += 5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
            var extras = [];
            if (eq.repN) extras.push('Repuestos: ' + eq.repN);
            if (parseFloat(eq.gasF || '0') > 0) extras.push('Gastos: $' + eq.gasF);
            if (extras.length) { doc.text(doc.splitTextToSize(extras.join('  ·  '), W - mx * 2 - 10), mx + 8, y); y += extras.join(' ').length > 60 ? 8 : 5; }
        });
        if (totalGastos > 0) {
            espacio(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.text('TOTAL GASTOS DE LA INTERVENCIÓN: $' + totalGastos.toFixed(2) + ' ARS', mx, y); y += 8;
        }
        if (estado.geo && estado.geo.lat != null) {
            espacio(8); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(cM[0], cM[1], cM[2]);
            doc.textWithLink('Ver ubicación en Google Maps', mx, y, { url: 'https://www.google.com/maps?q=' + estado.geo.lat + ',' + estado.geo.lng });
            y += 6;
        }
        pie();
        return doc;
    }

    /* Genera el informe completo. Devuelve Promise<{doc, nombre}> */
    function generar(estado) {
        if (!window.jspdf || !window.jspdf.jsPDF) return Promise.reject(new Error('No se pudo cargar la librería de PDF'));
        return cargarTodo(estado).then(function (bin) {
            var doc = construir(estado, bin);
            var L = estado.local || {};
            var base = (L.t || L.s || 'Rep').replace(/[^A-Za-z0-9]/g, '');
            var nombre = 'MTZ_' + base + '_' + (estado.fecha || new Date().toISOString().slice(0, 10)) + '.pdf';
            return { doc: doc, nombre: nombre };
        });
    }
    return { generar: generar };
})();
