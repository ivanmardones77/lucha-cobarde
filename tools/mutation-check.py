#!/usr/bin/env python3
"""Prueba de mutación para test/golden.test.ts: cambia uno a uno los números decimales de un archivo
(×1,1) y comprueba que el test dorado falla. Los que SOBREVIVEN son cambios que ningún test detecta.

Uso:  python3 tools/mutation-check.py [src/core/simulation.ts]
Tarda unos minutos (una ejecución de test por número). Restaura el archivo al terminar.

Qué esperar en simulation.ts (28-11-2026): ~102 muertos y ~114 supervivientes. De los supervivientes,
~87 son números de efectos visuales (chispas, escala, ángulo, temblor) que `hashState` ignora a propósito
(los eventos no entran en el hash) y varios son valores iniciales que la intro sobrescribe. No lo uses
en CI: sirve para comprobar la red de seguridad antes de una refactorización grande.
"""
import re
import subprocess
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'src/core/simulation.ts'
orig = open(path).read()
pat = re.compile(r'(?<![\w.])(\d+\.\d+)(?![\w.])')
lines = orig.split('\n')
survivors, killed = [], 0
try:
    for m in pat.finditer(orig):
        ln = orig.count('\n', 0, m.start()) + 1
        text = lines[ln - 1]
        if text.strip().startswith(('//', '*')):
            continue
        mutated = orig[: m.start()] + repr(round(float(m.group(1)) * 1.1 + 0.001, 6)) + orig[m.end():]
        open(path, 'w').write(mutated)
        r = subprocess.run(['npx', 'tsx', 'test/golden.test.ts'], capture_output=True, text=True)
        if r.returncode != 0:
            killed += 1
        else:
            survivors.append((ln, m.group(1), text.strip()[:90]))
finally:
    open(path, 'w').write(orig)

print('muertos', killed, 'sobreviven', len(survivors))
for s in survivors:
    print(s)
