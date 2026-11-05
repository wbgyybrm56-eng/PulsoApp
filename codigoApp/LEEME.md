# PULSO Breath · código de la app

App 3D para ensayar entrevistas por voz con Marta. Tiene tres espacios: Frecuencia Base, Cámara de Calibración y Sala de Crisis. Mide muletillas, ritmo, tiempo de respuesta y contacto visual, y nunca infiere emociones.

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa en un solo archivo, lista para abrir. |
| `Abrir PULSO Breath.command` | Abre la app en `http://localhost:8091` para que Chrome recuerde los permisos de cámara y micrófono. Necesita Node.js. |
| `src/plantilla.html` | Estructura y estilos (HTML y CSS, diseño «Breath UI»). Tiene dos huecos: `{{ENGINE}}` y `{{WORLD}}`. |
| `src/motor-entrevista.js` | Motor de la entrevista: voz de Marta, reconocimiento de voz, silencio de 1,5 s, repreguntas contextuales, cámara, mirada calibrada e informe. |
| `src/mundo-3d.js` | Mundo 3D con Three.js: Electro, cuadrícula, cubo de cristal, diales, partículas, orbe, paneles curvos, HUD y vuelos de cámara. |
| `construir.py` | Une los tres archivos de `src/` y vuelve a generar `index.html`. |

## Cómo abrirla

1. Haz doble clic en **Abrir PULSO Breath.command**. Si macOS la bloquea la primera vez, haz clic derecho y elige «Abrir».
2. Usa Chrome o Edge y acepta el permiso de cámara y, cuando respondas la primera pregunta, el de micrófono.
3. Hace falta internet: Three.js, MediaPipe y las tipografías se cargan desde sus CDN, y el reconocimiento de voz de Chrome funciona en línea.

Si abres `index.html` con doble clic también funciona, pero el navegador pedirá los permisos cada vez.

## Cómo modificarla

1. Edita el archivo de `src/` que necesites.
2. En la Terminal, dentro de esta carpeta, ejecuta:
   ```bash
   python3 construir.py
   ```
3. Recarga la app en el navegador.

Si quieres que Marta redacte sus repreguntas con Gemini, escribe tu clave en `GEMINI_API_KEY`, al principio de `src/motor-entrevista.js`. Úsala solo en tu ordenador: cualquiera que abra la página puede ver la clave.

## Cómo se comunican las dos partes

El motor de la entrevista emite eventos que el mundo 3D escucha:

| Evento | Cuándo |
|---|---|
| `pulso:phase` | Marta habla (`asking`), escucha (`listening`) o piensa (`thinking`). |
| `pulso:bump` | Cada palabra que dice Marta: el orbe vibra y emite una onda. |
| `pulso:say` | Texto de cada intervención de Marta, para su panel. |
| `pulso:live` | Métricas en directo para el HUD, cinco veces por segundo. |
| `pulso:att` | Estado de la mirada: OK, fuera de cámara, sin rostro o calibrando. |
| `pulso:camera` | La cámara se enciende o se apaga. |
| `pulso:interrupt` | Marta interrumpe: las partículas se aceleran. |
| `pulso:done` | Fin de la entrevista: se guarda la sesión en el Electro y se vuelve a Frecuencia Base. |

La configuración de la Cámara de Calibración (hostilidad, voz y velocidad) se guarda en `window.PULSO_CFG`, y el motor la lee al empezar.

## Datos y privacidad

- El audio y el vídeo no salen del navegador. La mirada se calcula en tu ordenador.
- El historial del Electro y la configuración se guardan solo en ese navegador (`localStorage`).
- Herramienta para mayores de 18 años. No pone notas ni infiere emociones (artículo 5.1.f del Reglamento Europeo de IA).
