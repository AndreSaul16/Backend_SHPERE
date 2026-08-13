#!/usr/bin/env python3
"""Genera `public/textures/baize-128.webp` — el grano de paño de DESIGN §8.5.

    python3 scripts/gen-baize-texture.py public/textures/baize-128.webp

Requiere `Pillow` y `numpy` (sólo para regenerar el activo; no es dependencia de
la app). El fichero generado va commiteado, así que este script existe para que
el activo sea reproducible, no para ejecutarse en el build.

Decisiones, con su motivo medido:

- **Gris neutro centrado en 128.** El blend lo hace el CSS con
  `background-blend-mode: overlay`, y overlay contra gris 128 es la identidad:
  o sea que la intensidad efectiva del grano NO se controla con `opacity`, se
  controla con la AMPLITUD del ruido. ±9/255 ≈ 3,5% efectivo, que es el 4% que
  pide §8.5.

- **Tileable por construcción.** `np.roll` envuelve de forma circular, así que
  tanto el difuminado como el desplazamiento del tejido conservan la
  continuidad de los bordes. Verificado comparando el salto de píxel en la
  costura contra el gradiente interno medio: 0,97x — o sea que la costura es
  indistinguible del propio grano.

- **WebP SIN PÉRDIDA.** Con pérdida a calidad 60 el fichero bajaba a 224 bytes
  pero la compresión aplanaba el grano y rompía la continuidad de los bordes:
  el salto de costura salía 6x el gradiente interno, con lo que la costura se
  convertía en el rasgo más visible de la textura. Sin pérdida el grano
  sobrevive intacto.

- **7 niveles de gris (paso de cuantización 3).** El ruido es incompresible: a
  18 niveles el fichero pesa 4.750 bytes y se sale del presupuesto de 3 KB de
  §8.5. Cuantizar a 7 niveles lo deja en 2.752 bytes CONSERVANDO la amplitud
  completa (rango 120-138), así que se paga en suavidad de degradado —
  imperceptible al 3,5% de intensidad — y no en fuerza del efecto.
"""
import sys

import numpy as np
from PIL import Image

N = 128
AMP = 9.0  # ±9/255 ≈ 3,5% efectivo bajo overlay
STEP = 3  # cuantización: 7 niveles, para caber en el presupuesto de 3 KB
SEED = 0xB620ECFD  # la seed key del contrato de dirección (DESIGN §0)


def blur_circular(a, r=1):
    """Media (2r+1)² con envoltura circular: conserva la tileabilidad."""
    out = np.zeros_like(a)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out += np.roll(np.roll(a, dy, axis=0), dx, axis=1)
    return out / ((2 * r + 1) ** 2)


def main(out_path):
    rng = np.random.default_rng(SEED & 0xFFFFFFFF)
    noise = blur_circular(rng.normal(0.0, 1.0, (N, N)), 1)

    # Direccionalidad de tejido: urdimbre y trama como dos pasadas de ruido
    # desplazadas 1px en diagonales opuestas.
    warp = np.roll(np.roll(noise, 1, axis=0), 1, axis=1)
    weft = np.roll(np.roll(noise, -1, axis=0), 1, axis=1)
    weave = 0.5 * noise + 0.3 * warp + 0.2 * weft
    weave /= np.abs(weave).max() or 1.0

    raw = 128.0 + AMP * weave
    img = np.clip(np.round(raw / STEP) * STEP, 0, 255).astype(np.uint8)

    Image.fromarray(img, mode="L").convert("RGB").save(
        out_path, format="WEBP", lossless=True, quality=100, method=6
    )

    # Auto-verificación de los tres criterios de aceptación de la tarea 0.5.
    a = np.asarray(Image.open(out_path).convert("L")).astype(int)
    import os

    size = os.path.getsize(out_path)
    seam = (abs(a[0, :] - a[-1, :]).mean(), abs(a[:, 0] - a[:, -1]).mean())
    inner = (abs(a[1:, :] - a[:-1, :]).mean(), abs(a[:, 1:] - a[:, :-1]).mean())
    print(f"{out_path}: {a.shape[1]}x{a.shape[0]}, {size} bytes (limite 3072)")
    print(f"  niveles={len(np.unique(a))} rango={a.min()}-{a.max()}")
    print(
        f"  costura/gradiente-interno: v={seam[0] / inner[0]:.2f} "
        f"h={seam[1] / inner[1]:.2f} (<=1.35 = sin costura)"
    )
    ok = size <= 3072 and seam[0] <= inner[0] * 1.35 and seam[1] <= inner[1] * 1.35
    print("  VEREDICTO:", "ok" if ok else "FALLA")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "public/textures/baize-128.webp"))
