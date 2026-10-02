#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera js/db.js del Generador de Informes desde el MTZ Locales Master Brain.

Fuente de verdad: repo github.com/CristianMerlo/mtz-locales-master-brain
(datos/SABANA_V6.csv), consumido con el cliente oficial masters_client.py
(copiado tal cual desde el repo). Cadencia de seguridad:
    REMOTO (solo baja si cambió el sha256)  ->  CACHE (~/.cache/generador-informes)
    ->  CLON LOCAL de respaldo (~/PROYECTOS/...).
Si la red o GitHub fallan, el script genera igualmente desde la última copia
en cache: nunca deja el pipeline bloqueado.

Esta app es una PWA ESTÁTICA y PÚBLICA (GitHub Pages): el token se lee de la
máquina (~/.config/mtz-generador/master_brain_token o env MASTER_BRAIN_TOKEN),
NUNCA vive dentro de la carpeta desplegada, y el script no publica columnas
sensibles (MAIL, MAIL_REGIONAL, MAIL_SUPERVISOR, TEL_GERENTE, CUIT, FUENTES).
El repo master-brain es SOLO LECTURA desde acá: prohibido escribir/pushear.

Uso:
    python3 herramientas/generar_db_desde_master_brain.py            # sincroniza + genera
    python3 herramientas/generar_db_desde_master_brain.py --check    # informa sin escribir
    python3 herramientas/generar_db_desde_master_brain.py --csv RUTA # fuerza un CSV (sin red)

Actualizar la base del Generador (ya no hace falta git pull):
    1) python3 herramientas/generar_db_desde_master_brain.py
    2) subir versión en index.html/sw.js y publicar
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from masters_client import MastersClient  # noqa: E402  (cliente oficial, stdlib puro)

PROYECTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = "~/.cache/generador-informes"
TOKEN_ARCHIVO = os.path.expanduser("~/.config/mtz-generador/master_brain_token")
CANDIDATOS_CSV = [
    os.path.expanduser("~/PROYECTOS/mtz-locales-master-brain/datos/SABANA_V6.csv"),
    os.path.expanduser("~/Documentos/mtz-locales-master-brain/datos/SABANA_V6.csv"),
]
SALIDA = os.path.join(PROYECTO, "js", "db.js")

# Columnas que JAMÁS deben llegar a la app pública
SENSIBLES = {"MAIL", "MAIL_REGIONAL", "MAIL_SUPERVISOR", "TEL_GERENTE", "CUIT", "FUENTES"}


def norm(v):
    return (v or "").strip()


def limpiar(v):
    """Compacta espacios y normaliza saltos de línea dentro de una celda."""
    return re.sub(r"\s+", " ", norm(v).replace("\n", " ")).strip()


def leer_token():
    """El token vive fuera del proyecto (la carpeta se publica en Surge tal cual)."""
    t = os.environ.get("MASTER_BRAIN_TOKEN", "").strip()
    if t:
        return t
    try:
        return open(TOKEN_ARCHIVO, encoding="utf-8").read().strip()
    except OSError:
        return ""


def obtener_csv(forzar_ruta=None):
    """Devuelve (ruta_csv, manifest, fuente). Siempre pasa por sincronizar_seguro:
    red OK → cache fresh; red caída → última cache; sin cache → clon local de respaldo."""
    if forzar_ruta:
        if not os.path.exists(forzar_ruta):
            sys.exit(f"ERROR: no existe el CSV pedido: {forzar_ruta}")
        return forzar_ruta, leer_manifest(forzar_ruta), "csv explícito"

    mc = MastersClient(cache_dir=CACHE_DIR, token=leer_token())
    e = mc.sincronizar_seguro()
    print(f"sync    : ok={e['ok']} fuente={e['fuente']} v={e['version']} filas={e['filas']}"
          + (f" error={e['error']}" if e['error'] else ""))
    ruta_cache = os.path.join(os.path.expanduser(CACHE_DIR), "SABANA_V6.csv")
    if e["ok"] and os.path.exists(ruta_cache):
        return ruta_cache, (mc.estado_cache() or {}), f"master-brain ({e['fuente']})"
    # último recurso: clon local (puede estar más viejo o más nuevo que el cache)
    for ruta in CANDIDATOS_CSV:
        if os.path.exists(ruta):
            print("AVISO   : sin remoto ni cache usable — usando clon local de respaldo")
            return ruta, leer_manifest(ruta), "clon local (RESPALDO)"
    sys.exit(
        "ERROR: sin red, sin cache y sin clon local. Cloná el repositorio maestro\n"
        "  git clone https://github.com/CristianMerlo/mtz-locales-master-brain.git "
        "~/PROYECTOS/mtz-locales-master-brain\n"
        "o pasá la ruta con --csv."
    )


def ubicar_csv(pedido):
    return obtener_csv(pedido)[0]


def leer_manifest(ruta_csv):
    mani = os.path.join(os.path.dirname(ruta_csv), "..", "manifest.json")
    if os.path.exists(mani):
        try:
            with open(mani, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def construir(ruta_csv):
    with open(ruta_csv, encoding="utf-8-sig", newline="") as f:
        filas = list(csv.DictReader(f))

    faltan = SENSIBLES - set(filas[0].keys()) if filas else set()
    _ = faltan  # solo referencia: ninguna se copia a la salida

    out, avisos, excluidos = [], [], []
    for r in filas:
        idg = norm(r.get("ID_GENERADOR"))
        if not idg:
            continue  # local sin ficha en el Generador
        if not re.fullmatch(r"\d+", idg):
            avisos.append(f"ID_GENERADOR no numérico ({idg!r}) en {r.get('SIGLA')} — ignorado")
            continue
        tipo = norm(r.get("TIPO_ADMIN", "")).lower()
        if tipo != "franquicia":
            # El Generador es SOLO para franquicias. Los propios (aunque tengan ID
            # porque Franquicias les da servicio) quedan afuera: casi no hacen informes.
            excluidos.append(f"{idg} {norm(r.get('SIGLA'))} ({limpiar(r.get('LOCAL'))}) — TIPO_ADMIN={tipo or 'vacío'}")
            continue
        sigla = limpiar(r.get("SIGLA"))
        siglas = [s for s in re.split(r"[,;/]", limpiar(r.get("SIGLAS"))) if s]
        nombre = limpiar(r.get("LOCAL"))
        registro = {
            "n": nombre.upper(),
            "s": sigla.upper(),
            "t": (siglas[0] if siglas else sigla).upper(),
            "id": int(idg),
            "dir": limpiar(r.get("DIRECCION")),
            "cd": limpiar(r.get("CIUDAD")).upper(),
            "pr": limpiar(r.get("PROVINCIA")).upper(),
            "rs": limpiar(r.get("RAZON_SOCIAL")),
            "tec": limpiar(r.get("TECNICO")),
            "sup": limpiar(r.get("SUPERVISOR")),
            "reg": limpiar(r.get("GERENTE_REGIONAL")),
            "co": limpiar(r.get("COORDINADOR")),
        }
        alias = [a.strip().upper() for a in re.split(r"[,;/]", limpiar(r.get("NOMBRES ALIAS"))) if a.strip()]
        if alias:
            registro["al"] = alias
        if "pendiente" in norm(r.get("ESTADO", "")).lower():
            registro["pend"] = 1
            avisos.append(f"{sigla} ({nombre}) está 'Pendiente de asignar' en la sabana")
        if not registro["dir"]:
            avisos.append(f"{sigla} ({nombre}) no tiene dirección cargada")
        out.append(registro)

    out.sort(key=lambda x: x["id"])
    return out, avisos, excluidos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="ruta a SABANA_V6.csv (por defecto se auto-detecta)")
    ap.add_argument("--check", action="store_true", help="informa qué se generarían sin escribir nada")
    args = ap.parse_args()

    ruta, mani, fuente = obtener_csv(args.csv)
    sha = hashlib.sha256(open(ruta, "rb").read()).hexdigest()
    registros, avisos, excluidos = construir(ruta)

    print(f"CSV     : {ruta}")
    print(f"fuente  : {fuente}")
    print(f"filas   : {len(registros)} Franquicias con ID_GENERADOR")
    for e in excluidos:
        print(f"  excluido: {e}")
    print(f"sha256  : {sha[:16]}…")
    if mani:
        print(f"manifest: v{mani.get('version')} · publicado {mani.get('publicado_utc')}")
    for a in avisos:
        print(f"  aviso: {a}")

    if args.check:
        print("\n--check: no se modificó js/db.js")
        return

    cabecera = (
        "// Base de FRANQUICIAS del Generador de Informes — GENERADA, no editar a mano.\n"
        "// Fuente canónica: mtz-locales-master-brain · datos/SABANA_V6.csv (vía masters_client.py)\n"
        "// Criterio: ID_GENERADOR no vacío Y TIPO_ADMIN = 'franquicia' (los propios quedan fuera).\n"
        f"// sha256 {sha}\n"
        f"// manifest v{mani.get('version', '?')} publicado {mani.get('publicado_utc', '?')}\n"
        f"// Regenerada: {date.today().isoformat()} con herramientas/generar_db_desde_master_brain.py\n"
        "// Sin datos sensibles (mails, teléfonos de gerentes y CUIT quedan fuera de esta app pública).\n"
        "// Campos: n=nombre s=sigla t=siglaTicket id=idGenerador dir=direccion cd=ciudad pr=provincia\n"
        "//         rs=razonSocial tec=tecnico sup=supervisor reg=gerenteRegional co=coordinador\n"
        "//         al=alias pend=pendiente de asignar regional/coordinador\n"
    )
    cuerpo = json.dumps(registros, ensure_ascii=False, separators=(",", ":"))
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write(cabecera + "window.FRANQUICIAS = " + cuerpo + ";\n")
    print(f"\nescrito  : {SALIDA} ({os.path.getsize(SALIDA)} bytes, {len(registros)} locales)")


if __name__ == "__main__":
    main()
