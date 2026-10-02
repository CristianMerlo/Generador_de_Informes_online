/* Firmas — pad de firma táctil en canvas SIN dependencias externas (reemplaza a
   signature_pad por CDN). Punteros unificados (táctil + mouse + stylus), soporte
   de devicePixelRatio, candado on/off y restauración desde dataURL/Blob. */
window.MiniPad = (function () {
    'use strict';
    function MiniPad(canvas) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this.activo = true;
        this.trazo = false;
        this.dibujando = false;
        var self = this;
        this.cv.addEventListener('pointerdown', function (e) { self._down(e); });
        this.cv.addEventListener('pointermove', function (e) { self._move(e); });
        window.addEventListener('pointerup', function () { self._up(); });
        window.addEventListener('pointercancel', function () { self._up(); });
        this.resize();
    }
    MiniPad.prototype._pos = function (e) {
        var r = this.cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    MiniPad.prototype._down = function (e) {
        if (!this.activo) return;
        e.preventDefault();
        this.cv.setPointerCapture && this.cv.setPointerCapture(e.pointerId);
        this.dibujando = true; this.trazo = true;
        var p = this._pos(e);
        this.prev = p;
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(p.x + .1, p.y + .1);
        this.ctx.lineWidth = 2.5; this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = '#1A1A1B';
        this.ctx.stroke();
    };
    MiniPad.prototype._move = function (e) {
        if (!this.dibujando || !this.activo) return;
        e.preventDefault();
        var p = this._pos(e);
        // suavizado: línea desde el punto anterior
        this.ctx.beginPath();
        this.ctx.moveTo(this.prev.x, this.prev.y);
        this.ctx.lineTo(p.x, p.y);
        this.ctx.stroke();
        this.prev = p;
    };
    MiniPad.prototype._up = function () { this.dibujando = false; };

    MiniPad.prototype.isEmpty = function () { return !this.trazo; };
    MiniPad.prototype.clear = function () {
        this.trazo = false;
        var r = this.cv.getBoundingClientRect();
        this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.cv.width, this.cv.height);
        this.ctx.restore();
    };
    MiniPad.prototype.on = function () { this.activo = true; };
    MiniPad.prototype.off = function () { this.activo = false; this.dibujando = false; };
    MiniPad.prototype.toDataURL = function () { return this.cv.toDataURL('image/png'); };
    MiniPad.prototype.toBlob = function (cb) {
        var r = this.cv.getBoundingClientRect();
        var aux = document.createElement('canvas');
        aux.width = Math.round(r.width); aux.height = Math.round(r.height);
        aux.getContext('2d').drawImage(this.cv, 0, 0, aux.width, aux.height);
        aux.toBlob(function (b) { cb(b); }, 'image/png');
    };
    MiniPad.prototype.fromDataURL = function (url, alListo) {
        var self = this;
        if (!url) { if (alListo) alListo(); return; }
        var img = new Image();
        img.onload = function () {
            var r = self.cv.getBoundingClientRect();
            self.ctx.drawImage(img, 0, 0, r.width, r.height);
            self.trazo = true;
            if (alListo) alListo();
        };
        img.onerror = function () { if (alListo) alListo(); };
        img.src = url;
    };
    // Re-dimensiona el canvas interno al tamaño real x devicePixelRatio conservando el dibujo
    MiniPad.prototype.resize = function () {
        var snap = this.trazo ? this.cv.toDataURL('image/png') : null;
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        var r = this.cv.getBoundingClientRect();
        var w = r.width || 320, h = r.height || 150;
        this.cv.width = Math.round(w * ratio);
        this.cv.height = Math.round(h * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, w, h);
        if (snap) { this.fromDataURL(snap); }
    };
    return MiniPad;
})();
