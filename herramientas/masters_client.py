#!/usr/bin/env python3
"""
masters_client.py — consumidor de referencia de MTZ Locales Master Brain.
Stdlib puro: cualquier app puede copiar este archivo tal cual a su proyecto.

Patrón: pedir manifest → comparar sha256 con el cache → descargar SOLO si cambió
→ validar hash → upsert a SQLite local → consultar de SQLite, nunca del HTTP.

Uso como librería:
    mc = MastersClient(cache_dir="~/.cache/mtz_master", token=os.environ["MASTER_BRAIN_TOKEN"])
    mc.sincronizar()          # descarga e indexa si el hash cambió
    mc.local()["FSJU"]        # fila de la Sábana por SIGLA

Uso como CLI de prueba:
    python3 masters_client.py --manifest
    python3 masters_client.py --sync
    python3 masters_client.py --buscar "san justo"
"""
import base64
import csv
import hashlib
import io
import json
import os
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = "CristianMerlo/mtz-locales-master-brain"
RAW = f"https://raw.githubusercontent.com/{REPO}/main"
ARCHIVO_MATRIZ = "datos/SABANA_V6.csv"
ARCHIVO_MANIFEST = "manifest.json"
VERSION_ESPERADA = 6  # bump cuando cambie la estructura de columnas


class MastersError(RuntimeError):
    pass


def _sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


class MastersClient:
    def __init__(self, cache_dir="~/.cache/mtz_master", token=None, repo=REPO):
        self.cache = Path(os.path.expanduser(cache_dir))
        self.cache.mkdir(parents=True, exist_ok=True)
        self.token = token or os.environ.get("MASTER_BRAIN_TOKEN", "")
        # usuario del deploy token (viene en la pantalla de generación); default: "master"
        self.user = os.environ.get("MASTER_BRAIN_USER", "master")
        self.raw = f"https://raw.githubusercontent.com/{repo}/main"
        self.db_path = self.cache / "master_brain.db"

    # ---------- HTTP ----------
    def _get(self, ruta):
        req = urllib.request.Request(f"{self.raw}/{ruta}")
        if self.token:
            # PAT (fine-grained github_pat_ o clásico ghp_) -> Bearer.
            # Deploy token (no empieza con github_/ghp_) -> Basic con usuario:token.
            if self.token.startswith(("github_pat_", "ghp_", "ghs_", "gho_")):
                req.add_header("Authorization", f"Bearer {self.token}")
            else:
                par = base64.b64encode(f"{self.user}:{self.token}".encode()).decode()
                req.add_header("Authorization", f"Basic {par}")
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()

    # ---------- sincronización ----------
    def manifest(self):
        return json.loads(self._get(ARCHIVO_MANIFEST))

    def estado_cache(self):
        p = self.cache / ARCHIVO_MANIFEST.replace("/", "_")
        return json.loads(p.read_text()) if p.exists() else None

    def sincronizar(self, forzar=False):
        """Descarga e indexa SOLO si el sha256 del CSV cambió. Retorna el manifest vigente."""
        mani = self.manifest()
        if mani.get("esquema_version") != VERSION_ESPERADA:
            raise MastersError(f"esquema_version {mani.get('esquema_version')} != esperada {VERSION_ESPERADA}")
        previo = self.estado_cache()
        if not forzar and previo and previo.get("csv", {}).get("sha256") == mani["csv"]["sha256"]:
            return mani  # sin cambios: no se baja nada
        csv_bytes = self._get(ARCHIVO_MATRIZ)
        if _sha256_bytes(csv_bytes) != mani["csv"]["sha256"]:
            raise MastersError("sha256 del CSV no coincide con el manifest (¿publicación corrupta?)")
        (self.cache / "SABANA_V6.csv").write_bytes(csv_bytes)
        (self.cache / ARCHIVO_MANIFEST.replace("/", "_")).write_text(json.dumps(mani))
        self.indexar(csv_bytes)
        return mani

    def sincronizar_seguro(self, forzar=False):
        """Como sincronizar() pero NUNCA lanza por problemas de red: si no hay conexión
        o el remoto falla, usa la última cache. Pensado para que la app jamas se rompa.
        Retorna un dict: {ok, fuente: 'remoto'|'cache'|'ninguno', version, filas, error}."""
        try:
            mani = self.sincronizar(forzar=forzar)
            return {"ok": True, "fuente": "remoto", "version": mani["version"],
                    "filas": mani["csv"]["filas"], "error": None}
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            # red/HTTP: caer al cache si existe
            if (self.cache / "SABANA_V6.csv").exists():
                previo = self.estado_cache() or {}
                return {"ok": True, "fuente": "cache", "version": previo.get("version"),
                        "filas": previo.get("csv", {}).get("filas"), "error": str(e)}
            return {"ok": False, "fuente": "ninguno", "version": None,
                    "filas": 0, "error": str(e)}

    # ---------- SQLite local ----------
    def indexar(self, csv_bytes):
        filas = list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8-sig"))))
        if not filas:
            raise MastersError("CSV vacío o inválido: no se indexa")
        cols = list(filas[0].keys())
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute("DROP TABLE IF EXISTS sabana_v6")
        cur.execute("CREATE TABLE sabana_v6 (" + ", ".join(
            f'"{c}" TEXT' + (" PRIMARY KEY" if c == "SIGLA" else "") for c in cols) + ")")
        cur.executemany(f"INSERT INTO sabana_v6 ({','.join(chr(34)+c+chr(34) for c in cols)}) "
                        f"VALUES ({','.join('?' * len(cols))})",
                        [[f.get(c, "") for c in cols] for f in filas])
        cur.execute("CREATE INDEX IF NOT EXISTS idx_local ON sabana_v6 (LOCAL)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_siglas ON sabana_v6 (SIGLAS)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_alias ON sabana_v6 (\"NOMBRES ALIAS\")")
        con.commit()
        con.close()
        return len(filas)

    def local(self):
        """Diccionario {SIGLA: fila} desde el SQLite cacheado."""
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        out = {r["SIGLA"]: dict(r) for r in con.execute("SELECT * FROM sabana_v6")}
        con.close()
        return out

    def buscar(self, texto):
        """Búsqueda simple por nombre/sigla/alias sobre el cache local."""
        t = texto.lower()
        return [f for sig, f in self.local().items()
                if t in sig.lower() or t in (f.get("LOCAL") or "").lower()
                or t in (f.get("SIGLAS") or "").lower() or t in (f.get("NOMBRES ALIAS") or "").lower()]

    def resolver(self, codigo):
        """Devuelve la fila (dict) para cualquier código: SIGLA exacta, código de ticket en
        SIGLAS, o alias. Reemplaza el viejo mapa 'sigla_tickets -> nombre' de locales.csv.
        Retorna None si no existe. Comparación normalizada (mayúsculas/espacios/tildes)."""
        if not codigo:
            return None
        c = str(codigo).strip().upper().replace(" ", "").replace("-", "")
        datos = self.local()
        if c in datos:                      # golpe directo por SIGLA canónica
            return datos[c]
        for fila in datos.values():          # buscar en SIGLAS (códigos de tickets) y alias
            codigos = {x.strip().upper().replace(" ", "").replace("-", "")
                       for x in (fila.get("SIGLAS") or "").split(",") if x.strip()}
            if c in codigos:
                return fila
        return None

    def ultimo_sync(self):
        p = self.cache / "SABANA_V6.csv"
        if not p.exists():
            return None
        return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()


# ---------- publica el manifest (lo usa publicar_master_brain.py) ----------
def generar_manifest(csv_path, previo_path=None, esquema_version=VERSION_ESPERADA):
    """Calcula sha256/filas/bytes del CSV y arma el manifest.json. Versión = +1 sobre la previa."""
    data = Path(csv_path).read_bytes()
    filas = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    cols = list(filas[0].keys())
    version = 1
    if previo_path and Path(previo_path).exists():
        version = json.loads(Path(previo_path).read_text()).get("version", 0) + 1
    return {
        "version": version,
        "esquema_version": esquema_version,
        "publicado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "csv": {"ruta": ARCHIVO_MATRIZ, "sha256": _sha256_bytes(data),
                "bytes": len(data), "filas": len(filas), "columnas": len(cols)},
    }


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Consumidor de MTZ Locales Master Brain")
    ap.add_argument("--manifest", action="store_true", help="imprimir manifest remoto")
    ap.add_argument("--sync", action="store_true", help="sincronizar si cambió el hash")
    ap.add_argument("--buscar", metavar="TEXTO", help="buscar en el cache local")
    args = ap.parse_args()
    mc = MastersClient()
    if args.manifest:
        print(json.dumps(mc.manifest(), indent=2))
    if args.sync:
        mani = mc.sincronizar()
        print(f"sync ok: v{mani['version']} · {mani['csv']['filas']} filas · sha {mani['csv']['sha256'][:12]}")
    if args.buscar:
        for f in mc.buscar(args.buscar):
            print(f"{f['SIGLA']:8} {f['LOCAL']} · {f.get('CIUDAD','')} · {f.get('PROVINCIA','')}")
