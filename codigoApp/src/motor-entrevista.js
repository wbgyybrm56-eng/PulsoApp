/* PULSO Breath · Motor de la entrevista
   Voz de Marta (síntesis de voz del navegador), reconocimiento de voz, detección de silencio (1,5 s),
   preguntas y repreguntas contextuales, cámara y mirada (MediaPipe Face Landmarker), informe final.
   Se comunica con el mundo 3D mediante eventos «pulso:*» (phase, bump, say, live, att, camera, interrupt, done, abort).
   Opcional: GEMINI_API_KEY al principio del archivo para que Marta redacte las repreguntas con Gemini. */

  (function () {
    'use strict';
    var root = document.getElementById('dim-sala');
    if (!root) return;

    /* =====================================================
       CONFIGURACIÓN (puedes cambiar textos, tiempos y reglas)
       ===================================================== */
    /* Opcional: con una clave de Gemini, Marta redacta sus repreguntas en tiempo real.
       Vacía, se usa el motor contextual local. AVISO: una clave escrita aquí la puede
       ver cualquiera que abra la página. Úsala solo en tu ordenador; nunca la publiques. */
    var GEMINI_API_KEY = '';
    var GEMINI_MODEL = 'gemini-2.5-flash';
    var GEMINI_TIMEOUT_MS = 6000;

    var BOT = 'Marta';
    var SILENCE_MS = 1500;          // silencio que da por terminada una respuesta
    var SILENCE_SHORT_MS = 2300;    // si solo llevas 2 o 3 palabras («Pues…»), se espera un poco más
    var ONE_WORD_MS = 4000;         // si solo has dicho una palabra («Ana», «no»), se espera algo más
    var NO_SPEECH_MS = 20000;       // sin hablar en absoluto
    var MAX_TURN_S = 120;           // máximo por respuesta
    var MAX_FOLLOWUPS = 5;          // preguntas de seguimiento (se ajusta con la hostilidad)
    function CFG() { return window.PULSO_CFG || {}; }
    function hostility() { return clamp(Math.round(CFG().hostility || 5), 1, 10); }
    function emit(name, detail) { try { document.dispatchEvent(new CustomEvent('pulso:' + name, { detail: detail })); } catch (e) { /* sin eventos */ } }

    var GAZE_EVENT_MS = 1000;       // un desvío de más de 1 s cuenta como desvío de mirada
    var GAZE_LONG_MS = 3500;        // un desvío de más de 3,5 s seguidos: Marta lo comenta
    var CAM_SAMPLE_MS = 200;        // 5 análisis por segundo

    var F1 = ['eh', 'em', 'mmm', 'este', 'bueno', 'pues', 'vale', 'nada', 'digamos', 'básicamente'];
    var F2 = ['o sea', 'en plan', 'es que', 'como que', 'a ver', 'la verdad', 'pues eso'];
    var HEDGES = ['creo que', 'supongo', 'quizás', 'quizá', 'a lo mejor', 'tal vez', 'más o menos', 'un poco', 'no sé', 'puede que'];

    function hasExample(x) { return /\d/.test(x) || /por ejemplo|proyecto|prácticas|cuando\s|una vez|logré|conseguí|aprendí|entregué/.test(x); }

    /* ---------- Guion de la entrevista ---------- */
    var STAGES = [
      { id: 'name', label: 'Inicio', noEval: true,
        q: 'Hola, gracias por venir. Soy ' + BOT + ', de selección de personal. Antes de empezar, ¿cómo te llamas?' },
      { id: 'intro', label: 'Presentación',
        q: 'Encantada{n}. Para empezar, cuéntame un poco sobre ti: quién eres y a qué te dedicas.' },
      { id: 'motivation', label: 'Motivación',
        q: '¿Por qué te interesa este puesto?',
        follow: [{ when: function (t, r, x) { return !/empresa|vuestr|vosotros|compañía|sector|marca/.test(x); },
                   lead: 'Me gustaría algo más concreto.', q: '¿Qué sabes de nuestra empresa y qué es lo que más te atrae de ella?' }] },
      { id: 'strengths', label: 'Puntos fuertes', example: true,
        q: 'Y dime, ¿cuáles dirías que son tus puntos fuertes?',
        follow: [{ when: function (t, r, x) { return !hasExample(x); },
                   lead: 'Suena bien.', q: '¿Me puedes poner un ejemplo concreto en el que hayas demostrado esa cualidad?' }] },
      { id: 'challenge', label: 'Situación difícil', example: true,
        q: 'Cuéntame una situación difícil que hayas vivido, en los estudios o en el trabajo, y cómo la resolviste.',
        follow: [{ when: function (t, r, x) { return !/resultado|conseguí|conseguimos|logr|al final|solucion|resolv|terminó|acabó|aprend/.test(x); },
                   lead: 'Entiendo.', q: '¿Y cómo terminó la situación? ¿Qué resultado tuvo y qué aprendiste?' }] },
      { id: 'weakness', label: 'Debilidad',
        q: 'Y al contrario, ¿cuál dirías que es tu mayor debilidad?',
        follow: [{ when: function (t, r, x) { return /ninguna|perfeccionis|trabajo demasiado|exigente conmigo/.test(x); },
                   lead: 'Todos tenemos alguna.', q: '¿Podrías contarme una debilidad real y qué estás haciendo para mejorarla?' }] },
      { id: 'future', label: 'Futuro',
        q: '¿Dónde te ves dentro de cinco años?' },
      { id: 'closing', label: 'Cierre', closing: true, lenient: true,
        q: 'Para terminar, ¿tienes alguna pregunta para nosotros?' }
    ];

    /* ---------- Ganchos: temas que Marta recoge citando tus palabras ----------
       {t} se sustituye por la palabra exacta que has dicho. */
    var L = 'a-záéíóúüñ';
    function rx(body) { return new RegExp('(?:^|[^0-9' + L + '])(' + body + ')(?![0-9' + L + '])', 'i'); }
    var W = '[' + L + ']*';
    var HOOKS = [
      { id: 'metric', re: rx('\\d+(?:[.,]\\d+)?\\s*(?:%|por ciento)'), lead: ['Has dado una cifra, {t}.', 'Me quedo con ese {t}.'], q: ['¿Cómo lo medisteis y qué parte de ese resultado es mérito tuyo?', '¿Con qué dato partíais y qué hiciste tú para llegar ahí?'] },
      { id: 'achievement', re: rx('logr' + W + '|consegu' + W + '|premio' + W + '|ganamos|gané|récord|superé'), lead: ['Dices «{t}».', 'Eso de «{t}» suena a resultado.'], q: ['¿Qué hiciste tú, en concreto, para que saliera así?', '¿Qué fue lo más difícil de conseguirlo?'] },
      { id: 'failure', re: rx('fall[éo]' + W + '|fracas' + W + '|error' + W + '|me equivoqué|salió mal|no salió'), lead: ['Hablas de «{t}».', 'Has mencionado «{t}», y me interesa.'], q: ['¿Qué cambiarías hoy si te volviera a pasar?', '¿Cómo lo detectaste y qué hiciste después?'] },
      { id: 'team', re: rx('equipo' + W + '|grupo de trabajo|compañeros|colabor' + W), lead: ['Hablas de «{t}».', 'Mencionas «{t}».'], q: ['¿Cuál era exactamente tu papel ahí y cómo resolvíais los desacuerdos?', '¿Cuántos erais y qué te tocaba a ti?'] },
      { id: 'lead', re: rx('lider' + W + '|coordin' + W + '|dirig' + W + '|responsable de|a cargo de'), lead: ['Dices «{t}».', 'Has hablado de «{t}».'], q: ['¿Cómo conseguiste que el resto te siguiera cuando las cosas se complicaron?', '¿A cuántas personas y con qué resultado?'] },
      { id: 'exp', re: rx('prácticas|becari' + W + '|experiencia|trabajé|he trabajado'), lead: ['Mencionas «{t}».', 'Sobre «{t}»…'], q: ['¿Qué logro concreto de esa etapa contarías primero?', '¿Qué aprendiste ahí que no te enseñaron en clase?'] },
      { id: 'study', re: rx('grado|carrera|máster|master|universidad|facultad|ciclo formativo|fp'), lead: ['Has hablado de tu {t}.', 'Sobre tu {t}…'], q: ['¿Qué asignatura o proyecto de ahí te sirve más para este puesto?', '¿Por qué elegiste esa formación?'] },
      { id: 'thesis', re: rx('tfg|tfm|tesis|trabajo de fin de ' + W), lead: ['Mencionas tu {t}.', 'Lo de tu {t} me interesa.'], q: ['¿Cuál fue la conclusión principal, en una frase?', '¿Qué decisión de método tomaste y por qué?'] },
      { id: 'project', re: rx('proyecto' + W), lead: ['Has hablado de un {t}.', 'Sobre ese {t}…'], q: ['¿Cuál era el objetivo y qué parte llevabas tú?', '¿Qué salió distinto de lo que habíais planeado?'] },
      { id: 'money', re: rx('presupuesto' + W + '|coste' + W + '|ahorr' + W + '|euros|facturación|beneficio' + W), lead: ['Hablas de {t}.', 'Mencionas «{t}».'], q: ['¿De qué cantidad hablamos y cómo la controlabas?', '¿Qué decisión tomaste tú que afectó a esa cifra?'] },
      { id: 'client', re: rx('cliente' + W + '|usuario' + W + '|consumidor' + W), lead: ['Mencionas a los {t}.', 'Hablas de «{t}».'], q: ['¿Qué te pidió ese cliente y cómo respondiste?', '¿Cómo sabías si estaban satisfechos?'] },
      { id: 'service', re: rx('atención al cliente|queja' + W + '|reclamaci' + W), lead: ['Hablas de «{t}».', 'Lo de «{t}»…'], q: ['¿Cuál fue la queja más difícil que gestionaste y cómo acabó?', '¿Qué haces cuando el cliente no tiene razón?'] },
      { id: 'sales', re: rx('ventas|vend' + W + '|comercial' + W + '|captación'), lead: ['Hablas de {t}.', 'Mencionas «{t}».'], q: ['¿Con qué objetivo trabajabas y lo cumpliste?', '¿Cómo preparas una venta difícil?'] },
      { id: 'conflict', re: rx('conflicto' + W + '|discusi' + W + '|desacuerdo' + W + '|choque' + W + '|tensión'), lead: ['Hablas de «{t}».', 'Mencionas un {t}.'], q: ['¿Qué dijiste tú exactamente para desbloquearlo?', '¿Cómo quedó la relación con esa persona después?'] },
      { id: 'deadline', re: rx('plazo' + W + '|fecha de entrega|entrega' + W + '|a tiempo|contrarreloj|deadline'), lead: ['Mencionas «{t}».', 'Hablas de «{t}».'], q: ['¿Qué dejaste fuera para llegar y quién lo decidió?', '¿Cómo te organizaste para cumplirlo?'] },
      { id: 'pressure', re: rx('presión|estrés|agobi' + W + '|urgen' + W), lead: ['Hablas de «{t}».', 'Dices «{t}».'], q: ['¿Qué haces en concreto para seguir rindiendo en esas situaciones?', '¿Cuál fue el momento de más presión y qué hiciste?'] },
      { id: 'tool', re: rx('excel|python|sql|java|javascript|power bi|tableau|figma|sap|salesforce|photoshop|canva|autocad|hubspot|wordpress|notion|jira'), lead: ['Mencionas {t}.', 'Has hablado de {t}.'], q: ['¿Para qué lo usaste exactamente y qué resultado obtuviste?', '¿Qué nivel tienes y cómo lo demostrarías aquí?'] },
      { id: 'data', re: rx('datos|análisis|analicé|estadística' + W + '|informe' + W + '|métrica' + W), lead: ['Hablas de {t}.', 'Mencionas «{t}».'], q: ['¿Qué conclusión sacaste de esos datos y qué cambió gracias a ella?', '¿Qué dato te sorprendió más?'] },
      { id: 'research', re: rx('investigaci' + W + '|encuesta' + W + '|laboratorio|experimento' + W), lead: ['Mencionas «{t}».', 'Hablas de «{t}».'], q: ['¿Cuál fue la pregunta que querías responder y qué encontraste?', '¿Qué harías distinto en el diseño?'] },
      { id: 'lang', re: rx('inglés|francés|alemán|italiano|chino|idioma' + W + '|bilingüe'), lead: ['Mencionas el {t}.', 'Hablas de {t}.'], q: ['¿Lo has usado en una situación real de trabajo? Cuéntame cómo fue.', '¿Qué nivel tienes y cómo lo acreditas?'] },
      { id: 'abroad', re: rx('erasmus|extranjero|intercambio|viví en|me fui a'), lead: ['Hablas de «{t}».', 'Lo de «{t}»…'], q: ['¿Qué fue lo que más te costó adaptarte allí?', '¿Qué te trajiste de esa experiencia para trabajar?'] },
      { id: 'volunteer', re: rx('voluntari' + W + '|ong|asociación'), lead: ['Mencionas «{t}».', 'Hablas de {t}.'], q: ['¿Qué responsabilidad tenías y qué conseguisteis?', '¿Por qué decidiste dedicarle tiempo?'] },
      { id: 'sport', re: rx('deporte' + W + '|fútbol|baloncesto|competici' + W + '|entrenador' + W + '|federad' + W), lead: ['Hablas de {t}.', 'Mencionas «{t}».'], q: ['¿Qué te ha enseñado eso que apliques al trabajo?', '¿Cómo gestionas perder?'] },
      { id: 'entrepreneur', re: rx('emprend' + W + '|startup|mi propio negocio|fundé|cofundador' + W), lead: ['Dices «{t}».', 'Lo de «{t}» me interesa.'], q: ['¿Qué funcionó, qué no y qué cifras tenías?', '¿Por qué ahora quieres trabajar en una empresa?'] },
      { id: 'communication', re: rx('presentaci' + W + '|hablar en público|expuse|exponer|comunicaci' + W), lead: ['Hablas de «{t}».', 'Mencionas «{t}».'], q: ['¿Ante quién fue y qué querías conseguir?', '¿Qué pregunta difícil te hicieron y qué respondiste?'] },
      { id: 'planning', re: rx('organiz' + W + '|planific' + W + '|prioridad' + W + '|agenda'), lead: ['Dices «{t}».', 'Hablas de «{t}».'], q: ['¿Cómo decides qué va primero cuando todo es urgente?', '¿Qué herramienta o método usas?'] },
      { id: 'change', re: rx('cambio' + W + '|adapt' + W + '|me mudé'), lead: ['Mencionas «{t}».', 'Hablas de «{t}».'], q: ['¿Qué fue lo más difícil de ese cambio y cómo lo resolviste?', '¿Qué hiciste la primera semana?'] },
      { id: 'learning', re: rx('aprendí|curso' + W + '|certificaci' + W + '|autodidacta'), lead: ['Dices «{t}».', 'Mencionas «{t}».'], q: ['¿Dónde lo has aplicado ya?', '¿Qué es lo próximo que quieres aprender?'] },
      { id: 'creativity', re: rx('creativ' + W + '|idea' + W + '|innov' + W + '|diseñ' + W), lead: ['Hablas de «{t}».', 'Lo de «{t}»…'], q: ['¿Qué idea concreta propusiste y llegó a aplicarse?', '¿Cómo convenciste a los demás?'] }
    ];
    var HOOK_STAGES = ['intro', 'motivation', 'strengths', 'challenge', 'weakness', 'future'];

    var VERB_RE = new RegExp('(?:^|[^' + L + '])(lideré|dirigí|coordiné|organicé|diseñé|creé|desarrollé|implanté|implementé|lancé|gestioné|negocié|vendí|conseguí|logré|reduje|aumenté|mejoré|automaticé|resolví|propuse|presenté|monté|programé|analicé|formé|ayudé|hice|entregué|superé|gané|decidí|cambié|convencí)(?![' + L + '])', 'gi');
    var STOP = ('a al algo algún alguna alguno ante antes así aunque bastante bien cada casi como con cosa cosas creo cual cuando de del desde donde dos e el ella ellos en entonces era eran es esa ese eso esta estaba este esto estoy fue fui ha había hace hacer he hemos hice la las le les lo los más me mi mis mucho muy nada ni no nos o otra otro para pero poco por porque que qué se sea ser si sí sin sobre soy su sus también tan tanto te tenía tengo todo todos tu un una uno unos y ya yo eh em mmm pues bueno vale').split(' ');
    var FIELDS = [
      [/\bade\b|administración de empresas|empresariales/, 'la administración de empresas'],
      [/marketing|publicidad/, 'el marketing'],
      [/ingenier/, 'la ingeniería'],
      [/informátic|programaci|software/, 'la informática'],
      [/derecho|jurídic/, 'el derecho'],
      [/diseñ/, 'el diseño'],
      [/psicolog/, 'la psicología'],
      [/educación|magisterio|docen|profesor/, 'la educación'],
      [/enfermer|sanidad|medicin/, 'la salud'],
      [/econom|finanzas|contabilidad/, 'la economía y las finanzas'],
      [/comunicaci|periodis/, 'la comunicación']
    ];
    /* Reacciones y conectores (se van rotando para no repetirse) */
    var ACKS = ['Vale, entiendo.', 'De acuerdo.', 'Muy bien.', 'Gracias, me ha quedado claro.', 'Perfecto, tomo nota.', 'Interesante.', 'Entendido.', 'Me sirve, gracias.', 'Bien visto.', 'Lo apunto.', 'Te sigo.', 'Claro.', 'Eso es útil saberlo.', 'Muy interesante, gracias.', 'Bien.', 'Gracias por concretar.'];
    var BRIDGES = ['Cambiemos de tema.', 'Pasemos a otra cosa.', 'Vamos con la siguiente.', 'Sigamos.', 'Te pregunto otra cosa.', 'Ahora, otra pregunta.', 'Avancemos.', 'Siguiente punto.'];
    var R_NUM = ['Me quedo con esa cifra: {t}.', 'Bien, una cifra concreta: {t}.', '{t}: eso se recuerda.'];
    var R_VERB = ['Dices que {t}; eso es lo que quería oír.', 'Que {t} cuenta mucho.', 'Bien, {t} tú.'];
    var R_NAME = ['Lo de {t} me interesa.', 'Apunto lo de {t}.'];
    var PULL = ['Te has quedado en «{t}». ¿Qué hiciste exactamente ahí?', 'Espera, sigue con lo de «{t}». ¿Qué pasó después?', 'Has empezado a hablar de «{t}». Cuéntame un poco más, con algún detalle.', 'Vuelve a «{t}», por favor. ¿Cuál fue tu papel?'];
    var PULL_GENERIC = ['Cuéntame un poco más, por favor. Me gustaría que te explayaras con algún detalle o ejemplo.', 'Dame algo más de detalle: ¿qué hiciste tú, en concreto?'];
    var CAM_REMARKS = ['Por cierto, has apartado la vista de la cámara un buen rato. Mírame cuando respondas y centrémonos en esto.', 'Un apunte: llevas un rato mirando fuera de la cámara. Vuelve a mirarme y sigamos.'];

    /* =====================================================
       UTILIDADES
       ===================================================== */
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function num(n, d) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function clock(sec) { var s = Math.floor(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function norm(w) { return w.toLowerCase().replace(/[.,;:¿?¡!"«»()]/g, ''); }
    function join() { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); }
    function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
    function countWords(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    var rot = {};
    function pick(key, list) { rot[key] = (rot[key] || 0) + 1; return list[(rot[key] - 1) % list.length]; }
    function fill(tpl, t) { return tpl.replace(/\{t\}/g, t); }

    function tokenize(text) {
      var raw = text.split(/\s+/).filter(Boolean), out = [];
      for (var i = 0; i < raw.length; i++) {
        var n = norm(raw[i]), nx = raw[i + 1] ? norm(raw[i + 1]) : '';
        if (nx && F2.indexOf(n + ' ' + nx) !== -1) {
          out.push({ text: raw[i] + ' ' + raw[i + 1], key: n + ' ' + nx, filler: true, words: 2 });
          i++; continue;
        }
        out.push({ text: raw[i], key: n, filler: F1.indexOf(n) !== -1, words: 1 });
      }
      return out;
    }

    function paintInto(node, text) {
      node.innerHTML = tokenize(text).map(function (t) {
        return t.filler ? ' <span class="filler">' + esc(t.text) + '</span>' : ' ' + esc(t.text);
      }).join('');
    }

    /* ---------- Lectura del contenido de cada respuesta ----------
       Extrae cifras, verbos de acción, nombres propios, temas (ganchos)
       y la última idea mencionada, para que Marta pueda citarlos. */
    function analyze(text) {
      var o = { nums: [], verbs: [], names: [], hooks: [], last: '', trait: '' };
      var m, re = /(\d+(?:[.,]\d+)?)\s*(%|por ciento|euros?|€|mil|millones|clientes|personas|usuarios|alumnos|meses|años|semanas|días|horas|ventas|proyectos|empleados)?/gi;
      while ((m = re.exec(text))) o.nums.push({ t: m[0].trim(), i: m.index });
      VERB_RE.lastIndex = 0;
      while ((m = VERB_RE.exec(text))) o.verbs.push({ t: m[1].toLowerCase(), i: m.index });
      var words = text.split(/\s+/), pos = 0;
      words.forEach(function (w, k) {
        var clean = w.replace(/[.,;:¿?¡!"«»()]/g, '');
        var prev = k > 0 ? words[k - 1] : '';
        if (k > 0 && !/[.?!]$/.test(prev) && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(clean) && STOP.indexOf(clean.toLowerCase()) === -1 && clean !== S.name) o.names.push({ t: clean, i: text.indexOf(w, pos) });
        pos += w.length + 1;
      });
      HOOKS.forEach(function (h) {
        var mm = h.re.exec(text);
        if (mm) o.hooks.push({ hook: h, t: mm[1].trim(), i: mm.index + mm[0].length - mm[1].length });
      });
      o.hooks.sort(function (a, b) { return a.i - b.i; });
      var tr = text.toLowerCase().match(new RegExp('(?:soy|me considero|mi punto fuerte es|destacaría (?:mi|la|el))\\s+([' + L + ']{4,}(?:\\s+y\\s+[' + L + ']{4,})?)'));
      if (tr) o.trait = tr[1];
      var cands = [].concat(o.hooks, o.names, o.nums).sort(function (a, b) { return b.i - a.i; });
      if (cands.length) o.last = cands[0].t;
      else {
        var sent = text.split(/[.?!]/).filter(function (s) { return s.trim(); }).pop() || '';
        var content = sent.split(/\s+/).map(norm).filter(function (w) { return w.length > 3 && STOP.indexOf(w) === -1 && F1.indexOf(w) === -1; });
        o.last = content.slice(-2).join(' ');
      }
      return o;
    }

    /* =====================================================
       ESTADO Y ELEMENTOS
       ===================================================== */
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var S = {
      run: 0, phase: 'idle', stageIdx: 0, stage: null, isFollow: false, name: '', turns: [], log: [],
      recog: null, recogAlive: false, ignoreMic: true, resLen: 0, silenceTimer: null,
      media: null, turn: null, tickId: null, startTs: 0,
      followUsed: {}, followTotal: 0, hooksUsed: {}, pulled: {}, needDetail: 0, calmUsed: 0, noSpeech: 0, camRemarks: 0
    };

    var el = {
      chat: $('pe-chat'), empty: $('pe-empty'), stageLabel: $('pe-stageLabel'),
      live: $('pe-live'), liveDot: $('pe-liveDot'), liveLabel: $('pe-liveLabel'),
      startWrap: $('pe-startWrap'), start: $('pe-start'), startLabel: $('pe-start-label'),
      answerWrap: $('pe-answerWrap'), answer: $('pe-answer'), end: $('pe-end'),
      voice: $('pe-voice'), voiceBox: $('pe-voiceBox'), note: $('pe-note'), timer: $('pe-timer'),
      idle: $('pe-idle'), prog: $('pe-prog'), progText: $('pe-progText'), report: $('pe-report'),
      video: $('pe-video'), camOff: $('pe-camOff'), att: $('pe-att'), attDot: $('pe-attDot'), attLabel: $('pe-attLabel'), permSt: $('pe-permStatus')
    };
    var NOTE_DEFAULT = el.note.textContent;
    var PERM_DEFAULT = el.permSt.textContent;
    var avatar = $('pe-avatar');
    /* El punto de Marta se mueve un poco con cada palabra que dice */
    var DOT = { level: 0, raf: 0 };
    var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function dotBump() { emit('bump'); DOT.level = Math.min(1, DOT.level + 0.55); if (!DOT.raf) DOT.raf = requestAnimationFrame(dotFrame); }
    function dotFrame(ts) {
      var talking = S.phase === 'asking';
      DOT.level *= 0.9;
      var sway = talking ? Math.sin(ts / 170) : 0;
      var k = REDUCED ? 0.35 : 1;
      var scale = 1 + k * (0.12 * DOT.level + 0.03 * sway);
      var y = REDUCED ? 0 : -5 * DOT.level + 1.5 * sway;
      avatar.style.transform = 'translateY(' + y.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';
      if (talking || DOT.level > 0.01) DOT.raf = requestAnimationFrame(dotFrame);
      else { DOT.raf = 0; DOT.level = 0; avatar.style.transform = ''; }
    }
    function note(t) { el.note.textContent = t; }

    var hasTTS = ('speechSynthesis' in window) && typeof window.SpeechSynthesisUtterance === 'function';
    if (!hasTTS) { el.voiceBox.classList.add('hidden'); }
    function voiceOn() { return hasTTS && !!el.voice.checked; }

    var PROTO = ''; try { PROTO = window.location.protocol; } catch (e) { /* sin acceso */ }
    function permissionMsg() {
      if (PROTO === 'file:') return 'El navegador suele bloquear el micrófono en archivos abiertos desde el ordenador (file://). Abre la página desde localhost o desde una web con HTTPS.';
      return 'No se ha concedido acceso al micrófono. Revisa el permiso del sitio en el navegador y el del sistema, y vuelve a intentarlo.';
    }

    /* El micrófono de la demo de arriba no puede usarse a la vez que este */
    var demoBtn = $('btnMic'), demoWasDisabled = null;
    function demoMicBusy() { var l = $('btnMicLabel'); return !!(l && l.textContent === 'Detener'); }
    function lockDemoMic(on) {
      if (!demoBtn) return;
      if (on) { if (demoWasDisabled === null) { demoWasDisabled = demoBtn.disabled; } demoBtn.disabled = true; }
      else if (demoWasDisabled !== null) { demoBtn.disabled = demoWasDisabled; demoWasDisabled = null; }
    }

    /* =====================================================
       INTERFAZ
       ===================================================== */
    function bubble(who) {
      var d = document.createElement('div');
      d.className = 'fade-in mt-5';
      if (who === 'me') { d.style.borderLeft = '3px solid var(--accent)'; d.style.paddingLeft = '14px'; }
      var l = document.createElement('p');
      l.className = 't-small font-semibold muted';
      l.textContent = who === 'bot' ? BOT + ' · entrevistadora' : 'Tú';
      var p = document.createElement('p');
      p.className = who === 'bot' ? 'serif italic text-[22px] sm:text-[24px] leading-snug mt-1' : 'serif text-[21px] sm:text-[23px] leading-[1.65] mt-1';
      d.appendChild(l); d.appendChild(p);
      el.chat.appendChild(d);
      el.chat.scrollTop = el.chat.scrollHeight;
      return p;
    }

    function setLive() {
      var show = S.phase === 'asking' || S.phase === 'listening' || S.phase === 'thinking';
      el.live.classList.toggle('hidden', !show); el.live.classList.toggle('flex', show);
      var label = { asking: BOT + ' está hablando', listening: 'Te escucho', thinking: BOT + ' te ha escuchado…' }[S.phase] || '';
      el.liveLabel.textContent = label;
      el.liveDot.style.background = S.phase === 'listening' ? 'var(--accent)' : 'var(--ink)';
      el.liveDot.classList.toggle('pulse-dot', S.phase === 'listening');
      el.answerWrap.classList.toggle('hidden', S.phase !== 'listening');
      avatar.classList.toggle('talking', S.phase === 'asking');
      if (S.phase === 'asking') dotBump();
      emit('phase', S.phase);
    }

    function setButtons(running) {
      el.startWrap.classList.toggle('hidden', running);
      el.end.classList.toggle('hidden', !running);
      if (!running) el.answerWrap.classList.add('hidden');
    }

    function setProgress() {
      var total = STAGES.length;
      el.prog.style.width = clamp((S.stageIdx / (total - 1)) * 100, 4, 100) + '%';
      el.progText.textContent = 'pregunta ' + (S.stageIdx + 1) + ' de ' + total;
    }

    /* =====================================================
       VOZ DE LA ENTREVISTADORA
       ===================================================== */
    function later(fn, ms) {
      var run = S.run;
      setTimeout(function () { if (S.run === run) fn(); }, ms);
    }

    function typeInto(p, text, run) {
      var i = 0, tm;
      function step() { if (S.run !== run) return; var prev = text.charAt(i - 1); i = Math.min(text.length, i + 1); if (i === 1 || /[\s,.;:¿?¡!]/.test(prev)) dotBump(); p.textContent = text.slice(0, i); el.chat.scrollTop = el.chat.scrollHeight; if (i < text.length) tm = setTimeout(step, 62); }
      step();
      return { sync: function (c) { if (c > i) i = Math.min(text.length, c); }, finish: function () { clearTimeout(tm); i = text.length; p.textContent = text; } };
    }
    function speak(text, cb, run, tw) {
      var done = false, fb;
      function once() { if (done) return; done = true; clearTimeout(fb); if (tw) tw.finish(); if (S.run === run) cb(); }
      if (!voiceOn()) { fb = setTimeout(once, tw ? text.length * 62 + 400 : 700); return; }
      try {
        window.speechSynthesis.cancel();
        var u = new window.SpeechSynthesisUtterance(text);
        u.lang = 'es-ES';
        var vs = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        var pref = CFG().voiceURI, pv = pref ? vs.filter(function (v) { return v.voiceURI === pref; })[0] : null;
        if (pv) u.voice = pv; else { for (var i = 0; i < vs.length; i++) { if (/^es(-|_|$)/i.test(vs[i].lang)) { u.voice = vs[i]; break; } } }
        u.rate = CFG().rate || 1;
        u.onend = once; u.onerror = once; u.onboundary = function (e) { dotBump(); if (tw) tw.sync(e.charIndex + (e.charLength || 5)); };
        fb = setTimeout(once, Math.max(4000, text.length * 90 + 2500));
        window.speechSynthesis.speak(u);
      } catch (e) { fb = setTimeout(once, 700); }
    }

    /* =====================================================
       RECONOCIMIENTO DE VOZ: una sola instancia para toda la entrevista
       ===================================================== */
    function createRecognizer() {
      var run = S.run;
      var r = new SR();
      r.lang = 'es-ES'; r.continuous = true; r.interimResults = true;
      S.recog = r; S.resLen = 0; S.lastResults = null;

      r.onresult = function (ev) {
        if (S.run !== run) return;
        S.resLen = ev.results.length; S.lastResults = ev.results;
        var t = S.turn;
        if (S.ignoreMic || !t || !t.open) return;   // Marta habla o piensa: se descarta lo que llegue
        var fin = '', interim = '';
        /* Si al empezar tu turno Chrome tenía una frase a medias (un eco o el final de tu respuesta anterior)
           y sigue escribiendo en ella, lo nuevo que añade es tuyo: se recoge en vez de perderlo. */
        if (t.snapIdx != null && t.snapIdx < ev.results.length) {
          var cur = ev.results[t.snapIdx][0].transcript, sn = t.snapText || '', p = 0;
          while (p < cur.length && p < sn.length && cur.charAt(p) === sn.charAt(p)) p++;
          var extra = cur.length > sn.length + 1 ? cur.slice(p).trim() : '';
          if (extra) { if (ev.results[t.snapIdx].isFinal) fin += ' ' + extra; else interim += ' ' + extra; }
        }
        for (var k = t.base; k < ev.results.length; k++) {
          if (ev.results[k].isFinal) fin += ' ' + ev.results[k][0].transcript;
          else interim += ' ' + ev.results[k][0].transcript;
        }
        var finalText = (t.carry + ' ' + fin).trim();
        if (!(finalText + interim).trim()) return;
        var now = Date.now();
        if (!t.firstTs) t.firstTs = now; else if (now - t.lastTs > 2000) t.pauses++;
        t.lastTs = now;
        t.finalText = finalText; t.interim = interim.trim();
        if (!t.node) t.node = bubble('me');
        paintInto(t.node, join(t.finalText, t.interim));
        el.chat.scrollTop = el.chat.scrollHeight;
        /* Detección de silencio: cada palabra nueva reinicia la cuenta de 1,5 s */
        clearTimeout(S.silenceTimer);
        var words = countWords(join(t.finalText, t.interim));
        if (words >= 2) S.silenceTimer = setTimeout(function () { if (S.run === run && S.turn === t && t.open) endTurn(); }, words < 4 ? SILENCE_SHORT_MS : SILENCE_MS);
      };

      r.onerror = function (ev) {
        if (S.run !== run) return;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { S.recogAlive = false; abort(permissionMsg()); }
        else if (ev.error === 'network') { S.recogAlive = false; abort('El reconocimiento de voz necesita conexión a internet. Revisa tu conexión e inténtalo de nuevo.'); }
        /* 'no-speech' y 'aborted' no son fatales: onend reconecta */
      };

      /* El navegador cierra la sesión de reconocimiento cada cierto tiempo:
         se reabre sin tocar el micrófono ni la cámara. */
      r.onend = function () {
        if (S.run !== run || !S.recogAlive) return;
        var t = S.turn;
        if (t && t.open) { t.carry = join(t.finalText, t.interim); t.finalText = t.carry; t.interim = ''; t.base = 0; t.snapIdx = null; }
        S.resLen = 0;
        setTimeout(function () {
          if (S.run !== run || !S.recogAlive) return;
          try { r.start(); } catch (e) { /* ya estaba arrancado */ }
        }, 120);
      };

      S.recogAlive = true;
      r.start();
    }

    /* =====================================================
       DIÁLOGO: la entrevistadora habla y luego escucha
       ===================================================== */
    function nameSuffix() { return S.name ? ', ' + S.name : ''; }
    function fillQ(q) { return q.replace('{n}', nameSuffix()); }

    function botSay(text, stage, isFollow) {
      var run = S.run;
      S.stage = stage; S.isFollow = isFollow; S.phase = 'asking'; S.ignoreMic = true;
      el.stageLabel.textContent = stage.label + (isFollow ? ' · seguimiento' : '');
      setProgress(); setLive();
      S.log.push({ who: 'bot', text: text });
      emit('say', text);
      var tw = typeInto(bubble('bot'), text, run); S.tw = tw;
      speak(text, function () { listen(); }, run, tw);
    }

    function listen() {
      var lr = S.lastResults, openIdx = lr && S.resLen > 0 && lr[S.resLen - 1] && !lr[S.resLen - 1].isFinal ? S.resLen - 1 : null;
      var t = { stage: S.stage, isFollow: S.isFollow, finalText: '', interim: '', carry: '', base: S.resLen, snapIdx: openIdx, snapText: openIdx != null ? lr[openIdx][0].transcript : '', startTs: Date.now(), firstTs: 0, lastTs: 0, pauses: 0, open: true, node: null,
                camN: 0, camLook: 0, camOut: 0, camEvents: 0, camDirs: {}, longAway: false };
      t.afterInt = !!S.afterInt; S.afterInt = false; S.turn = t;
      S.phase = 'listening'; setLive();
      /* El permiso se pide aquí, cuando te toca responder por primera vez, y no al cargar ni al empezar */
      if (S.recog) { S.ignoreMic = false; return; }
      requestMedia(function () {
        t.startTs = Date.now();
        try { createRecognizer(); } catch (e) { abort('No se ha podido iniciar el reconocimiento de voz.'); return; }
        S.ignoreMic = false;
      });
    }

    function endTurn() {
      var t = S.turn;
      if (S.phase !== 'listening' || !t || !t.open) return;
      clearTimeout(S.silenceTimer);
      S.ignoreMic = true;
      turnDone();
    }

    function recordTurn(t, text) {
      t.open = false;
      t.text = text;
      t.end = t.lastTs ? Math.min(Date.now(), t.lastTs + 1500) : Date.now();
      if (!t.node) t.node = bubble('me');
      paintInto(t.node, text);
      t.r = evaluate(t);
      t.a = analyze(text);
      S.turns.push(t);
      S.log.push({ who: 'me', text: text });
    }

    function turnDone() {
      var t = S.turn;
      if (!t || !t.open) return;
      var text = join(t.finalText, t.interim).trim();
      if (!text) { t.open = false; handleSilence(); return; }
      recordTurn(t, text);
      S.noSpeech = 0;
      if (t.stage.id === 'name') S.name = extractName(text);
      decideNext(t);
    }

    function handleSilence() {
      S.noSpeech++;
      if (S.noSpeech >= 2) {
        if (S.turns.filter(function (x) { return !x.stage.noEval; }).length) { finishInterview(true); }
        else { abort('No se detecta tu voz. Comprueba el micrófono e inténtalo de nuevo.'); }
        return;
      }
      S.phase = 'thinking'; setLive();
      later(function () { botSay('Perdona, no te he oído bien. ¿Puedes responder otra vez, un poco más cerca del micrófono?', S.stage, S.isFollow); }, 500);
    }

    function extractName(text) {
      var t = text.trim().replace(/[.,!¡]/g, '');
      var m = t.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/i);
      var parts = t.split(/\s+/);
      var cand = m ? m[1] : (parts.length <= 2 ? parts[parts.length - 1] : '');
      if (!cand || cand.length < 2 || /^(hola|buenas|buenos|vale|sí|si|bueno|pues|eh|días|tardes)$/i.test(cand)) return '';
      return cand.charAt(0).toUpperCase() + cand.slice(1).toLowerCase();
    }

    /* ---------- Motor conversacional local: cita lo que acabas de decir ---------- */
    function pickFollowUp(t, x) {
      var stage = t.stage, r = t.r, a = t.a;
      if (S.followTotal >= MAX_FOLLOWUPS) return null;
      /* Respuesta breve o incompleta: Marta tira del hilo de la última idea */
      if (!stage.lenient && r.words < 15 && !S.pulled[stage.id]) {
        S.pulled[stage.id] = true; S.needDetail++;
        var q = a.last ? fill(pick('pull', PULL), a.last) : pick('pullg', PULL_GENERIC);
        return { lead: '', q: q };
      }
      if (t.isFollow || S.followUsed[stage.id]) return null;
      var list = stage.follow || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].when(t, r, x)) {
          var f = list[i];
          if (stage.id === 'strengths' && a.trait) return { lead: 'Dices que eres ' + a.trait + '.', q: f.q.replace('esa cualidad', 'que eres ' + a.trait) };
          if (a.hooks.length) return { lead: fill(a.hooks[0].hook.lead[0], a.hooks[0].t), q: f.q };
          return f;
        }
      }
      if (!S.hooksUsed.conf && (r.hedges.length >= 3 || /no sé|ni idea/.test(x))) {
        S.hooksUsed.conf = true;
        return { lead: 'Has dicho «' + (r.hedges[0] || 'no sé') + '» varias veces.', q: 'Si tuvieras que resumirlo en una frase, ¿por qué serías una buena opción para este puesto?' };
      }
      if (HOOK_STAGES.indexOf(stage.id) !== -1) {
        for (var h = 0; h < a.hooks.length; h++) {
          var hk = a.hooks[h];
          if (!S.hooksUsed[hk.hook.id]) {
            S.hooksUsed[hk.hook.id] = true;
            var v = (rot['h' + hk.hook.id] = (rot['h' + hk.hook.id] || 0) + 1) - 1;
            return { lead: fill(hk.hook.lead[v % hk.hook.lead.length], hk.t), q: hk.hook.q[(v + S.followTotal) % hk.hook.q.length] };
          }
        }
      }
      return null;
    }

    function reaction(t, x, willFollow) {
      var r = t.r, a = t.a, stage = t.stage;
      if (stage.noEval) return '';
      if (stage.id === 'intro' && !t.isFollow) {
        for (var i = 0; i < FIELDS.length; i++) { if (FIELDS[i][0].test(x)) return 'Entiendo, vienes del ámbito de ' + FIELDS[i][1] + '.'; }
      }
      if (r.words >= 15 && r.fillers / Math.max(r.seconds / 60, 0.2) >= 6 && S.calmUsed < 2) { S.calmUsed++; return 'Tranquilo' + (S.name ? ', ' + S.name : '') + ', no hay prisa.'; }
      if (r.words < 15 || willFollow) return '';
      var out;
      if (a.nums.length) out = fill(pick('rn', R_NUM), a.nums[a.nums.length - 1].t);
      else if (a.verbs.length) out = cap(fill(pick('rv', R_VERB), a.verbs[a.verbs.length - 1].t));
      else if (a.names.length) out = fill(pick('rnm', R_NAME), a.names[a.names.length - 1].t);
      else out = pick('ack', ACKS);
      return join(out, stage.closing ? '' : pick('br', BRIDGES));
    }

    function cameraRemark(t) {
      if (!t.longAway || S.camRemarks >= 2) return '';
      return CAM_REMARKS[S.camRemarks++];
    }

    function decideNext(t) {
      var stage = t.stage, x = t.text.toLowerCase();
      S.phase = 'thinking'; setLive();
      var camNote = cameraRemark(t);
      var fu = (!stage.noEval && !stage.closing) ? pickFollowUp(t, x) : null;
      var react = reaction(t, x, !!fu);
      var local = function () {
        if (fu) { S.followUsed[stage.id] = true; S.followTotal++; botSay(join(camNote, react, fu.lead, fu.q), stage, true); }
        else nextStage(join(camNote, react));
      };
      if (GEMINI_API_KEY && !stage.noEval && !stage.closing) {
        var run = S.run;
        askGemini(t, camNote).then(function (o) {
          if (S.run !== run) return;
          if (o.accion === 'repregunta' && S.followTotal < MAX_FOLLOWUPS) { S.followUsed[stage.id] = true; S.followTotal++; botSay(o.texto, stage, true); }
          else {
            S.stageIdx++;
            if (S.stageIdx >= STAGES.length) { closeInterview(); return; }
            botSay(o.texto, STAGES[S.stageIdx], false);
          }
        }).catch(function (err) { if (S.run !== run) return; console.warn('[PULSO] Gemini no disponible, se usa el motor local:', err); local(); });
      } else {
        later(local, 700);
      }
    }

    function nextStage(react) {
      S.stageIdx++;
      if (S.stageIdx >= STAGES.length) { closeInterview(); return; }
      var st = STAGES[S.stageIdx];
      botSay(join(react, fillQ(st.q)), st, false);
    }

    function closeInterview() {
      var run = S.run;
      var msg = 'Muchas gracias' + nameSuffix() + '. Hemos terminado; ahora verás tu valoración general.';
      S.phase = 'asking'; S.ignoreMic = true; setLive();
      el.stageLabel.textContent = 'Fin';
      var tw = typeInto(bubble('bot'), msg, run); S.tw = tw;
      speak(msg, function () { finishInterview(false); }, run, tw);
    }

    /* ---------- Opcional: Gemini redacta la siguiente intervención ---------- */
    function askGemini(t, camNote) {
      var next = STAGES[S.stageIdx + 1];
      var canFollow = S.followTotal < MAX_FOLLOWUPS && !t.isFollow;
      var gz = t.camN ? Math.round(100 * t.camLook / t.camN) : null;
      var sys = [
        'Eres ' + BOT + ', entrevistadora de selección de personal en una simulación de entrenamiento en español de España. El candidato es adulto y sabe que habla con una IA.',
        'Escribe SOLO tu siguiente intervención hablada: una o dos frases cortas y una única pregunta. Natural, sin listas ni emojis.',
        'Cita o nombra algo concreto que el candidato acaba de decir (un proyecto, una cifra, una herramienta, un cliente, un problema).',
        'Si la respuesta fue breve o se quedó a medias, tira del hilo de la última idea que mencionó.',
        'No comentes ni evalúes sus emociones (nunca digas que parece nervioso o inseguro).',
        camNote ? 'Empieza con una observación breve y objetiva: ha mirado fuera de la cámara durante varios segundos; pídele que te mire al responder.' : '',
        'Responde en JSON: {"accion":"repregunta"|"siguiente","texto":"..."}.',
        canFollow ? 'Elige "repregunta" si merece la pena profundizar; si no, "siguiente".' : 'Debes elegir "siguiente".',
        next ? 'Si eliges "siguiente", enlaza con naturalidad y formula esta pregunta (puedes adaptar la redacción): "' + fillQ(next.q) + '"' : 'Si eliges "siguiente", despídete en una frase.'
      ].filter(Boolean).join('\n');
      var cvx = $('pe-cv').value.trim();
      if (cvx) sys += '\nDocumento del candidato (pregunta por su contenido concreto, sin leerlo): """' + cvx.slice(0, 3000).replace(/"""/g, '"') + '"""';
      var hist = S.log.slice(-12).map(function (m) { return (m.who === 'bot' ? BOT : 'Candidato') + ': ' + m.text; }).join('\n');
      var metrics = 'Métricas de su última respuesta: ' + t.r.words + ' palabras, ' + t.r.fillers + ' muletillas' + (gz != null ? ', contacto visual ' + gz + ' %' : '') + '. Bloque actual: ' + t.stage.label + '.';
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, GEMINI_TIMEOUT_MS);
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: hist + '\n\n' + metrics }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 200, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
        })
      }).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        var txt = ((d.candidates || [])[0] || {}).content;
        txt = txt && txt.parts ? txt.parts.map(function (p) { return p.text || ''; }).join('') : '';
        var o = JSON.parse(txt);
        if (!o || typeof o.texto !== 'string' || o.texto.trim().length < 5) throw new Error('Respuesta vacía');
        o.texto = o.texto.trim().slice(0, 400);
        if (o.accion !== 'repregunta' || !canFollow) o.accion = 'siguiente';
        return o;
      });
    }

    /* =====================================================
       ANÁLISIS DE CADA RESPUESTA (no se muestra hasta el final)
       ===================================================== */
    function evaluate(t) {
      var text = t.text, toks = tokenize(text);
      var words = 0, fillers = 0, counts = {}, repeats = [];
      toks.forEach(function (tk, i) {
        words += tk.words;
        if (tk.filler) { fillers++; counts[tk.key] = (counts[tk.key] || 0) + 1; }
        else if (i > 0 && !toks[i - 1].filler && tk.key.length >= 2 && tk.key === toks[i - 1].key) repeats.push(tk.key);
      });
      var padded = ' ' + text.split(/\s+/).map(norm).join(' ') + ' ';
      var hedges = [];
      HEDGES.forEach(function (h) { var c = padded.split(' ' + h + ' ').length - 1; for (var k = 0; k < c; k++) hedges.push(h); });
      return {
        words: words, fillers: fillers, counts: counts, repeats: repeats, hedges: hedges,
        firstIsFiller: !!(toks.length && toks[0].filler),
        seconds: t.firstTs ? Math.max((t.end - t.firstTs) / 1000, 1) : 1,
        pauses: t.pauses,
        startDelay: t.firstTs ? (t.firstTs - t.startTs) / 1000 : null,
        example: hasExample(text.toLowerCase())
      };
    }

    function topKeys(counts, n) {
      return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, n);
    }
    function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }
    function quote(a) { return a.map(function (v) { return '«' + v + '»'; }).join(', '); }

    /* =====================================================
       CÁMARA Y MIRADA (MediaPipe Face Landmarker, en el navegador)
       Mide hacia dónde miras y si tu cara está en el plano.
       No graba, no envía imágenes y no infiere emociones.
       ===================================================== */
    var CAM = { lm: null, loading: false, lastTs: 0, base: null, thr: null, cal: null, ema: null, away: false, flip: 0, miss: 0, awayStart: 0, awayCounted: false, awayDir: '', events: [], state: '' };
    var MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    function loadFaceModel() {
      if (CAM.lm || CAM.loading) return;
      CAM.loading = true;
      setAtt('loading');
      import(MP + '/vision_bundle.mjs').then(function (m) {
        return m.FilesetResolver.forVisionTasks(MP + '/wasm').then(function (fs) {
          return m.FaceLandmarker.createFromOptions(fs, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO', outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, numFaces: 1
          });
        });
      }).then(function (lm) { CAM.lm = lm; CAM.loading = false; el.permSt.textContent = 'Cámara y análisis de mirada activos. ' + PERM_DEFAULT; })
        .catch(function (e) { CAM.loading = false; console.warn('[PULSO] Sin modelo de mirada', e); setAtt('nomodel'); el.permSt.textContent = 'La cámara está activa, pero no se pudo cargar el análisis de mirada (necesita internet). La entrevista sigue sin él.'; });
    }

    function setAtt(state) {
      if (CAM.state === state) return;
      CAM.state = state;
      emit('att', state);
      var map = {
        loading: ['Cargando análisis de mirada…', 'var(--ink)'],
        calibrating: ['Calibrando: mira a la cámara', 'var(--ink)'],
        ok: ['Contacto visual OK', 'var(--ink)'],
        away: ['Mirada fuera de cámara', 'var(--accent)'],
        absent: ['Rostro fuera del plano', 'var(--accent)'],
        nomodel: ['Análisis de mirada no disponible', 'var(--ink)']
      }[state];
      if (!map) return;
      el.att.classList.remove('hidden');
      el.attLabel.textContent = map[0]; el.attDot.style.background = map[1];
    }

    /* ---------- Lectura de la mirada ----------
       Ojos: posición real del iris entre las comisuras (puntos 468 y 473 del modelo).
       Vertical: blendshapes de mirada arriba/abajo. Cabeza: giro (yaw) e inclinación (pitch). */
    var EYE_R = { a: 33, b: 133, top: 159, bot: 145, iris: 468 };
    var EYE_L = { a: 362, b: 263, top: 386, bot: 374, iris: 473 };
    function eyeRatio(p, e) {
      var a = p[e.a], b = p[e.b], i = p[e.iris];
      if (!a || !b || !i) return null;
      var lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      return hi - lo > 1e-4 ? (i.x - lo) / (hi - lo) : null;
    }
    function readGaze(r) {
      if (!r || !r.faceLandmarks || !r.faceLandmarks.length) return null;
      var p = r.faceLandmarks[0];
      var b = {}; ((r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories) || []).forEach(function (c) { b[c.categoryName] = c.score; });
      var g = function (k) { return b[k] || 0; };
      var rr = eyeRatio(p, EYE_R), rl = eyeRatio(p, EYE_L);
      var ex = rr != null && rl != null ? (rr + rl) / 2 : (rr != null ? rr : rl);
      if (ex == null) ex = 0.5 + ((g('eyeLookOutLeft') - g('eyeLookInLeft')) + (g('eyeLookInRight') - g('eyeLookOutRight'))) / 8;
      var v = ((g('eyeLookUpLeft') + g('eyeLookUpRight')) - (g('eyeLookDownLeft') + g('eyeLookDownRight'))) / 2;
      var m = r.facialTransformationMatrixes && r.facialTransformationMatrixes[0];
      var yaw = m ? Math.asin(clamp(m.data[8], -1, 1)) : 0;
      var pitch = m ? Math.asin(clamp(-m.data[9], -1, 1)) : 0;
      return { ex: ex, v: v, yaw: yaw, pitch: pitch };
    }

    /* ---------- Calibración: 2 segundos mirando a la cámara ----------
       Guarda tu posición natural (mediana) y cuánto te mueves sin darte cuenta (desviación),
       y con eso fija umbrales a tu medida. */
    var GAZE_MIN_T = { ex: 0.07, v: 0.22, yaw: 0.26, pitch: 0.22 };   // umbrales mínimos
    var calBox = $('pe-cal'), calText = $('pe-calText'), recalBtn = $('pe-recal');
    function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
    function std(a, m) { return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / a.length); }
    function startCalibration() {
      if (!CAM.lm || !cameraOn()) return;
      CAM.cal = { samples: [], t0: Date.now() };
      CAM.base = null; CAM.away = false; CAM.flip = 0; CAM.miss = 0; CAM.ema = null;
      calBox.classList.remove('hidden'); calText.textContent = 'Mira a la cámara';
      setAtt('calibrating');
    }
    function calibrationStep(g) {
      var c = CAM.cal, el2 = Date.now() - c.t0;
      if (el2 < 700) { calText.textContent = 'Mira a la cámara'; return; }   // tiempo para colocarse
      if (g) c.samples.push(g);
      calText.textContent = 'Mira a la cámara · ' + Math.max(1, Math.ceil((2700 - el2) / 1000)) + '';
      if (el2 < 2700 && c.samples.length < 14) return;
      if (c.samples.length < 6) {
        if (el2 > 7000) { CAM.cal = null; calText.textContent = 'No te veo bien. Centra la cara, busca luz de frente y pulsa «Recalibrar mirada».'; setAtt('absent'); }
        return;
      }
      var base = {}, thr = {};
      ['ex', 'v', 'yaw', 'pitch'].forEach(function (k) {
        var xs = c.samples.map(function (s) { return s[k]; }), md = median(xs);
        base[k] = md; thr[k] = Math.max(GAZE_MIN_T[k], 4 * std(xs, md));
      });
      CAM.base = base; CAM.thr = thr; CAM.cal = null;
      calText.textContent = 'Calibrado';
      setTimeout(function () { if (!CAM.cal) calBox.classList.add('hidden'); }, 900);
      setAtt('ok');
    }
    recalBtn.addEventListener('click', function () { if (!CAM.lm) { loadFaceModel(); return; } startCalibration(); });

    function camSample() {
      if (!CAM.lm || !cameraOn() || el.video.readyState < 2) return;
      var now = performance.now();
      if (now - CAM.lastTs < CAM_SAMPLE_MS - 20) return;
      CAM.lastTs = now;
      var res; try { res = CAM.lm.detectForVideo(el.video, now); } catch (e) { return; }
      var g = readGaze(res);
      if (!CAM.base && !CAM.cal) startCalibration();
      if (CAM.cal) { calibrationStep(g); return; }
      if (!CAM.base) return;

      /* Distancia a tu posición calibrada, en unidades de umbral (1 = en el límite), suavizada */
      var dir = '';
      if (!g) { CAM.miss++; if (CAM.miss >= 2) dir = 'fuera del plano'; }
      else {
        CAM.miss = 0;
        var d = { ex: g.ex - CAM.base.ex, v: g.v - CAM.base.v, yaw: g.yaw - CAM.base.yaw, pitch: g.pitch - CAM.base.pitch };
        CAM.ema = CAM.ema ? { ex: CAM.ema.ex * 0.4 + d.ex * 0.6, v: CAM.ema.v * 0.4 + d.v * 0.6, yaw: CAM.ema.yaw * 0.4 + d.yaw * 0.6, pitch: CAM.ema.pitch * 0.4 + d.pitch * 0.6 } : d;
        var e = CAM.ema;
        var hs = Math.max(Math.abs(e.ex) / CAM.thr.ex, Math.abs(e.yaw) / CAM.thr.yaw);
        var vs = Math.max(Math.abs(e.v) / CAM.thr.v, Math.abs(e.pitch) / CAM.thr.pitch);
        var score = Math.max(hs, vs);
        /* Histéresis: hace falta pasarse del umbral dos veces seguidas para "fuera",
           y volver claramente dentro (75 % del umbral) dos veces para "OK" */
        if (!CAM.away) { CAM.flip = score > 1 ? CAM.flip + 1 : 0; if (CAM.flip >= 2) { CAM.away = true; CAM.flip = 0; } }
        else { CAM.flip = score < 0.75 ? CAM.flip + 1 : 0; if (CAM.flip >= 2) { CAM.away = false; CAM.flip = 0; } }
        if (CAM.away) dir = hs >= vs ? 'a un lado' : ((Math.abs(e.v) / CAM.thr.v >= Math.abs(e.pitch) / CAM.thr.pitch ? e.v > 0 : e.pitch > 0) ? 'hacia arriba' : 'hacia abajo');
      }
      setAtt(dir ? (dir === 'fuera del plano' ? 'absent' : 'away') : 'ok');

      /* Solo cuenta mientras respondes */
      var t = S.turn;
      if (S.phase !== 'listening' || !t || !t.open) { CAM.awayStart = 0; CAM.awayCounted = false; return; }
      t.camN++;
      if (dir === 'fuera del plano') t.camOut++;
      if (!dir) { t.camLook++; CAM.awayStart = 0; CAM.awayCounted = false; return; }
      var wall = Date.now();
      if (!CAM.awayStart) { CAM.awayStart = wall; CAM.awayDir = dir; }
      var dur = wall - CAM.awayStart;
      if (dur >= GAZE_EVENT_MS && !CAM.awayCounted) {
        CAM.awayCounted = true; t.camEvents++;
        t.camDirs[CAM.awayDir] = (t.camDirs[CAM.awayDir] || 0) + 1;
        CAM.events.push({ label: lbl(t), dir: CAM.awayDir });
      }
      if (dur >= GAZE_LONG_MS) t.longAway = true;
    }

    /* =====================================================
       VALORACIÓN GENERAL (toda la conversación)
       ===================================================== */
    function aggregate() {
      var ts = S.turns.filter(function (t) { return !t.stage.noEval; });
      var A = { turns: ts, words: 0, fillers: 0, seconds: 0, pauses: 0, counts: {}, hedges: [], repeats: [], delays: [], camN: 0, camLook: 0, camOut: 0, camEvents: 0, camDirs: {} };
      ts.forEach(function (t) {
        var r = t.r;
        A.words += r.words; A.fillers += r.fillers; A.seconds += r.seconds; A.pauses += r.pauses;
        Object.keys(r.counts).forEach(function (k) { A.counts[k] = (A.counts[k] || 0) + r.counts[k]; });
        A.hedges = A.hedges.concat(r.hedges); A.repeats = A.repeats.concat(r.repeats);
        if (r.startDelay != null) A.delays.push(r.startDelay);
        A.camN += t.camN; A.camLook += t.camLook; A.camOut += t.camOut; A.camEvents += t.camEvents;
        Object.keys(t.camDirs).forEach(function (k) { A.camDirs[k] = (A.camDirs[k] || 0) + t.camDirs[k]; });
      });
      var min = Math.max(A.seconds / 60, 0.2);
      A.fillerRate = A.words >= 30 ? A.fillers / min : null;
      A.wpm = A.words >= 30 ? A.words / min : null;
      A.avgDelay = avg(A.delays);
      A.short = ts.filter(function (t) { return !t.stage.lenient && t.r.words < 20; });
      var exTurns = ts.filter(function (t) { return t.stage.example && !t.isFollow; });
      A.exTotal = exTurns.length;
      A.exMissing = exTurns.filter(function (t) { return !t.r.example && !followHasExample(t.stage.id); });
      A.exGiven = A.exTotal - A.exMissing.length;
      A.gaze = A.camN >= 8 ? 100 * A.camLook / A.camN : null;
      A.topDir = topKeys(A.camDirs, 1)[0] || '';
      /* desvíos por bloque de la entrevista */
      var byStage = {};
      ts.forEach(function (t) { if (t.camEvents) { var k = t.stage.label; byStage[k] = byStage[k] || { n: 0, dirs: {} }; byStage[k].n += t.camEvents; Object.keys(t.camDirs).forEach(function (d) { byStage[k].dirs[d] = (byStage[k].dirs[d] || 0) + t.camDirs[d]; }); } });
      A.gazeByStage = byStage;
      return A;
    }

    function followHasExample(stageId) {
      return S.turns.some(function (t) { return t.isFollow && t.stage.id === stageId && t.r.example; });
    }

    var DIR_TIP = {
      'hacia arriba': 'evita mirar al techo al recordar datos: si necesitas pensar, haz una pausa breve mirando a cámara',
      'hacia abajo': 'evita mirar hacia abajo (notas, teclado o móvil): ten tus tres ideas clave en la cabeza, no en el papel',
      'a un lado': 'evita mirar a los lados: coloca la ventana de la entrevista justo debajo de la cámara',
      'fuera del plano': 'mantente dentro del encuadre, con la cara centrada y bien iluminada'
    };

    function buildReport(A, early) {
      var issues = 0;
      if (A.fillerRate != null) issues += A.fillerRate >= 6 ? 2 : (A.fillerRate >= 3 ? 1 : 0);
      if (A.wpm != null) issues += (A.wpm < 110 || A.wpm > 180) ? 2 : ((A.wpm < 125 || A.wpm > 170) ? 1 : 0);
      if (A.short.length >= 2) issues += 1;
      if (A.short.length >= 4) issues += 1;
      if (A.hedges.length >= Math.max(4, A.turns.length)) issues += 1;
      if (A.exMissing.length >= 2) issues += 1;
      if (A.pauses >= Math.max(3, A.turns.length)) issues += 1;
      if (A.gaze != null && A.gaze < 60) issues += 1;
      var verdict = issues <= 1
        ? 'Entrevista sólida. Respondes con claridad y seguridad; ahora toca pulir los detalles.'
        : (issues <= 3
          ? 'Buen punto de partida. Hay dos o tres hábitos concretos que, al corregirlos, harán tus respuestas mucho más convincentes.'
          : 'Tienes un margen de mejora claro, y es una buena noticia: con práctica repetida estos hábitos cambian rápido. Empieza por el primero de la lista.');

      var good = [];
      if (A.fillerRate != null && A.fillerRate < 3) good.push('Casi no usas muletillas: tu discurso suena fluido y seguro.');
      if (A.wpm != null && A.wpm >= 125 && A.wpm <= 170) good.push('Tu ritmo (' + Math.round(A.wpm) + ' palabras/min) es cómodo de seguir.');
      if (A.hedges.length <= 1 && A.words >= 30) good.push('Afirmas con seguridad: casi no usas expresiones de duda.');
      if (A.exTotal && A.exGiven >= Math.ceil(A.exTotal / 2)) good.push('Apoyas tus respuestas con ejemplos concretos, que es lo que más se recuerda.');
      if (A.short.length === 0 && A.words >= 30) good.push('Tus respuestas tienen una extensión adecuada: ni cortas ni excesivas.');
      if (A.avgDelay != null && A.avgDelay <= 3) good.push('Empiezas a responder sin dudar, con buena reacción.');
      if (A.gaze != null && A.gaze >= 80) good.push('Mantuviste la mirada en la cámara el ' + Math.round(A.gaze) + ' % del tiempo que respondías' + (A.camEvents <= 1 ? ', casi sin desvíos.' : '.'));
      if (!early && !good.length) good.push('Has completado la entrevista de principio a fin, que es el primer paso para mejorar.');

      var tips = [];
      if (A.fillerRate != null && A.fillerRate >= 3) {
        tips.push('Cambia las muletillas (' + quote(topKeys(A.counts, 3)) + ') por un silencio breve. Una pausa de medio segundo suena más segura que un relleno.');
      }
      if (A.gaze != null && A.gaze < 80) tips.push('Miraste a cámara el ' + Math.round(A.gaze) + ' % del tiempo (objetivo: más del 80 %). ' + cap(DIR_TIP[A.topDir] || DIR_TIP['a un lado']) + '.');
      if (A.wpm != null && A.wpm < 125) tips.push('Hablas despacio (' + Math.round(A.wpm) + ' palabras/min). Prepara tres ideas clave por pregunta y pasa de una a otra sin buscar las palabras.');
      if (A.wpm != null && A.wpm > 170) tips.push('Hablas muy rápido (' + Math.round(A.wpm) + ' palabras/min). Haz una pausa al final de cada idea para que se asiente.');
      if (S.needDetail >= 1 || A.short.length >= 2) {
        tips.push('Algunas respuestas fueron muy cortas' + (S.needDetail ? ' y ' + BOT + ' tuvo que pedirte más detalle' + (S.needDetail > 1 ? ' (' + S.needDetail + ' veces)' : '') : '') + '. Prepara de antemano tres ideas para las preguntas típicas.');
      }
      if (A.exMissing.length) tips.push('Faltaron ejemplos o cifras concretas en algunas respuestas. Usa el esquema situación, lo que hiciste tú y resultado.');
      if (A.hedges.length >= 4) tips.push('Usas expresiones que restan seguridad (' + quote(uniq(A.hedges).slice(0, 3)) + '). Afirma lo que sabes y explica cómo aprenderías lo que no.');
      if (A.repeats.length >= 2) tips.push('Repites palabras seguidas (' + uniq(A.repeats).slice(0, 3).join(', ') + '). Piensa la frase antes de empezarla.');
      if (A.pauses >= Math.max(3, A.turns.length)) tips.push('Tienes silencios largos a mitad de respuesta. Un esquema mental te ayuda a no perder el hilo.');
      if (A.avgDelay != null && A.avgDelay > 5) tips.push('Tardas unos ' + num(A.avgDelay, 0) + ' s en empezar a responder. Está bien pensar, pero intenta tener lista la primera frase en 2 o 3 segundos.');
      if (!tips.length) tips.push('No hay ningún hábito urgente que corregir. Siguiente reto: repite la entrevista con respuestas más breves y añade una cifra o un resultado a cada ejemplo.');
      tips = tips.slice(0, 5);

      var moments = [], worst = null;
      A.turns.forEach(function (t) {
        if (t.r.words >= 25) {
          var rate = t.r.fillers / Math.max(t.r.seconds / 60, 0.2);
          if (!worst || rate > worst.rate) worst = { t: t, rate: rate };
        }
      });
      var gs = Object.keys(A.gazeByStage).sort(function (a, b) { return A.gazeByStage[b].n - A.gazeByStage[a].n; })[0];
      if (gs && A.gazeByStage[gs].n >= 1) {
        var d = topKeys(A.gazeByStage[gs].dirs, 1)[0];
        moments.push('En la pregunta de «' + gs + '» desviaste la mirada ' + A.gazeByStage[gs].n + (A.gazeByStage[gs].n === 1 ? ' vez, ' : ' veces, sobre todo ') + d + '; ' + (DIR_TIP[d] || DIR_TIP['a un lado']) + '.');
      }
      if (worst && worst.rate >= 3) moments.push('Más muletillas en «' + lbl(worst.t) + '»: unas ' + num(worst.rate, 0) + ' por minuto.');
      A.short.slice(0, 2).forEach(function (t) { moments.push('Respuesta muy corta en «' + lbl(t) + '» (' + t.r.words + ' palabras).'); });
      A.exMissing.slice(0, 1).forEach(function (t) { moments.push('Sin ejemplo concreto en «' + lbl(t) + '».'); });
      var doubt = null;
      A.turns.forEach(function (t) { if (t.r.hedges.length >= 3 && (!doubt || t.r.hedges.length > doubt.r.hedges.length)) doubt = t; });
      if (doubt) moments.push('Dudas en «' + lbl(doubt) + '»: ' + quote(uniq(doubt.r.hedges).slice(0, 3)) + '.');
      moments = moments.slice(0, 4);

      return { verdict: verdict, good: good, tips: tips, moments: moments };
    }

    function lbl(t) { return t.stage.label + (t.isFollow ? ' (seguimiento)' : ''); }

    function liHtml(items, bad) {
      return items.map(function (t) {
        return '<li class="flex gap-3"><span class="mt-[9px] w-2.5 h-2.5 shrink-0 rounded-full" style="background:' + (bad ? 'var(--accent)' : 'var(--ink)') + '"></span><span>' + esc(t) + '</span></li>';
      }).join('');
    }

    function setBar(id, pct, level) {
      var b = $(id);
      b.style.width = clamp(pct, 0, 100) + '%';
      b.className = 'bar-fill lvl-' + level + ((id === 'pe-bPace' || id === 'pe-bGaze') ? ' relative' : '');
    }

    function paintReport(early) {
      var A = aggregate();
      el.idle.classList.add('hidden');
      el.report.classList.remove('hidden');
      $('pe-sideNote').textContent = 'Tu valoración está debajo de la entrevista.';
      var earlyEl = $('pe-early');
      earlyEl.classList.toggle('hidden', !early);
      if (early) earlyEl.textContent = 'Has terminado la entrevista antes de tiempo: esta valoración se basa en las ' + A.turns.length + ' respuestas que diste.';

      if (!A.turns.length) {
        $('pe-verdict').textContent = 'Todavía no hay respuestas suficientes para valorar. Haz una entrevista completa y vuelve a verlo.';
        ['pe-mFiller', 'pe-mPace', 'pe-mWords', 'pe-mPauses', 'pe-mTurns', 'pe-mGaze', 'pe-mGazeEv'].forEach(function (id) { $(id).textContent = '—'; });
        setBar('pe-bFiller', 0, 'none'); setBar('pe-bPace', 0, 'none'); setBar('pe-bGaze', 0, 'none');
        $('pe-fillerList').textContent = ''; $('pe-tips').innerHTML = '';
        $('pe-goodBox').classList.add('hidden'); $('pe-momentsBox').classList.add('hidden');
        return;
      }
      var rep = buildReport(A, early);
      $('pe-verdict').textContent = 'Muletillas detectadas: ' + A.fillers + ' (en ' + A.words + ' palabras)';
      $('pe-tbody').innerHTML = extras(A); $('pe-tableWrap').classList.remove('hidden'); segInfo();

      if (A.fillerRate == null) { $('pe-mFiller').textContent = '—'; setBar('pe-bFiller', 0, 'none'); }
      else {
        $('pe-mFiller').textContent = num(A.fillerRate, 1);
        setBar('pe-bFiller', Math.max((A.fillerRate / 12) * 100, 3), A.fillerRate < 3 ? 'good' : (A.fillerRate < 6 ? 'warn' : 'bad'));
      }
      if (A.wpm == null) { $('pe-mPace').textContent = '—'; setBar('pe-bPace', 0, 'none'); }
      else {
        $('pe-mPace').textContent = String(Math.round(A.wpm));
        setBar('pe-bPace', (A.wpm / 260) * 100, (A.wpm >= 130 && A.wpm <= 160) ? 'good' : ((A.wpm >= 110 && A.wpm <= 180) ? 'warn' : 'bad'));
      }
      if (A.gaze == null) {
        $('pe-mGaze').textContent = '—'; setBar('pe-bGaze', 0, 'none');
        $('pe-mGazeEv').textContent = S.hadVideo ? 'sin datos suficientes del análisis de mirada' : 'cámara no activada';
      } else {
        $('pe-mGaze').textContent = Math.round(A.gaze) + ' %';
        setBar('pe-bGaze', A.gaze, A.gaze >= 80 ? 'good' : (A.gaze >= 60 ? 'warn' : 'bad'));
        $('pe-mGazeEv').textContent = A.camEvents + (A.camEvents === 1 ? ' desvío de mirada' : ' desvíos de mirada') + ' de más de 1 s';
      }
      $('pe-mWords').textContent = String(A.words);
      $('pe-mPauses').textContent = String(A.pauses);
      $('pe-mTurns').textContent = String(A.turns.length);
      var tf = topKeys(A.counts, 8);
      $('pe-fillerList').textContent = tf.length
        ? 'Muletillas detectadas: ' + tf.map(function (f) { return f + ' (' + A.counts[f] + ')'; }).join(', ') + '.'
        : (A.words >= 30 ? 'No se han detectado muletillas.' : '');

      $('pe-goodBox').classList.toggle('hidden', !rep.good.length);
      $('pe-good').innerHTML = liHtml(rep.good, false);
      $('pe-tips').innerHTML = liHtml(rep.tips, true);
      $('pe-momentsBox').classList.toggle('hidden', !rep.moments.length);
      $('pe-moments').innerHTML = liHtml(rep.moments, true);
    }

    /* =====================================================
       INICIO, FIN Y CONTROLES
       ===================================================== */
    function emitLive(sec) {
      var words = 0, fillers = 0, secs = 0, n = 0, look = 0, lat = [];
      S.turns.forEach(function (t) {
        if (t.stage.noEval) return;
        words += t.r.words; fillers += t.r.fillers; secs += t.r.seconds; n += t.camN; look += t.camLook;
        if (t.r.startDelay != null && !t.afterInt) lat.push(t.r.startDelay);
      });
      var t = S.turn;
      if (t && t.open && !t.stage.noEval) {
        if (t.firstTs) { tokenize(join(t.finalText, t.interim)).forEach(function (k) { words += k.words; if (k.filler) fillers++; }); secs += Math.max(1, (Date.now() - t.firstTs) / 1000); }
        n += t.camN; look += t.camLook;
      }
      var min = Math.max(secs / 60, 0.1);
      emit('live', { sec: sec, words: words, fillers: fillers, fpm: words >= 12 ? fillers / min : null, wpm: words >= 12 ? words / min : null,
        gaze: n >= 5 ? 100 * look / n : null, latency: avg(lat), stage: S.stage ? S.stage.label + (S.isFollow ? ' · seguimiento' : '') : '',
        idx: S.stageIdx, total: STAGES.length, phase: S.phase, att: CAM.state, hostility: hostility() });
    }

    function tick() {
      var sec = (Date.now() - S.startTs) / 1000;
      el.timer.textContent = clock(sec);
      emitLive(sec);
      var t = S.turn;
      if (S.phase === 'listening' && t && t.open) {
        var now = Date.now();
        if (!t.firstTs) { if (now - t.startTs > NO_SPEECH_MS) endTurn(); }
        else {
          var words = countWords(join(t.finalText, t.interim));
          if (shouldInterrupt(t, words, now)) { interruptNow(); return; }
          /* Red de seguridad: una sola palabra («Ana», «no») o un temporizador perdido */
          if ((words < 2 && now - t.lastTs > ONE_WORD_MS) || now - t.lastTs > (words < 4 ? SILENCE_SHORT_MS : SILENCE_MS) + 1500 || now - t.firstTs > MAX_TURN_S * 1000) endTurn();
        }
      }
    }

    /* ---------- Cámara: la ves siempre, antes, durante y después de la entrevista ---------- */
    var camBtn = $('pe-camBtn'), camStop = $('pe-camStop'), camTimer = null;
    function cameraOn() { return !!(S.cam && S.cam.getVideoTracks().some(function (tr) { return tr.readyState === 'live'; })); }
    function startCamera() {
      if (cameraOn()) return Promise.resolve(true);
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) { el.permSt.textContent = 'Tu navegador no permite usar la cámara aquí.'; return Promise.resolve(false); }
      camBtn.disabled = true; camBtn.textContent = 'Encendiendo…';
      return md.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false }).then(function (stream) {
        S.cam = stream;
        el.video.srcObject = stream;
        var p = el.video.play(); if (p && p.catch) p.catch(function () { /* autoplay silenciado */ });
        el.camOff.classList.add('hidden'); camStop.classList.remove('hidden'); recalBtn.classList.remove('hidden');
        el.permSt.textContent = PERM_DEFAULT;
        loadFaceModel();
        if (!camTimer) camTimer = setInterval(camSample, CAM_SAMPLE_MS);
        if (S.phase !== 'idle' && S.phase !== 'done') S.hadVideo = true;
        emit('camera', true);
        return true;
      }).catch(function (e) {
        el.permSt.textContent = e && e.name === 'NotFoundError' ? 'No se encuentra ninguna cámara. La entrevista funciona igual, sin medir el contacto visual.' : 'No se ha permitido la cámara. La entrevista funciona igual, sin medir el contacto visual.';
        return false;
      }).then(function (ok) { camBtn.disabled = false; camBtn.textContent = 'Encender cámara'; return ok; });
    }
    function stopCamera() {
      if (S.cam) { S.cam.getTracks().forEach(function (tr) { tr.stop(); }); S.cam = null; }
      if (camTimer) { clearInterval(camTimer); camTimer = null; }
      el.video.srcObject = null;
      el.camOff.classList.remove('hidden'); camStop.classList.add('hidden');
      el.att.classList.add('hidden'); CAM.state = '';
      CAM.base = null; CAM.cal = null; calBox.classList.add('hidden'); recalBtn.classList.add('hidden');
      emit('camera', false);
    }
    camBtn.addEventListener('click', startCamera);
    camStop.addEventListener('click', stopCamera);
    window.addEventListener('pagehide', stopCamera);

    function stopAll() {
      if (S.tw) S.tw.finish();
      S.run++;
      clearTimeout(S.silenceTimer);
      if (S.tickId) { clearInterval(S.tickId); S.tickId = null; }
      S.ignoreMic = true; S.recogAlive = false;
      if (S.turn) S.turn.open = false;
      if (S.recog) {
        var r = S.recog; S.recog = null;
        r.onend = null; r.onerror = null; r.onresult = null;
        try { r.abort(); } catch (e) { /* ya parado */ }
      }
      if (hasTTS) { try { window.speechSynthesis.cancel(); } catch (e) { /* sin voz */ } }
      lockDemoMic(false);
    }

    function abort(msg) {
      stopAll();
      stopCamera();
      emit('abort', msg);
      S.phase = 'idle'; setLive(); setButtons(false);
      el.stageLabel.textContent = 'Interrumpida';
      note(msg);
    }

    function finishInterview(early) {
      stopAll();
      S.phase = 'done'; setLive(); setButtons(false);
      el.stageLabel.textContent = 'Terminada';
      el.startLabel.textContent = 'Nueva entrevista';
      note(NOTE_DEFAULT);
      paintReport(early);
      stopCamera();   /* fin de la entrevista: se apaga la cámara */
      var A = aggregate();
      emit('done', { date: new Date().toISOString(), early: !!early, turns: A.turns.length, words: A.words, fillers: A.fillers,
        fpm: A.fillerRate, wpm: A.wpm, gaze: A.gaze, events: A.camEvents, latency: A.avgDelay, hostility: hostility() });
    }

    function resetAll() {
      S.recog = null;
      S.turns = []; S.log = []; S.stageIdx = 0; S.name = ''; S.followUsed = {}; S.followTotal = 0; S.hooksUsed = {}; S.pulled = {};
      S.interrupted = false; S.interrupts = 0; S.afterInt = false; S.camRemarks = 0; rot = {};
      CAM.awayStart = 0; CAM.awayCounted = false; CAM.events = [];
      S.needDetail = 0; S.calmUsed = 0; S.noSpeech = 0; S.turn = null; S.ignoreMic = true;
      el.chat.innerHTML = '';
      el.report.classList.add('hidden'); el.idle.classList.remove('hidden');
      $('pe-sideNote').textContent = 'Al terminar, tu valoración aparecerá debajo de la entrevista.'; $('pe-tableWrap').classList.add('hidden');
      el.timer.textContent = '0:00';
    }

    /* El micrófono se pide una sola vez, en tu primera respuesta: lo solicita el propio
       reconocimiento de voz, que se mantiene abierto durante toda la entrevista. */
    function requestMedia(done) {
      note('Te toca responder. Si el navegador te lo pide, permite el micrófono: solo te lo pedirá esta vez.');
      done();
    }

    function launch() {
      resetAll();
      S.run++;
      S.hadVideo = cameraOn();
      S.startTs = Date.now();
      lockDemoMic(true);
      setButtons(true);
      note(NOTE_DEFAULT);
      MAX_FOLLOWUPS = clamp(2 + Math.round(hostility() / 2.5), 2, 6);
      S.tickId = setInterval(tick, CAM_SAMPLE_MS);
      botSay(fillQ(STAGES[0].q), STAGES[0], false);
    }

    /* Al empezar no se pide ningún permiso: Marta hace la primera pregunta
       y el micrófono se solicita cuando te toca responder. */
    function startInterview() {
      if (!SR) return;
      if (demoMicBusy()) { note('Detén primero el micrófono de la demostración de arriba y vuelve a intentarlo.'); return; }
      startCamera().then(launch);   /* la cámara se enciende al empezar y sigue encendida al terminar */
    }

    /* Con más hostilidad, Marta corta antes y en más preguntas */
    function shouldInterrupt(t, words, now) {
      var H = hostility(), st = S.stage;
      if (H < 4 || !st || st.noEval || st.closing || S.isFollow || words < 18) return false;
      if ((S.interrupts || 0) >= (H >= 8 ? 2 : 1)) return false;
      if (H < 6 && st.id !== 'challenge') return false;
      return now - t.firstTs > (22 - H * 1.4) * 1000;
    }

    function interruptNow() {
      var t = S.turn; S.interrupted = true; S.interrupts = (S.interrupts || 0) + 1; emit('interrupt');
      clearTimeout(S.silenceTimer); S.ignoreMic = true;
      recordTurn(t, join(t.finalText, t.interim).trim());
      S.afterInt = true;
      var a = t.a, topic = a && a.hooks.length ? a.hooks[a.hooks.length - 1].t : (a && a.last) || '';
      botSay('Perdona que te interrumpa. ' + (topic ? 'Sobre «' + topic + '»: ' : 'Voy al grano: ') + '¿qué hiciste tú, exactamente, y con qué resultado?', t.stage, true);
    }

    var SEG = {
      b2c: ['El CV y los certificados no demuestran cómo reaccionas bajo presión', 'Entrena con tu CV o tu pitch real y enséñalo en LinkedIn', 'Ensayar frente al espejo, sesiones con coach de comunicación'],
      b2b: ['Cribados telefónicos lentos y subjetivos para puestos de cara al cliente', 'Antes de la primera entrevista, ves cómo el candidato vende tu producto ante un cliente difícil', 'Llamadas de cribado, assessment centers presenciales'],
      edu: ['Las soft skills se enseñan pero no se practican a escala ni se acreditan', 'Cada alumno hace negociaciones de alto nivel evaluables, con informe para el profesor', 'Role-plays en clase con actores o compañeros']
    };
    function segInfo() {
      var d = SEG[$('pe-seg').value], k = ['Dolor', 'Promesa PULSO', 'Sustituye a'];
      $('pe-segInfo').innerHTML = d.map(function (t, i) { return '<div class="bg-tone p-4"><dt class="t-small font-semibold muted">' + k[i] + '</dt><dd class="mt-1">' + esc(t) + '</dd></div>'; }).join('');
    }
    $('pe-seg').addEventListener('change', segInfo);
    function extras(A) {
      var rows = [], sc = [], ts = A.turns;
      function add(n, q, c, res, s, w) { rows.push([n, q, c, res]); if (s != null) sc.push([clamp(s, 0, 100), w]); }
      var rec = ts.filter(function (t) { return t.afterInt && t.r.startDelay != null; }).map(function (t) { return t.r.startDelay; });
      add('Recuperación tras interrupción', 'Segundos hasta retomar un argumento coherente', 'Marcas de tiempo + análisis del transcript', rec.length ? num(rec[0], 1) + ' s' : 'Sin interrupción (Marta interrumpe en «Situación difícil» si hablas más de 10 s)', rec.length ? 100 - (rec[0] - 3) / 7 * 100 : null, 15);
      var lat = ts.filter(function (t) { return !t.afterInt && t.r.startDelay != null; }).map(function (t) { return t.r.startDelay; });
      add('Latencia de respuesta', 'Tiempo entre la pregunta de la IA y la respuesta', 'Marcas de tiempo del audio', lat.length ? num(avg(lat), 1) + ' s de media (máx. ' + num(Math.max.apply(null, lat), 1) + ' s)' : '—', lat.length ? 100 - (avg(lat) - 2) / 6 * 100 : null, 10);
      var w = ts.filter(function (t) { return t.r.words >= 15; }).map(function (t) { return t.r.words / (t.r.seconds / 60); }), wres = '—', ws = null;
      if (w.length > 1) { var mu = avg(w), sd = Math.sqrt(avg(w.map(function (x) { return (x - mu) * (x - mu); }))); wres = Math.round(mu) + ' palabras/min · variación ±' + Math.round(sd) + ' (de ' + Math.round(Math.min.apply(null, w)) + ' a ' + Math.round(Math.max.apply(null, w)) + ')'; ws = 100 - (sd - 15) / 35 * 100; }
      else if (w.length) wres = Math.round(w[0]) + ' palabras/min (hace falta más de una respuesta larga para medir la estabilidad)';
      add('Ritmo (WPM) y estabilidad', 'Si aceleras o te atropellas cuando sube la hostilidad', 'Palabras por minuto por tramo', wres, ws, 15);
      var fr = A.seconds ? A.fillers / Math.max(A.seconds / 60, 0.2) : null;
      add('Muletillas por minuto', 'Precisión verbal', 'Transcript', A.fillers + ' muletillas en total' + (fr != null ? ' · ' + num(fr, 1) + ' por minuto' : ''), fr != null ? 100 - fr / 9 * 100 : null, 15);
      var cv = $('pe-cv').value.toLowerCase(), nums = 0, hit = 0, cres = 'Pega tu CV (opcional) para medirlo';
      if (cv.trim()) { ts.forEach(function (t) { (t.text.match(/\d+(?:[.,]\d+)?/g) || []).forEach(function (n) { nums++; if (cv.indexOf(n) !== -1) hit++; }); }); cres = nums ? hit + ' de ' + nums + ' cifras dichas aparecen en tu documento' : 'No citaste cifras'; }
      add('Precisión sobre el documento', 'Si defiendes bien las cifras de tu CV o dossier', 'Contraste RAG respuesta vs. documento', cres, cv.trim() && nums ? hit / nums * 100 : null, 15);
      var con = 0; ts.forEach(function (t) { var x = t.text.toLowerCase(); var c = (x.match(/de acuerdo|tienes razón|acepto|como quieras/g) || []).length; if (c && !/a cambio|siempre que|con la condición/.test(x)) con += c; });
      add('Firmeza negociadora', 'Concesiones hechas sin contrapartida', 'Clasificación del transcript por LLM con rúbrica', con + ' concesiones sin contrapartida', 100 - con * 25, 10);
      var long = ts.filter(function (t) { return t.r.words >= 25; });
      var full = long.filter(function (t) { var x = t.text.toLowerCase(); return /creo que|lo principal|diría|porque|motivo|soy /.test(x) && t.r.example && /por eso|en resumen|en definitiva|al final|por tanto|así que|en conclusión|resultado/.test(x); });
      add('Estructura argumental', 'Claridad: tesis, prueba, cierre', 'Rúbrica evaluada por LLM', long.length ? full.length + ' de ' + long.length + ' respuestas con tesis, prueba y cierre' : '—', long.length ? full.length / long.length * 100 : null, 10);
      var hadCam = S.turns.some(function (t) { return t.camN > 0; });
      add('Contacto visual con la cámara', 'Mirada dirigida a la cámara mientras respondes y desvíos de más de 1 s', 'Face Landmarker (MediaPipe) en el navegador: posición del iris y giro de la cabeza, 5 veces por segundo, calibrado a tu mirada; no se graba', A.gaze != null ? Math.round(A.gaze) + ' % del tiempo · ' + A.camEvents + ' desvíos' + (A.topDir ? ' (sobre todo ' + A.topDir + ')' : '') + ' · rostro fuera de plano ' + Math.round(A.camOut * CAM_SAMPLE_MS / 1000) + ' s' : (hadCam ? 'Sin datos suficientes' : 'Cámara o análisis de mirada no disponibles'), A.gaze, 10);
      var tw = 0, ss = 0; sc.forEach(function (p) { ss += p[0] * p[1]; tw += p[1]; });
      rows.unshift(['Índice de Sincronía (0–100)', 'Indicador compuesto de control de la conversación', 'Media ponderada de las métricas siguientes', tw ? Math.round(ss / tw) + ' / 100 (con ' + sc.length + ' métricas medidas)' : '—']);
      return rows.map(function (p, i) { return '<tr style="border-top:1px solid var(--line)">' + p.map(function (c, j) { return '<td class="p-3 align-top' + (i === 0 && j < 4 ? ' font-semibold' : '') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
    }

    el.start.addEventListener('click', startInterview);
    el.answer.addEventListener('click', endTurn);
    el.end.addEventListener('click', function () {
      var t = S.turn;
      if (S.phase === 'listening' && t && t.open) {
        var text = join(t.finalText, t.interim).trim();
        if (text) recordTurn(t, text); else t.open = false;
      }
      finishInterview(true);
    });

    if (PROTO === 'file:') $('pe-fileWarn').classList.remove('hidden');
    if (!SR) {
      el.start.disabled = true;
      el.startLabel.textContent = 'Voz no disponible aquí';
      note('Tu navegador no ofrece reconocimiento de voz. Prueba en Chrome o Edge de escritorio.');
      NOTE_DEFAULT = el.note.textContent;
    }
  })();
  