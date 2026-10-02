/* Almacen — puerta única a persistencia (port de js/storage.js de Auditoría Técnica).
   Texto: localStorage. Binarios (fotos, firmas): IndexedDB como Blob, NUNCA base64
   en localStorage (evita agotar la cuota de ~5MB con 8 fotos).
   Si algo falla, degrada a memoria y la app sigue funcionando (con aviso). */
window.Almacen = (function () {
    'use strict';
    var CFG = window.CONFIG.almacenamiento;
    var estado = { textoPersistente: false, binarioPersistente: false, motivoTexto: '', motivoBinario: '', escrituras: 0, ultimaEscritura: null };
    var memT = {};

    var lsOk = (function () {
        try { var k = '__mtz__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
        catch (e) { estado.motivoTexto = 'localStorage no disponible'; return false; }
    })();
    estado.textoPersistente = lsOk; if (lsOk) estado.motivoTexto = 'localStorage';

    function escT(k, s) {
        if (lsOk) { try { localStorage.setItem(k, s); return true; }
            catch (e) { estado.textoPersistente = false; estado.motivoTexto = 'Cuota de localStorage agotada'; memT[k] = s; return false; } }
        memT[k] = s; return false;
    }
    function leeT(k) {
        if (lsOk) { try { var v = localStorage.getItem(k); if (v !== null) return v; } catch (e) {} }
        return Object.prototype.hasOwnProperty.call(memT, k) ? memT[k] : null;
    }
    function borT(k) { if (lsOk) { try { localStorage.removeItem(k); } catch (e) {} } delete memT[k]; }

    function guardar(k, o) {
        var s; try { s = JSON.stringify(o); } catch (e) { console.error('serializar', e); return false; }
        var ok = escT(k, s); estado.escrituras++; estado.ultimaEscritura = new Date().toISOString(); return ok;
    }
    function leer(k) {
        var s = leeT(k); if (s === null) return null;
        try { return JSON.parse(s); } catch (e) { borT(k); return null; }
    }
    function borrar(k) { borT(k); }

    /* ---------- Binarios en IndexedDB ---------- */
    var memB = {}, pDb = null;
    function abrir() {
        if (pDb) return pDb;
        pDb = new Promise(function (res) {
            if (!window.indexedDB) { estado.motivoBinario = 'IndexedDB no disponible'; res(null); return; }
            var rq; try { rq = indexedDB.open(CFG.dbNombre, CFG.dbVersion); }
            catch (e) { estado.motivoBinario = 'IndexedDB bloqueada'; res(null); return; }
            rq.onupgradeneeded = function () {
                var db = rq.result;
                if (!db.objectStoreNames.contains(CFG.dbStore)) db.createObjectStore(CFG.dbStore, { keyPath: 'id' });
            };
            rq.onsuccess = function () { estado.binarioPersistente = true; estado.motivoBinario = 'IndexedDB'; res(rq.result); };
            rq.onerror = function () { estado.motivoBinario = 'No se pudo abrir IndexedDB'; res(null); };
            rq.onblocked = function () { estado.motivoBinario = 'IndexedDB bloqueada por otra pestaña'; res(null); };
        });
        return pDb;
    }
    function conStore(modo, fn) {
        return abrir().then(function (db) {
            if (!db) return fn(null);
            return new Promise(function (res, rej) {
                var tx = db.transaction(CFG.dbStore, modo); var st = tx.objectStore(CFG.dbStore);
                var r; try { r = fn(st); } catch (e) { rej(e); return; }
                tx.oncomplete = function () { res(r); };
                tx.onerror = function () { rej(tx.error); };
                tx.onabort = function () { rej(tx.error); };
            });
        });
    }
    function req(rq) {
        return new Promise(function (res, rej) {
            rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
        });
    }
    function guardarBinario(id, blob, meta) {
        var reg = { id: id, blob: blob, meta: meta || {} };
        return conStore('readwrite', function (st) { if (!st) { memB[id] = reg; return false; } st.put(reg); return true; })
            .catch(function () { memB[id] = reg; estado.binarioPersistente = false; return false; });
    }
    function leerBinario(id) {
        return conStore('readonly', function (st) { if (!st) return memB[id] || null; return req(st.get(id)); })
            .then(function (r) { return r || memB[id] || null; }).catch(function () { return memB[id] || null; });
    }
    function borrarBinario(id) {
        delete memB[id];
        return conStore('readwrite', function (st) { if (st) st.delete(id); return true; }).catch(function () { return false; });
    }
    function listar() {
        return conStore('readonly', function (st) { if (!st) return Object.keys(memB); return req(st.getAllKeys()); })
            .then(function (k) { return k || []; }).catch(function () { return Object.keys(memB); });
    }
    // Elimina blobs que no están referenciados por el borrador vivo (huérfanos de informes cerrados)
    function limpiarHuerfanos(vivos) {
        var v = {}; (vivos || []).forEach(function (id) { v[id] = true; });
        return listar().then(function (todos) {
            var m = todos.filter(function (id) { return !v[id]; });
            return Promise.all(m.map(borrarBinario)).then(function () { return m.length; });
        });
    }
    function espacio() {
        if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
        return navigator.storage.estimate().then(function (e) { return { usado: e.usage || 0, disponible: e.quota || 0 }; }).catch(function () { return null; });
    }
    return {
        estado: estado, guardar: guardar, leer: leer, borrar: borrar,
        guardarBinario: guardarBinario, leerBinario: leerBinario, borrarBinario: borrarBinario,
        listarBinarios: listar, limpiarHuerfanos: limpiarHuerfanos, espacio: espacio, iniciar: abrir
    };
})();
