/* App — cableado principal del Generador V13.
   Estado en memoria + borrador persistente (localStorage vía Almacen),
   fotos/firmas como Blob en IndexedDB, buscador de franquicias, PPM de 5 estados,
   geolocalización opcional, estampado de fotos y actualización PWA sin reinstalar. */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var CFG = window.CONFIG;

    /* ============ Estado vivo ============ */
    var estado = {
        tipo: 'presencial', local: null, geo: null, fotos: [], agua: window.Agua.inicial(),
        avisoQuota: false
    };
    var padT = null, padE = null;

    function escapeHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function z(n) { return (n < 10 ? '0' : '') + n; }
    function fechaLocal() { var d = new Date(); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
    function nuevoIdFoto() { return 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }

    /* ============ Buscador de franquicia ============ */
    function pintarResultados(q) {
        var cont = $('busqResultados');
        cont.innerHTML = '';
        var res = window.Locales.buscar(q, 12);
        if (!q || !q.trim()) return;
        if (!res.length) {
            var p = document.createElement('p'); p.className = 'nota';
            p.textContent = 'Ninguna franquicia coincide con "' + q.toUpperCase() + '".';
            cont.appendChild(p);
            var mb = document.createElement('button'); mb.type = 'button'; mb.className = 'btn btn--bloque';
            mb.textContent = 'Cargar local manualmente';
            mb.addEventListener('click', abrirManual);
            cont.appendChild(mb);
            return;
        }
        res.forEach(function (l) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'busq-opcion';
            var sub = [l.s !== l.t ? ('sis ' + l.s + ' / tic ' + l.t) : ('sigla ' + l.s), l.pr].filter(Boolean).join(' · ');
            b.innerHTML = '<span class="n">' + escapeHtml(l.n) + '</span><span class="d">' + escapeHtml(sub) + '</span>';
            b.addEventListener('click', function () { seleccionar(l); });
            cont.appendChild(b);
        });
    }
    function seleccionar(l) {
        estado.local = l;
        $('localBusqueda').value = '';
        $('busqResultados').innerHTML = '';
        // Ya no se autocompleta el técnico desde el padrón: los técnicos rotan entre
        // locales y esa asignación resultaba engañosa. Ahora cada uno se declara con
        // su código personal de 4 dígitos (campo Código de Técnico).
        $('codigo_informe').value = window.Locales.actualizarCodigo($('codigo_informe').value, l.id);
        pintarFicha();
        guardarBorrador();
    }
    function pintarFicha() {
        var f = $('fichaLocal'), l = estado.local;
        if (!l) { f.classList.add('oculto'); return; }
        f.classList.remove('oculto');
        var dir = [l.dir, l.cd, l.pr].filter(Boolean).join(' — ');
        var badges = (l.pend ? '<span class="chip-badge chip-badge--aviso">DATOS POR ASIGNAR</span>' : '');
        f.innerHTML = '<b>' + escapeHtml(l.n) + '</b> ' + badges +
            (l.s || l.t ? 'Sistema: ' + escapeHtml(l.s || '—') + ' · Ticket: ' + escapeHtml(l.t || '—') + '<br>' : '') +
            (dir ? escapeHtml(dir) + '<br>' : '') + (l.rs ? escapeHtml(l.rs) + '<br>' : '') +
            (l.sup ? 'Supervisor: ' + escapeHtml(l.sup) + '<br>' : '') +
            (l.co ? 'Coordinador: ' + escapeHtml(l.co) : '');
        var cambiar = document.createElement('button');
        cambiar.type = 'button'; cambiar.className = 'btn btn-mini'; cambiar.style.marginTop = '8px';
        cambiar.textContent = 'Cambiar local';
        cambiar.addEventListener('click', function () { estado.local = null; $('codigo_informe').value = ''; pintarFicha(); guardarBorrador(); });
        f.appendChild(cambiar);
    }

    /* ---- Carga manual (franquicias fuera del padrón) ---- */
    function abrirManual() {
        $('mNombre').value = $('localBusqueda').value.toUpperCase();
        $('mSiglaSis').value = ''; $('mSiglaTic').value = ''; $('mId').value = ''; $('mProv').value = '';
        $('mError').textContent = '';
        mostrarModal('modalManual');
    }
    function confirmarManual() {
        var n = $('mNombre').value.trim();
        var id = parseInt($('mId').value, 10);
        if (!n) { $('mError').textContent = 'Falta el nombre del local.'; return; }
        if (!(id >= 1 && id <= 999)) { $('mError').textContent = 'ID de 1 a 999 (el del Generador, 3 dígitos).'; return; }
        var l = window.Locales.manual(n, $('mSiglaSis').value, $('mSiglaTic').value, id, $('mProv').value);
        ocultarModal('modalManual');
        seleccionar(l);
    }

    /* ============ Agua ============ */
    function leerAguaDOM() {
        var a = estado.agua;
        var pend = $('ppm_pendiente').checked;
        a.ppm.estado = pend ? 'sin_medir' : 'medido';
        var raw = ($('ppm').value || '').trim();
        var n = parseInt(raw, 10);
        a.ppm.valor = (!pend && raw !== '' && isFinite(n)) ? n : null;
        a.filtro = $('f_filtrado').value; a.ablandador = $('f_ablandador').value; a.osmosis = $('f_osmosis').value;
        a.detalle = $('obsAgua').value;
        return a;
    }
    function pintarAgua() {
        var a = window.Agua.calcular(leerAguaDOM());
        var chip = $('aguaChip');
        chip.className = 'semaforo-chip chip--' + a.nivel;
        chip.innerHTML = '<span class="chip-led"></span>' + window.Agua.rotulo(a.nivel);
        $('aguaPorQue').textContent = a.porQue;
        evaluarLed();
    }
    function togglePpm() {
        var pend = $('ppm_pendiente').checked;
        $('ppm').disabled = pend;
        if (pend) $('ppm').value = '';
        pintarAgua(); guardarBorrador();
    }

    /* ============ LED global ============ */
    function evaluarLed() {
        var led = $('statusLed');
        var nivel = window.Agua.nivelLed(estado.agua.semaforo);
        var mS = 0;
        document.querySelectorAll('.eq-est').forEach(function (s) {
            if (s.value === 'FUERA DE SERVICIO') mS = 2;
            else if (s.value === 'OPERATIVA CON OBS.' && mS < 2) mS = 1;
        });
        if (mS === 2) nivel = 'rojo';
        else if (mS === 1 && nivel === 'verde') nivel = 'amarillo';
        led.className = nivel === 'gris' ? '' : nivel;
    }

    /* ============ Equipos ============ */
    function addEquipo(v) {
        v = v || {};
        var div = document.createElement('div'); div.className = 'card equipo-item';
        var optsMod = CFG.equipos.map(function (m) { return '<option value="' + m + '"' + (v.mod === m ? ' selected' : '') + '>' + m.toUpperCase() + '</option>'; }).join('');
        var selH = function (cls, val, def) {
            return '<select class="' + cls + '"><option value="OP"' + ((val || def) === 'OP' ? ' selected' : '') + '>OP</option><option value="SUCIO"' + (val === 'SUCIO' ? ' selected' : '') + '>SUCIO</option></select>';
        };
        var selS = function (cls, val) {
            return '<select class="' + cls + '"><option value="STOCK"' + ((val || 'STOCK') === 'STOCK' ? ' selected' : '') + '>OK</option><option value="CRÍTICO"' + (val === 'CRÍTICO' ? ' selected' : '') + '>FALTA</option></select>';
        };
        div.innerHTML =
            '<div class="equipo-cab">' +
            '<select class="eq-mod">' + optsMod + '</select>' +
            '<div class="equipo-campos">' +
            '<div><label>S/N</label><input type="text" class="eq-sn" value="' + escapeHtml(v.sn || '') + '"></div>' +
            '<div class="solo-cafetera"><label>Shoots</label><input type="number" class="eq-shots shots" value="' + escapeHtml(v.shots || '') + '"></div>' +
            '<button type="button" class="eq-x" title="Quitar equipo">&times;</button>' +
            '</div></div>' +
            '<textarea placeholder="DIAGNÓSTICO..." class="eq-diag" rows="2">' + escapeHtml(v.diag || '') + '</textarea>' +
            '<textarea placeholder="TRABAJOS REALIZADOS..." class="eq-det" rows="2">' + escapeHtml(v.det || '') + '</textarea>' +
            '<div class="tareas solo-cafetera">' + CFG.tareas.map(function (t) { return '<span class="tag-btn">' + t + '</span>'; }).join('') + '</div>' +
            '<div class="sub-bloque higiene solo-cafetera"><h4>Higiene equipo</h4><div class="grid3">' +
            '<div><label>Lanza de vapor</label>' + selH('h-lanc', v.hL, 'OP') + '</div>' +
            '<div><label>Tolvas café</label>' + selH('h-tolv', v.hT, 'OP') + '</div>' +
            '<div><label>Circuito leche</label>' + selH('h-leche', v.hLe, 'OP') + '</div>' +
            '<div><label>Limpieza general</label>' + selH('h-gral', v.hG, 'OP') + '</div>' +
            '</div></div>' +
            '<div class="sub-bloque stock solo-cafetera"><h4>Stock insumos</h4><div class="grid3">' +
            '<div><label>Pastillas</label>' + selS('s-past', v.sP) + '</div>' +
            '<div><label>Líquido</label>' + selS('s-liq', v.sL) + '</div>' +
            '<div><label>Sal</label>' + selS('s-sal', v.sS) + '</div>' +
            '</div></div>' +
            '<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">' +
            '<input type="text" placeholder="PEDIDO REPUESTOS" class="eq-rep-n" value="' + escapeHtml(v.repN || '') + '">' +
            '<input type="number" placeholder="GASTOS FERRETERÍA / INSUMOS (ARS)" class="eq-gas-f" min="0" step="any" value="' + escapeHtml(v.gasF || '') + '">' +
            '<select class="eq-est">' +
            '<option value="OPERATIVA"' + (v.est === 'OPERATIVA' || !v.est ? ' selected' : '') + '>OPERATIVA</option>' +
            '<option value="OPERATIVA CON OBS."' + (v.est === 'OPERATIVA CON OBS.' ? ' selected' : '') + '>OPERATIVA CON OBS.</option>' +
            '<option value="FUERA DE SERVICIO"' + (v.est === 'FUERA DE SERVICIO' ? ' selected' : '') + '>FUERA DE SERVICIO</option>' +
            '</select></div>';
        if (v.mod) div.querySelector('.eq-mod').value = v.mod;
        // "Otros" = equipo no cafetera: se ocultan las secciones exclusivas de cafetera
        // (tareas, higiene, stock, shoots) y el técnico completa solo diagnóstico y trabajos.
        function refrescarModEquipo() {
            var esOtro = div.querySelector('.eq-mod').value === 'Otros';
            div.querySelectorAll('.solo-cafetera').forEach(function (el) { el.style.display = esOtro ? 'none' : ''; });
            div.querySelector('.eq-det').placeholder = esOtro ? 'DETALLE DE LO REVISADO / REALIZADO...' : 'TRABAJOS REALIZADOS...';
        }
        div.querySelector('.eq-mod').addEventListener('change', refrescarModEquipo);
        refrescarModEquipo();
        div.querySelector('.eq-x').addEventListener('click', function () {
            if (confirm('¿Quitar este equipo del informe?')) { div.remove(); evaluarLed(); guardarBorrador(); }
        });
        div.querySelectorAll('.tag-btn').forEach(function (tag) {
            tag.addEventListener('click', function () {
                var a = div.querySelector('.eq-det');
                a.value += (a.value ? ', ' : '') + tag.textContent;
                a.dispatchEvent(new Event('input'));
            });
        });
        div.addEventListener('input', guardarBorrador);
        div.addEventListener('change', function () { pintarAgua(); });
        $('equiposGrid').appendChild(div);
    }

    function leerEquiposDOM() {
        return Array.prototype.map.call(document.querySelectorAll('.equipo-item'), function (eq) {
            var q = function (s) { return eq.querySelector(s); };
            var esOtro = q('.eq-mod').value === 'Otros';
            return {
                mod: q('.eq-mod').value, sn: q('.eq-sn').value, shots: esOtro ? '' : q('.eq-shots').value,
                diag: q('.eq-diag').value, det: q('.eq-det').value,
                hL: esOtro ? null : q('.h-lanc').value, hT: esOtro ? null : q('.h-tolv').value,
                hLe: esOtro ? null : q('.h-leche').value, hG: esOtro ? null : q('.h-gral').value,
                sP: esOtro ? null : q('.s-past').value, sL: esOtro ? null : q('.s-liq').value, sS: esOtro ? null : q('.s-sal').value,
                repN: q('.eq-rep-n').value, gasF: q('.eq-gas-f').value, est: q('.eq-est').value
            };
        });
    }

    /* ============ Fotos (Blob + estampado fecha/hora/GPS) ============ */
    function procesarFoto(file) {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
            var lado = Math.min(CFG.fotos.maxLadoLargo, Math.max(bmp.width, bmp.height));
            var esc = lado / Math.max(bmp.width, bmp.height);
            var w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.drawImage(bmp, 0, 0, w, h);
            if (bmp.close) bmp.close();
            if (CFG.fotos.estampar) {
                var d = new Date();
                var txt = z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
                if (estado.geo && estado.geo.lat != null) txt += '  ·  ' + estado.geo.lat.toFixed(5) + ',' + estado.geo.lng.toFixed(5);
                var fpx = Math.max(18, Math.round(h * 0.035));
                ctx.font = 'bold ' + fpx + 'px sans-serif';
                ctx.textBaseline = 'bottom';
                ctx.lineWidth = Math.max(2, fpx / 8); ctx.strokeStyle = 'rgba(0,0,0,.75)';
                ctx.strokeText(txt, fpx * .6, h - fpx * .6);
                ctx.fillStyle = '#fff'; ctx.fillText(txt, fpx * .6, h - fpx * .6);
            }
            return new Promise(function (res) {
                c.toBlob(function (blob) { res({ blob: blob, w: w, h: h }); }, 'image/jpeg', CFG.fotos.calidad);
            });
        });
    }
    function onFotoElegida(e) {
        var files = Array.from(e.target.files || []);
        if (!files.length) return;
        $('fotoHelp').textContent = 'Procesando…';
        var cadena = Promise.resolve();
        files.forEach(function (f) {
            cadena = cadena.then(function () {
                if (estado.fotos.length >= CFG.fotos.maxPorInforme) {
                    $('fotoHelp').textContent = 'Límite de ' + CFG.fotos.maxPorInforme + ' fotos alcanzado.';
                    return;
                }
                return procesarFoto(f).then(function (r) {
                    var id = nuevoIdFoto();
                    return window.Almacen.guardarBinario(id, r.blob, { w: r.w, h: r.h }).then(function () {
                        estado.fotos.push({ id: id, w: r.w, h: r.h });
                    });
                }).catch(function (err) { console.error('foto', err); });
            });
        });
        cadena.then(function () {
            renderFotos();
            $('fotoHelp').textContent = estado.fotos.length + '/' + CFG.fotos.maxPorInforme + ' fotos';
            e.target.value = '';
            guardarBorrador();
        });
    }
    function renderFotos() {
        var prev = $('fotoPreview'); prev.innerHTML = '';
        estado.fotos.forEach(function (f) {
            var d = document.createElement('div'); d.className = 'foto-mini';
            var img = document.createElement('img'); img.alt = 'foto';
            window.Almacen.leerBinario(f.id).then(function (reg) {
                if (reg && reg.blob) { var u = URL.createObjectURL(reg.blob); img.onload = function () { URL.revokeObjectURL(u); }; img.src = u; }
            });
            var q = document.createElement('button'); q.type = 'button'; q.className = 'foto-quitar'; q.textContent = '×';
            q.addEventListener('click', function () {
                window.Almacen.borrarBinario(f.id).then(function () {
                    estado.fotos = estado.fotos.filter(function (x) { return x.id !== f.id; });
                    renderFotos(); $('fotoHelp').textContent = estado.fotos.length + '/' + CFG.fotos.maxPorInforme + ' fotos';
                    guardarBorrador();
                });
            });
            d.appendChild(img); d.appendChild(q); prev.appendChild(d);
        });
    }

    /* ============ Geolocalización (opcional, no frena nada) ============ */
    function marcarUbicacion() {
        if (!navigator.geolocation) { $('geoLabel').textContent = 'Este dispositivo no permite geolocalización.'; return; }
        var btn = $('btnGeo'); btn.disabled = true; btn.textContent = 'Obteniendo…';
        navigator.geolocation.getCurrentPosition(function (pos) {
            estado.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: Math.round(pos.coords.accuracy || 0), cuando: new Date().toISOString() };
            btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> Ubicación marcada';
            $('geoLabel').textContent = estado.geo.lat.toFixed(5) + ', ' + estado.geo.lng.toFixed(5) + ' (±' + estado.geo.precision + ' m) — sale en el PDF';
            guardarBorrador();
        }, function (err) {
            btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-pin"/></svg> Marcar ubicación';
            $('geoLabel').textContent = 'No se pudo marcar (' + (err && err.message ? err.message : 'sin permiso') + '). El informe sigue igual.';
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }

    /* ============ Firmas ============ */
    var locks = { T: false, E: false };
    function toggleLock(t) {
        locks[t] = !locks[t];
        var pad = t === 'T' ? padT : padE;
        var box = $('box' + t), btn = box.querySelector('.lock-btn');
        if (locks[t]) { pad.off(); btn.innerHTML = '<svg class="ic"><use href="#ic-lock"/></svg>'; box.classList.add('locked'); persistirFirma(t); }
        else { pad.on(); btn.innerHTML = '<svg class="ic"><use href="#ic-unlock"/></svg>'; box.classList.remove('locked'); }
    }
    // Cierre inicial de candados SIN persistir (las firmas recién restauradas son asíncronas:
    // persistir acá borraría el blob antes de que el pad termine de dibujarse)
    function cerrarCandadoInicial(t) {
        locks[t] = true;
        var pad = t === 'T' ? padT : padE;
        var box = $('box' + t), btn = box.querySelector('.lock-btn');
        if (pad) { pad.off(); btn.innerHTML = '<svg class="ic"><use href="#ic-lock"/></svg>'; box.classList.add('locked'); }
    }
    function clearPad(t) {
        if (locks[t]) return;
        var pad = t === 'T' ? padT : padE;
        if (pad) { pad.clear(); persistirFirma(t); }
    }
    function persistirFirma(t) {
        var pad = t === 'T' ? padT : padE;
        if (!pad || pad.isEmpty()) { window.Almacen.borrarBinario('firma' + t); return Promise.resolve(); }
        return new Promise(function (res) {
            pad.toBlob(function (b) {
                if (!b) return res();
                window.Almacen.guardarBinario('firma' + t, b, { tipo: 'firma' }).then(res);
            });
        });
    }
    function restaurarFirmas() {
        return Promise.all(['T', 'E'].map(function (t) {
            return window.Almacen.leerBinario('firma' + t).then(function (reg) {
                if (!reg || !reg.blob) return null;
                return new Promise(function (res) {
                    var fr = new FileReader();
                    fr.onload = function () {
                        var url = fr.result;
                        if (t === 'T') padT.fromDataURL(url); else padE.fromDataURL(url);
                        res();
                    };
                    fr.readAsDataURL(reg.blob);
                });
            });
        }));
    }

    /* ============ Soporte Remoto (V13.11.0) ============ */
    function leerRemotoDOM() {
        return {
            desc: $('r_desc').value, nombre: $('r_nombre').value, apellido: $('r_apellido').value,
            canal: $('r_canal').value, canalOtro: $('r_canalOtro').value,
            caracter: $('r_caracter').value, coordinada: $('r_coordinada').value,
            hora: $('r_hora').value, duracion: $('r_duracion').value,
            equipo: $('r_equipo').value, diag: $('r_diag').value, resultado: $('r_resultado').value
        };
    }
    function refrescarCanal() {
        var otro = $('r_canal').value === 'Aviso por persona';
        $('boxRCanal').classList.toggle('oculto', !otro);
    }
    function aplicarTipo() {
        var remoto = estado.tipo === 'remoto';
        $('cuerpoRemoto').classList.toggle('oculto', !remoto);
        document.querySelectorAll('.solo-presencial').forEach(function (el) { el.classList.toggle('oculto', remoto); });
        refrescarCanal();
    }
    function montarCuerpoRemoto() {
        var sel = function (id, arr) {
            $(id).innerHTML = arr.map(function (o) {
                var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
                return '<option value="' + v + '">' + t + '</option>';
            }).join('');
        };
        sel('r_canal', CFG.remoto.canales);
        sel('r_caracter', CFG.remoto.caracteres);
        sel('r_coordinada', CFG.remoto.coordinadas);
        sel('r_equipo', [['', '-- EQUIPO AFECTADO --']].concat(CFG.equipos.map(function (e) { return [e, e.toUpperCase()]; })));
        $('r_duracion').innerHTML = '<option value="">-- DURACIÓN --</option>' + CFG.remoto.duraciones.map(function (h) {
            return '<option value="' + h + '">' + h + ' hs' + (h === 1 ? ' (base, aunque haya sido menos)' : '') + '</option>';
        }).join('');
        $('r_canal').addEventListener('change', refrescarCanal);
    }
    function pintarRemoto(rem) {
        if (!rem) return;
        $('r_desc').value = rem.desc || ''; $('r_nombre').value = rem.nombre || ''; $('r_apellido').value = rem.apellido || '';
        $('r_canal').value = rem.canal || ''; $('r_canalOtro').value = rem.canalOtro || '';
        $('r_caracter').value = rem.caracter || ''; $('r_coordinada').value = rem.coordinada || '';
        $('r_hora').value = rem.hora || ''; $('r_duracion').value = rem.duracion || '';
        $('r_equipo').value = rem.equipo || ''; $('r_diag').value = rem.diag || ''; $('r_resultado').value = rem.resultado || '';
    }

    /* ============ Borrador ============ */
    var tGuardado = null;
    function guardarBorrador() {
        clearTimeout(tGuardado);
        tGuardado = setTimeout(_guardarAhora, 250);
    }
    function _guardarAhora() {
        pintarAgua();
        var d = {
            v: 13,
            tipo: estado.tipo,
            rem: leerRemotoDOM(),
            c: {
                fe: $('fecha').value, tk: $('ticket').value, tec: $('tecnico').value,
                cdt: ($('codTec') ? $('codTec').value : ''),
                lab: $('labor').value, via: $('traslado').value, pr: $('prioridad').value,
                cod: $('codigo_informe').value, op: $('obsPrevias').value, of: $('obsFinales').value,
                enc: $('nombreEncargado').value
            },
            local: estado.local, geo: estado.geo, fotos: estado.fotos,
            agua: estado.agua, equipos: leerEquiposDOM()
        };
        var ok = window.Almacen.guardar(CFG.almacenamiento.claveBorrador, d);
        if (!ok && !estado.avisoQuota) {
            estado.avisoQuota = true;
            var av = $('avisoQuota'); av.classList.remove('oculto');
            av.textContent = 'El almacenamiento del navegador está lleno: el borrador se guarda solo en memoria. Generá el informe pronto.';
        } else if (ok) { estado.avisoQuota = false; $('avisoQuota').classList.add('oculto'); }
    }
    /* Feature en STANDBY (CFG.usarCodigosTecnicos, V13.9.0): el técnico se declaraba con
       su código personal de 4 dígitos (esquema de las auditorías de jefatura). Quedó
       apagada porque el Generador se unificó con la app principal (MTZ Técnico
       Franquicias), que hace el login y pasa la identidad por ?cod= (ver init). */
    var TEC_FIX = null; // técnico venido de la app principal; null = elección normal
    function montarCodigoTecnico() {
        $('campoTecnico').innerHTML = '<label>Código personal de Técnico <span style="color:var(--c-marca)">*</span></label>' +
            '<input type="text" id="codTec" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off" class="input-codtec">' +
            '<div id="tecResuelto" class="tec-resuelto"></div>' +
            '<input type="hidden" id="tecnico">';
        $('codTec').addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 4);
            resolverCodigoTec();
            guardarBorrador();
        });
        resolverCodigoTec();
    }

    function resolverCodigoTec() {
        if (!CFG.usarCodigosTecnicos) return;
        var c = $('codTec').value.trim();
        var box = $('tecResuelto');
        var nombre = CFG.codigosTecnicos[c];
        if (c.length === 4 && nombre) {
            $('tecnico').value = nombre;
            box.className = 'tec-resuelto ok';
            box.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> ' + escapeHtml(nombre);
        } else if (c.length === 4) {
            $('tecnico').value = '';
            box.className = 'tec-resuelto mal';
            box.textContent = 'Código inexistente. Verificá tu código personal de 4 dígitos.';
        } else {
            $('tecnico').value = '';
            box.className = 'tec-resuelto';
            box.textContent = c ? 'Completá los 4 dígitos.' : 'Ingresá tu código personal (el mismo de las auditorías).';
        }
    }

    function cargarBorrador() {
        var d = window.Almacen.leer(CFG.almacenamiento.claveBorrador);
        if (!d || d.v !== 13 || !d.c) return;
        estado.tipo = d.tipo || 'presencial';
        $('fecha').value = d.c.fe || ''; $('ticket').value = d.c.tk || '';
        if (!TEC_FIX && !CFG.usarCodigosTecnicos) $('tecnico').value = d.c.tec || ''; // con identidad fijada desde la app, el borrador no pisa al técnico
        // Con códigos activos el borrador NO puede inyectar el nombre sin código: solo
        // se restaura vía codTec (línea siguiente), que valida resolverCodigoTec.
        if (CFG.usarCodigosTecnicos && d.c.cdt) { $('codTec').value = d.c.cdt; resolverCodigoTec(); }
        $('labor').value = d.c.lab || ''; $('traslado').value = d.c.via || '';
        $('prioridad').value = d.c.pr || ''; $('codigo_informe').value = d.c.cod || '';
        $('obsPrevias').value = d.c.op || ''; $('obsFinales').value = d.c.of || ''; $('nombreEncargado').value = d.c.enc || '';
        estado.local = d.local || null; estado.geo = d.geo || null;
        if (estado.geo && estado.geo.lat != null) $('geoLabel').textContent = estado.geo.lat.toFixed(5) + ', ' + estado.geo.lng.toFixed(5);
        if (d.agua) {
            estado.agua = d.agua;
            $('ppm_pendiente').checked = d.agua.ppm.estado === 'sin_medir';
            $('ppm').value = d.agua.ppm.valor == null ? '' : d.agua.ppm.valor;
            $('ppm').disabled = $('ppm_pendiente').checked;
            $('f_filtrado').value = d.agua.filtro; $('f_ablandador').value = d.agua.ablandador;
            $('f_osmosis').value = d.agua.osmosis; $('obsAgua').value = d.agua.detalle || '';
        }
        pintarFicha();
        if (Array.isArray(d.fotos)) { estado.fotos = d.fotos.slice(0, CFG.fotos.maxPorInforme); renderFotos(); $('fotoHelp').textContent = estado.fotos.length + '/' + CFG.fotos.maxPorInforme + ' fotos'; }
        if (d.equipos && d.equipos.length) { $('equiposGrid').innerHTML = ''; d.equipos.forEach(function (e) { addEquipo(e); }); }
        if (d.rem) pintarRemoto(d.rem);
    }

    /* ============ Validaciones numéricas ============ */
    function soloDigitos(e) { if (['e', 'E', '+', '-', '.', ','].indexOf(e.key) !== -1) e.preventDefault(); }
    function limpiarDigitos(el) { if (el && el.value) el.value = el.value.replace(/[^0-9]/g, ''); }
    function pisoLabor(el, val) {
        var v = parseInt(val !== undefined ? val : el.value, 10);
        el.value = (isNaN(v) || v < CFG.labor.minimo) ? CFG.labor.minimo : v;
    }
    function defaultTraslado(el, val) {
        var v = parseInt(val !== undefined ? val : el.value, 10);
        el.value = isNaN(v) || v < 0 ? 0 : v;
    }

    /* ============ Modales ============ */
    function mostrarModal(id) { $(id).classList.remove('modal--oculto'); }
    function ocultarModal(id) { $(id).classList.add('modal--oculto'); }

    /* ============ Historial ============ */
    function registrarHistorial(est, nombre) {
        var h = window.Almacen.leer(CFG.almacenamiento.claveHistorial) || [];
        h.unshift({
            tipo: est.tipo, codigo: est.codigo, local: est.local ? est.local.n : 'SIN LOCAL', fecha: est.fecha,
            ticket: est.ticket, tecnico: est.tecnico, prioridad: est.prioridad,
            agua: est.agua.semaforo, equipos: (est.equipos || []).length, nombre: nombre,
            cuando: new Date().toISOString()
        });
        window.Almacen.guardar(CFG.almacenamiento.claveHistorial, h.slice(0, CFG.historial.maxItems));
    }

    /* ============ Generación del informe ============ */
    function leerEstadoCompleto() {
        var est = {
            tipo: estado.tipo,
            fecha: $('fecha').value, ticket: $('ticket').value, tecnico: $('tecnico').value,
            codTec: ($('codTec') ? $('codTec').value : ''),
            labor: $('labor').value, traslado: $('traslado').value, prioridad: $('prioridad').value,
            codigo: $('codigo_informe').value, obsPrevias: $('obsPrevias').value,
            obsFinales: $('obsFinales').value, encargado: $('nombreEncargado').value,
            local: estado.local, geo: estado.geo, fotos: estado.fotos.slice(),
            agua: estado.agua, equipos: leerEquiposDOM()
        };
        est.agua.detalle = $('obsAgua').value;
        if (estado.tipo === 'remoto') est.rem = leerRemotoDOM();
        return est;
    }

    function pedirConfirmacion() {
        var remoto = estado.tipo === 'remoto';
        if (!remoto) { pisoLabor($('labor')); defaultTraslado($('traslado')); }
        if (remoto) {
            if (!$('r_desc').value.trim()) { alert('Describí la consulta / trabajo atendido.'); $('r_desc').focus(); return; }
            if (!$('r_canal').value) { alert('Indicá la forma en que se recibió el pedido.'); $('r_canal').focus(); return; }
            if (!$('r_resultado').value.trim()) { alert('Completá el resultado / conclusión de cómo queda el equipo.'); $('r_resultado').focus(); return; }
        }
        if (!$('ticket').value.trim()) {
            alert('El Nº de Ticket es obligatorio para generar el informe.');
            $('ticket').focus();
            return;
        }
        if (CFG.usarCodigosTecnicos) {
            // La llave es el CODIGO en si: no alcanza con que el nombre oculto venga
            // de un borrador (asi se colaba la generacion sin clave en V13.12.0).
            var cTec = ($('codTec').value || '').trim();
            if (cTec.length !== 4 || !CFG.codigosTecnicos[cTec]) {
                alert('Ingresá tu código personal de técnico (4 dígitos) válido para generar el informe.');
                $('codTec').focus();
                return;
            }
            $('tecnico').value = CFG.codigosTecnicos[cTec];
        } else if (!$('tecnico').value) {
            alert('Seleccioná el Técnico Responsable del informe.');
            $('tecnico').focus();
            return;
        }
        var faltantes = [];
        if (!estado.local) faltantes.push('Franquicia (buscá o cargá manualmente)');
        if (!$('fecha').value) faltantes.push('Fecha');
        if (remoto && !$('r_equipo').value) faltantes.push('Equipo afectado');
        $('confirmFaltantes').innerHTML = faltantes.length
            ? '<p class="error">Faltan datos: ' + escapeHtml(faltantes.join(' · ')) + '</p>' : '';
        $('confirmCheck').checked = false;
        mostrarModal('modalConfirm');
    }

    function confirmarYGenerar() {
        var remoto = estado.tipo === 'remoto';
        var est = leerEstadoCompleto();
        if (!est.local) { alert('Seleccioná o cargá la franquicia antes de generar.'); return; }
        if (!String(est.ticket || '').trim()) {
            alert('El Nº de Ticket es obligatorio.'); ocultarModal('modalConfirm'); $('ticket').focus(); return;
        }
        if (remoto && !est.rem.equipo) {
            alert('Falta el Equipo afectado.'); return;
        }
        if (!remoto && !$('confirmCheck').checked) {
            $('confirmError').textContent = 'Confirmá que todos los equipos fueron revisados antes de generar.';
            return;
        }
        ocultarModal('modalConfirm');
        // el remoto no lleva firmas; el presencial persiste los pads antes de generar
        var previo = remoto ? Promise.resolve() : Promise.all([persistirFirma('T'), persistirFirma('E')]);
        previo.then(function () {
            return window.InformePDF.generar(est);
        }).then(function (res) {
            var blob = res.doc.output('blob');
            registrarHistorial(est, res.nombre);
            abrirResultado(blob, res.nombre, est);
        }).catch(function (e) {
            alert('Error al generar el PDF: ' + (e && e.message ? e.message : e));
        });
    }

    var urlActual = null;
    function abrirResultado(blob, nombre, est) {
        if (urlActual) URL.revokeObjectURL(urlActual);
        urlActual = URL.createObjectURL(blob);
        $('previewFrame').src = urlActual + '#toolbar=0';
        $('resTitulo').textContent = nombre;
        $('btnGrupo').style.display = '';
        $('btnGrupo').innerHTML = (CFG.relay && CFG.relay.url)
            ? '<svg class="ic"><use href="#ic-send"/></svg> Enviar al grupo'
            : '<svg class="ic"><use href="#ic-send"/></svg> Enviar al grupo (menú nativo)';
        mostrarModal('modalResultado');
    }

    /* Guardar en el teléfono */
    function guardarPDF() {
        if (!urlActual) return;
        var a = document.createElement('a');
        a.href = urlActual;
        a.download = $('resTitulo').textContent;
        document.body.appendChild(a); a.click(); a.remove();
    }

    /* Compartir nativo (fallback universal) */
    function compartirPDF() {
        if (!urlActual) return;
        var nombre = $('resTitulo').textContent;
        fetch(urlActual).then(function (r) { return r.blob(); }).then(function (b) {
            var file = new File([b], nombre, { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                return navigator.share({ files: [file], title: nombre });
            }
            guardarPDF(); // si el dispositivo no comparte archivos, al menos descargá
        }).catch(function (e) { console.warn('share', e); });
    }

    /* Envío directo al grupo vía relay del servidor (telegram_bridge /enviar_informe).
       Sin relay configurado, cae en el menú nativo de compartir: el técnico elige el grupo. */
    function enviarAlGrupo(btn) {
        if (!urlActual) return;
        if (!CFG.relay || !CFG.relay.url) { compartirPDF(); return; }
        btn.disabled = true; btn.textContent = 'Enviando al grupo…';
        // relay.url puede venir con o sin la ruta: normalizo al endpoint /enviar_informe
        var endpoint = CFG.relay.url.replace(/\/+$/, '');
        if (!/\/enviar_informe$/.test(endpoint)) endpoint += '/enviar_informe';
        fetch(urlActual).then(function (r) { return r.blob(); }).then(function (b) {
            var fd = new FormData();
            fd.append('pdf', b, $('resTitulo').textContent);
            // caption de seguimiento en el grupo: código — local · Enviado por <técnico>
            var capCod = ($('codigo_informe').value || '') + ' — ' + (estado.local ? estado.local.n : '');
            var capTec = (($('tecnico') && $('tecnico').value) || '').trim();
            if (capTec) capCod += ' · Enviado por ' + capTec;
            fd.append('codigo', capCod);
            return fetch(endpoint, {
                method: 'POST',
                headers: { 'X-MTZ-Clave': CFG.relay.clave },
                body: fd
            });
        }).then(function (r) {
            if (!r.ok) throw new Error('El servidor respondió ' + r.status);
            return r.json().catch(function () { return {}; });
        }).then(function () {
            btn.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> Enviado al grupo';
            setTimeout(function () { btn.innerHTML = '<svg class="ic"><use href="#ic-send"/></svg> Enviar al grupo'; btn.disabled = false; }, 3000);
        }).catch(function (e) {
            btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-send"/></svg> Enviar al grupo';
            alert('No se pudo enviar al grupo (' + (e && e.message ? e.message : e) + ').\nUsá "Guardar PDF" y pasalo manualmente.');
        });
    }

    function cerrarResultado() {
        ocultarModal('modalResultado');
        $('previewFrame').src = 'about:blank';
    }

    /* ============ Limpieza total ============ */
    function resetAll() {
        if (!confirm('¿BORRAR el borrador actual y todas sus fotos/firmas?')) return;
        window.Almacen.borrar(CFG.almacenamiento.claveBorrador);
        var vivos = ['firmaT', 'firmaE'].concat(estado.fotos.map(function (f) { return f.id; }));
        Promise.all(vivos.map(function (id) { return window.Almacen.borrarBinario(id); })).then(function () {
            location.reload();
        });
    }

    /* ============ PWA: instalar y actualizar sin reinstalar ============ */
    function cablearPWA() {
        // Botón instalar (patrón del Localizador)
        var deferred = null;
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault(); deferred = e;
            $('btnInstalar').style.display = '';
        });
        $('btnInstalar').addEventListener('click', function () {
            if (!deferred) return;
            deferred.prompt(); deferred.userChoice = null;
            $('btnInstalar').style.display = 'none';
        });
        window.addEventListener('appinstalled', function () { $('btnInstalar').style.display = 'none'; });

        // Service Worker + recarga automática cuando hay versión nueva (no hay que reinstalar)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js?v=' + window.MTZ_VERSION).then(function (reg) {
                var chequear = function () { try { reg.update(); } catch (e) {} };
                // El update se pide: al abrir la app, cada vez que vuelve a primer
                // plano (el técnico abre/cierra todo el día) y de fondo cada 5 min.
                chequear();
                setInterval(chequear, 5 * 60 * 1000);
                document.addEventListener('visibilitychange', function () { if (!document.hidden) chequear(); });
                window.addEventListener('pageshow', chequear);
            }).catch(function (err) { console.error('PWA Error', err); });

            var recargoHecho = false;
            var btnBanner = $('bannerUpdate').querySelector('button');
            btnBanner.addEventListener('click', function () { location.reload(); });
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (recargoHecho) return;
                // guardia anti-bucle: no recargar dos veces por la misma versión
                if (sessionStorage.getItem('mtz:recargada') === window.MTZ_VERSION) return;
                recargoHecho = true;
                sessionStorage.setItem('mtz:recargada', window.MTZ_VERSION);
                try {
                    var banner = $('bannerUpdate');
                    banner.classList.add('on');
                    banner.querySelector('span').innerHTML = '<svg class="ic"><use href="#ic-refresh"/></svg> Hay una versión nueva de la app';
                    // el borrador se guarda en cada cambio: recargar es seguro
                    setTimeout(function () { location.reload(); }, 1500);
                } catch (e) { location.reload(); }
            });
        }
    }

    /* ============ Migración borrador V12 → V13 (nadie pierde su intervención en curso) ============ */
    function hayV12() {
        try { return !!(localStorage.getItem('mostaza_mtz_v12_7') || localStorage.getItem('mostaza_mtz_v12_5')); } catch (e) { return false; }
    }
    function migrarV12() {
        var v; try { v = JSON.parse(localStorage.getItem('mostaza_mtz_v12_7') || localStorage.getItem('mostaza_mtz_v12_5')); } catch (e) { return Promise.resolve(false); }
        if (!v || !v.c) return Promise.resolve(false);
        var l = v.c.l ? window.Locales.porNombre(v.c.l) : null;
        var ppmN = parseInt(v.c.p, 10);
        var d = {
            v: 13,
            c: {
                fe: v.c.fe || fechaLocal(), tk: v.c.t || '', tec: (v.c.tec || '').toUpperCase(),
                lab: v.c.lab || '', via: v.c.via || '', pr: v.c.pr || '', cod: v.c.cod || '',
                op: v.c.op || '', of: v.c.of || '', enc: v.c.enc || ''
            },
            local: l, geo: null, fotos: [],
            agua: {
                ppm: { estado: v.c.pp ? 'sin_medir' : 'medido', valor: isFinite(ppmN) ? ppmN : null },
                filtro: v.c.f || 'OP', ablandador: v.c.a || 'OP', osmosis: v.c.o || 'N/A',
                detalle: v.c.oa || '', semaforo: 'gris', porQue: ''
            },
            equipos: v.e || []
        };
        window.Almacen.guardar(CFG.almacenamiento.claveBorrador, d);
        var pendientes = [];
        // fotos: base64 viejo → Blob en IndexedDB
        (Array.isArray(v.img) ? v.img.slice(0, CFG.fotos.maxPorInforme) : []).forEach(function (u) {
            pendientes.push(fetch(u).then(function (r) { return r.blob(); }).then(function (b) {
                return new Promise(function (res) {
                    var img = new Image();
                    img.onload = function () {
                        var id = nuevoIdFoto();
                        window.Almacen.guardarBinario(id, b, { w: img.width, h: img.height }).then(function () {
                            d.fotos.push({ id: id, w: img.width, h: img.height }); res();
                        });
                    };
                    img.onerror = res; img.src = u;
                });
            }).catch(function () {}));
        });
        // firmas: dataURL viejo → Blob
        ['firmaT', 'firmaE'].forEach(function (k) {
            if (!v[k]) return;
            pendientes.push(fetch(v[k]).then(function (r) { return r.blob(); }).then(function (b) {
                return window.Almacen.guardarBinario(k, b, { tipo: 'firma' });
            }).catch(function () {}));
        });
        return Promise.all(pendientes).then(function () {
            // re-scribo el borrador ya con las fotos migradas
            window.Almacen.guardar(CFG.almacenamiento.claveBorrador, d);
            return true;
        });
    }

    /* ============ Arranque ============ */
    function init() {
        // URL del relay Telegram: se lee dinámico al arrancar, porque el túnel
        // efímero cambia de dirección en cada reinicio (levantar_relay.sh escribe
        // relay.json y republica). Sin URL, el botón usa el menú nativo de compartir.
        fetch('relay.json?ts=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { if (j && j.url) CFG.relay.url = j.url; })
            .catch(function () {});

        // La versión exacta debe verse en pantalla: sin esto todo parece "V13"
        // igual que siempre y es imposible confirmar un deploy a simple vista.
        var ver = 'v' + window.MTZ_VERSION;
        $('verTitulo').textContent = ver;
        $('verBtn').textContent = ver;
        $('pieVersion').textContent = 'Mostaza Mantenimiento Franquicias — ' + ver +
            ' · ' + (window.FRANQUICIAS ? window.FRANQUICIAS.length : 0) + ' franquicias';
        document.title = 'MANTENIMIENTO FRANQUICIAS ' + ver;

        // técnicos: por default desplegable (con elección obligatoria, sin default
        // sesgado); con CFG.usarCodigosTecnicos=true se monta el campo de código personal
        if (CFG.usarCodigosTecnicos) {
            montarCodigoTecnico();
            // La app principal (MTZ Técnico Franquicias) puede seguir pasando la
            // identidad por ?cod=<4 dígitos>: en vez de bloquear el nombre, se
            // precarga el código en el campo y el técnico lo confirma.
            var codUrl = '';
            try { codUrl = (new URLSearchParams(location.search).get('cod') || '').trim(); } catch (e) {}
            if (/^\d{4}$/.test(codUrl) && CFG.codigosTecnicos[codUrl]) {
                $('codTec').value = codUrl;
                resolverCodigoTec();
            }
        } else {
            // Identidad desde MTZ Técnico Franquicias: ?cod=<4 dígitos> (el mismo código
            // personal de siempre). Si coincide, el técnico queda fijado y bloqueado;
            // sin parámetro, la elección manual sigue como siempre (entrada directa).
            var codUrl = '';
            try { codUrl = (new URLSearchParams(location.search).get('cod') || '').trim(); } catch (e) {}
            var nombreFijo = CFG.codigosTecnicos[codUrl] || null;
            if (nombreFijo) {
                TEC_FIX = nombreFijo;
                $('tecnico').innerHTML = '<option value="' + nombreFijo + '">' + nombreFijo + '</option>';
                $('tecnico').disabled = true;
                var avTec = document.createElement('p');
                avTec.style.cssText = 'margin:4px 0 0;font-size:12px;color:inherit;opacity:.7';
                avTec.textContent = 'Sesión iniciada desde la app MTZ Técnico Franquicias — el informe saldrá a este nombre.';
                $('campoTecnico').appendChild(avTec);
            } else {
                $('tecnico').innerHTML = '<option value="">-- SELECCIONAR TÉCNICO --</option>' +
                    CFG.tecnicos.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
            }
        }
        $('prioridad').innerHTML = CFG.prioridades.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('');

        var hoy = fechaLocal();
        if (!$('fecha').value) $('fecha').value = hoy;

        window.Almacen.iniciar();
        if (!window.Almacen.leer(CFG.almacenamiento.claveBorrador) && hayV12()) {
            migrarV12().then(function (ok) {
                if (ok) {
                    try { ['mostaza_mtz_v12_7', 'mostaza_mtz_v12_5'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
                    location.reload(); // ahora sí, carga como V13 con fotos y firmas incluidas
                    return;
                }
                init2();
            });
        } else { init2(); }
    }

    function init2() {
        window.Almacen.iniciar();
        montarCuerpoRemoto();
        cargarBorrador();
        var hoy = fechaLocal();
        if (!$('fecha').value) $('fecha').value = hoy;
        aplicarTipo();
        if (document.querySelectorAll('.equipo-item').length === 0) addEquipo();

        // pads de firma
        padT = new window.MiniPad($('padT'));
        padE = new window.MiniPad($('padE'));
        restaurarFirmas();
        ['T', 'E'].forEach(function (t) {
            var pad = t === 'T' ? padT : padE;
            pad.cv.addEventListener('pointerup', function () { persistirFirma(t).then(guardarBorrador); });
        });
        window.addEventListener('resize', function () { padT.resize(); padE.resize(); });
        window.addEventListener('orientationchange', function () { setTimeout(function () { padT.resize(); padE.resize(); }, 300); });

        // buscador
        $('localBusqueda').addEventListener('input', function () { pintarResultados(this.value); });
        $('localBusqueda').addEventListener('focus', function () { if (this.value) pintarResultados(this.value); });

        // agua
        ['ppm', 'f_filtrado', 'f_ablandador', 'f_osmosis', 'obsAgua'].forEach(function (id) {
            $(id).addEventListener('input', function () { pintarAgua(); guardarBorrador(); });
            $(id).addEventListener('change', function () { pintarAgua(); guardarBorrador(); });
        });
        $('ppm_pendiente').addEventListener('change', togglePpm);

        // campos persist
        ['fecha', 'ticket', 'tecnico', 'labor', 'traslado', 'prioridad', 'codigo_informe',
         'obsPrevias', 'obsFinales', 'nombreEncargado'].forEach(function (id) {
            $(id).addEventListener('input', guardarBorrador);
            $(id).addEventListener('change', guardarBorrador);
        });
        ['r_desc', 'r_nombre', 'r_apellido', 'r_canalOtro', 'r_diag', 'r_resultado'].forEach(function (id) {
            $(id).addEventListener('input', guardarBorrador);
        });
        ['r_caracter', 'r_coordinada', 'r_hora', 'r_duracion', 'r_equipo'].forEach(function (id) {
            $(id).addEventListener('change', guardarBorrador);
        });
        $('r_canal').addEventListener('change', guardarBorrador);
        $('tipoInforme').value = estado.tipo;
        $('tipoInforme').addEventListener('change', function () {
            estado.tipo = this.value; aplicarTipo(); guardarBorrador();
        });
        $('labor').addEventListener('keydown', soloDigitos);
        $('traslado').addEventListener('keydown', soloDigitos);
        $('labor').addEventListener('input', function () { limpiarDigitos(this); });
        $('traslado').addEventListener('input', function () { limpiarDigitos(this); });
        $('labor').addEventListener('blur', function () { pisoLabor(this); guardarBorrador(); });
        $('traslado').addEventListener('blur', function () { defaultTraslado(this); guardarBorrador(); });

        // fotos / geo / acciones
        $('fotoInput').addEventListener('change', onFotoElegida);
        $('btnGeo').addEventListener('click', marcarUbicacion);
        $('btnAddEquipo').addEventListener('click', function () { addEquipo(); guardarBorrador(); });
        $('btnGenerar').addEventListener('click', pedirConfirmacion);
        $('btnReset').addEventListener('click', resetAll);

        // modales
        $('mAceptar').addEventListener('click', confirmarManual);
        $('mCancelar').addEventListener('click', function () { ocultarModal('modalManual'); });
        $('confirmSi').addEventListener('click', confirmarYGenerar);
        $('confirmNo').addEventListener('click', function () { ocultarModal('modalConfirm'); });
        $('btnGuardar').addEventListener('click', guardarPDF);
        $('btnCompartir').addEventListener('click', compartirPDF);
        $('btnGrupo').addEventListener('click', function () { enviarAlGrupo(this); });
        $('btnCerrarRes').addEventListener('click', cerrarResultado);

        // limpieza de blobs huérfanos (fotos de informes anteriores ya generados)
        var vivos = ['firmaT', 'firmaE'].concat(estado.fotos.map(function (f) { return f.id; }));
        window.Almacen.limpiarHuerfanos(vivos);

        if (!estado.local) $('codigo_informe').placeholder = 'Se genera al seleccionar la franquicia';
        // código resiliente: si hay local pero no código (borradores viejos)
        if (estado.local && !$('codigo_informe').value) $('codigo_informe').value = window.Locales.nuevoCodigo(estado.local.id);

        // locks de firma arrancan bloqueadas (no se rayan al scrollear)
        cerrarCandadoInicial('T'); cerrarCandadoInicial('E');

        cablearPWA();
        pintarAgua();
        evaluarLed();
        pisoLabor($('labor')); defaultTraslado($('traslado'));
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

    // expone lo necesario para handlers inline de index.html
    window.MTZ = { toggleLock: toggleLock, clearPad: clearPad, getEstado: function () { return estado; } };
})();
