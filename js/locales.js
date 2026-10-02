/* Locales — buscador y códigos sobre la base de locales del Generador (js/db.js).
   La base se genera desde el MTZ Locales Master Brain (SABANA_V6.csv) solo con los
   locales que tienen ID_GENERADOR; ver herramientas/generar_db_desde_master_brain.py */
window.Locales = (function () {
    'use strict';
    var DATA = (window.FRANQUICIAS || []).slice();
    var BASE = Date.UTC(2026, 0, 1);

    function sinAcentos(s) {
        s = String(s || '').toUpperCase();
        return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
    }
    // índice de búsqueda: nombre + ambas siglas + alias + provincia + ciudad, sin acentos
    DATA.forEach(function (l) {
        l._idx = sinAcentos([l.n, l.s, l.t, (l.al || []).join(' '), l.pr, l.cd].join(' '));
    });

    function buscar(q, limite) {
        q = sinAcentos((q || '').trim());
        if (!q) return [];
        var res = [], exactas = [], resto = DATA;
        if (limite == null) limite = 12;
        // las coincidencias por prefijo del nombre van primero
        resto.forEach(function (l) {
            if (l._idx.indexOf(q) !== -1) {
                if (sinAcentos(l.n).indexOf(q) === 0 || sinAcentos(l.s) === q || sinAcentos(l.t) === q) exactas.push(l);
                else res.push(l);
            }
        });
        return exactas.concat(res).slice(0, limite);
    }
    function porId(id) {
        id = parseInt(id, 10);
        return DATA.find(function (l) { return l.id === id; }) || null;
    }
    function porNombre(nombre) {
        var q = sinAcentos((nombre || '').trim());
        if (!q) return null;
        return DATA.find(function (l) { return sinAcentos(l.n) === q; }) || null;
    }
    // Carga manual para franquicias fuera del padrón (las que aún no tienen ID_Generador)
    function manual(nombre, siglaSis, siglaTic, idManual, provincia) {
        return {
            n: (nombre || '').toUpperCase().trim(), s: (siglaSis || '').toUpperCase().trim(),
            t: (siglaTic || '').toUpperCase().trim(), id: parseInt(idManual, 10) || 999,
            dir: '', cd: '', pr: (provincia || '').toUpperCase().trim(), rs: '',
            tec: '', sup: '', reg: '', em: '', manual: true
        };
    }
    function normalizarCodigoNombre(n) {
        return sinAcentos(n).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    function minutosBase() { return Math.floor((Date.now() - BASE) / 60000); }
    // Código único MF-<minutos desde 2026-01-01>-<idGenerador de 3 dígitos>
    function nuevoCodigo(idLocal) {
        return 'MF-' + String(minutosBase()).padStart(6, '0') + '-' + String(idLocal).padStart(3, '0');
    }
    // Reemplaza el tramo final de un código existente conservando su timestamp (cambio de local)
    function actualizarCodigo(codigoActual, idLocal) {
        if (codigoActual && codigoActual.indexOf('MF-') === 0) {
            var partes = codigoActual.split('-');
            if (partes.length === 3) return 'MF-' + partes[1] + '-' + String(idLocal).padStart(3, '0');
        }
        return nuevoCodigo(idLocal);
    }
    return {
        total: DATA.length, buscar: buscar, porId: porId, porNombre: porNombre,
        manual: manual, nuevoCodigo: nuevoCodigo, actualizarCodigo: actualizarCodigo,
        nombreNormalizado: normalizarCodigoNombre
    };
})();
