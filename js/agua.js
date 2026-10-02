/* Agua — jerarquía de 5 estados portada literalmente de js/controles/agua.js de
   Auditoría Técnica. Cortes fijos 50/120/300 (criterio de mantenimiento, NO tocar).
   1-49 NARANJA (blanda) · 50-119 VERDE · 120-300 AMARILLO · >300 ROJO · sin medir GRIS.
   El campo porQue explica el color y se imprime en el PDF. */
window.Agua = (function () {
    'use strict';
    var ESCALA = ['verde', 'amarillo', 'naranja', 'rojo'];

    function inicial() {
        return { ppm: { estado: 'medido', valor: null }, filtro: 'OP', ablandador: 'OP', osmosis: 'N/A',
                 detalle: '', semaforo: 'gris', porQue: '' };
    }
    function nivelPorPpm(v) {
        if (v >= 1 && v <= 49) return { n: 'naranja', txt: 'PPM ' + v + ' bajo rango (1-49): agua muy blanda' };
        if (v >= 50 && v <= 119) return { n: 'verde', txt: 'PPM ' + v + ' en rango óptimo (50-119)' };
        if (v >= 120 && v <= 300) return { n: 'amarillo', txt: 'PPM ' + v + ' en rango de alerta (120-300)' };
        if (v > 300) return { n: 'rojo', txt: 'PPM ' + v + ' agua dura (>300): crítico' };
        if (v === 0) return { n: 'rojo', txt: 'PPM 0: revisar, valor fuera de rango' };
        return { n: 'verde', txt: 'PPM ' + v };
    }
    function sube(n) { var i = ESCALA.indexOf(n); return ESCALA[Math.min(i + 1, ESCALA.length - 1)]; }

    function calcular(d) {
        var noop = 0, comp = [];
        ['filtro', 'ablandador', 'osmosis'].forEach(function (k) {
            if (d[k] === 'N/A') return;
            if (d[k] === 'NO OP') { noop++; comp.push(k + ' NO OP'); }
        });
        var nivel, base;
        if (d.ppm.estado === 'sin_medir' || d.ppm.valor == null) { nivel = 'gris'; base = 'PPM sin medir'; }
        else { var r = nivelPorPpm(d.ppm.valor); nivel = r.n; base = r.txt; }
        var por = base;
        if (nivel === 'gris') {
            if (noop >= 2) { nivel = 'rojo'; por += ' + 2 o más componentes NO OP (' + comp.join(', ') + ')'; }
            else if (noop === 1) { nivel = 'amarillo'; por += ' + 1 componente NO OP (' + comp.join(', ') + ')'; }
            else { por += ' (estado depende de componentes; sin medir no se considera verde)'; }
        } else {
            if (noop >= 2) { nivel = 'rojo'; por += ' + 2 o más componentes NO OP (' + comp.join(', ') + ')'; }
            else if (noop === 1) { var antes = nivel; nivel = sube(nivel); por += ' + 1 componente NO OP (' + comp.join(', ') + ') sube de ' + antes + ' a ' + nivel; }
        }
        if (d.osmosis === 'N/A') por += '. Ósmosis en N/A: excluida del cálculo.';
        d.semaforo = nivel; d.porQue = por;
        return { nivel: nivel, porQue: por };
    }

    function rotulo(sem) {
        return ({ verde: 'VERDE', amarillo: 'AMARILLO', naranja: 'NARANJA', rojo: 'ROJO', gris: 'SIN MEDIR' })[sem] || 'SIN MEDIR';
    }
    // El agua en ROJO o NARANJA es alarma; AMARILLO alerta; VERDE ok; GRIS neutro.
    function nivelLed(sem) {
        if (sem === 'rojo' || sem === 'naranja') return 'rojo';
        if (sem === 'amarillo') return 'amarillo';
        if (sem === 'verde') return 'verde';
        return 'gris';
    }
    return { inicial: inicial, calcular: calcular, rotulo: rotulo, nivelLed: nivelLed };
})();
