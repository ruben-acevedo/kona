// Preload das páginas para preencher endereços e cartões (N9). Roda num mundo isolado, como o de
// senhas: os scripts do site não alcançam este código. Reconhece os campos (pelo autocomplete que os
// sites marcam para o Chrome; sem ele, pelo nome/rótulo em inglês, português e espanhol), avisa
// quando um deles é focado, preenche o formulário inteiro quando a pessoa escolhe um item na
// interface e percebe o envio de um formulário novo para oferecer salvar.
// O código de segurança do cartão (CVV) nunca é lido nem preenchido.
const { ipcRenderer } = require('electron');

if (/^https?:$/.test(location.protocol)) {
  const AUTOCOMPLETE = {
    name: 'name', 'given-name': 'given', 'family-name': 'family', organization: 'org',
    'street-address': 'street-address', 'address-line1': 'street', 'address-line2': 'complement', 'address-line3': 'complement',
    'address-level3': 'neighborhood', 'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'postal',
    country: 'country', 'country-name': 'country', tel: 'tel', 'tel-national': 'tel', email: 'email',
    'cc-name': 'cc-name', 'cc-number': 'cc-number', 'cc-exp': 'cc-exp', 'cc-exp-month': 'cc-exp-month',
    'cc-exp-year': 'cc-exp-year', 'cc-csc': 'cc-csc',
  };
  // Sem autocomplete: palavras no nome/id/rótulo/placeholder (ordem importa: o mais específico primeiro)
  const HINTS = [
    ['cc-csc', /cvv|cvc|csc|security.?code|c[oó]digo.?de.?seguran|c[oó]digo.?de.?seguridad|card.?verification/],
    ['cc-name', /name.?on.?card|card.?holder|cardholder|nome.?(no|do|impresso).?cart[aã]o|titular|nombre.?(en|del|de la).?tarjeta|cc.?name/],
    ['cc-number', /card.?number|cardnumber|cc.?num|n[uú]mero.?(do|de|da|de la)?.?(cart[aã]o|tarjeta)|credit.?card|cart[aã]o.?de.?cr[eé]dito|tarjeta/],
    ['cc-exp-month', /exp.*(month|mm\b)|(month|m[eê]s).*(exp|valid|venc)|^mm$/],
    ['cc-exp-year', /exp.*(year|yy)|(year|ano|año).*(exp|valid|venc)|^(yy|yyyy|aa|aaaa)$/],
    ['cc-exp', /exp(iry|iration)?.?date|\bexp\b|validade|vencimiento|caducidad|mm.?\/.?(yy|aa)/],
    ['email', /e.?mail|correo/],
    ['tel', /phone|\btel\b|telefone|telefono|teléfono|celular|m[oó]vil|whats/],
    ['postal', /zip|postal|\bcep\b|c[oó]digo.?postal|postcode/],
    ['neighborhood', /bairro|neighbou?rhood|barrio|colonia|district/],
    ['complement', /complement|address.?(line)?.?2|address2|apartment|\bapt\b|suite|\bunit\b|\bdepto?\b|piso/],
    ['number', /house.?number|street.?number|^n[uú]mero$|^numero$|^num$|^n[º°o]$|addr.*num|num.*(casa|endere)/],
    ['city', /city|cidade|ciudad|town|localidad|munic[ií]pio|locality/],
    ['state', /\bstate\b|estado|province|provincia|region|\buf\b|county/],
    ['country', /country|pa[ií]s\b/],
    ['org', /company|organi[sz]ation|empresa|organiza[cç][aã]o/],
    ['given', /first.?name|given.?name|fname|primeiro.?nome|^nombre$/],
    ['family', /last.?name|surname|family.?name|lname|sobrenome|apellido/],
    ['street', /address|street|\brua\b|endere[cç]o|logradouro|direcci[oó]n|calle|avenida/],
    ['name', /full.?name|^name$|your.?name|nome.?completo|^nome$|nombre.?completo|recipient/],
  ];
  const ADDRESS = new Set(['name', 'given', 'family', 'org', 'street-address', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal', 'country', 'tel', 'email']);
  const CARD = new Set(['cc-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year']);

  const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const fillable = (el) => (el instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', 'search', ''].includes(el.type))
    || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
  /** Os textos que descrevem o campo: nome, id, placeholder, rótulo (cada um à parte, em minúsculas). */
  const labelsOf = (el) => {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('data-testid')];
    if (el.id) { try { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(l.textContent); } catch { /* id estranho */ } }
    const wrap = el.closest('label'); if (wrap) parts.push(wrap.textContent);
    return parts.filter(Boolean).map((p) => String(p).toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean);
  };
  /** O tipo do campo (ou null). */
  function typeOf(el) {
    if (!fillable(el) || el.disabled || el.readOnly) return null;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter((x) => !/^(section-|shipping|billing|home|work|mobile)/.test(x)).pop();
    if (ac === 'off' || ac === 'new-password' || ac === 'current-password' || ac === 'username' || ac === 'one-time-code') {
      if (ac !== 'off') return null;
    } else if (ac && AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac];
    if (el.type === 'search') return null;
    const parts = labelsOf(el);
    if (!parts.length) return null;
    for (const [type, re] of HINTS) if (parts.some((p) => re.test(p))) return type;
    return null;
  }
  const scopeOf = (el) => el.form || el.closest('[role=dialog], [role=form], form, fieldset, main, section') || document;
  /** Campos reconhecidos de um formulário: [{ el, type }]. */
  function fieldsIn(scope) {
    return [...scope.querySelectorAll('input, select, textarea')]
      .filter((el) => isVisible(el))
      .map((el) => ({ el, type: typeOf(el) }))
      .filter((f) => f.type);
  }
  /** O formulário é de endereço (≥ 3 campos de endereço) ou de cartão (tem o número)? */
  function kindOf(el, fields) {
    const t = typeOf(el);
    if (!t || t === 'cc-csc') return null;
    if (CARD.has(t)) return fields.some((f) => f.type === 'cc-number') ? 'card' : null;
    if (!ADDRESS.has(t)) return null;
    const n = new Set(fields.filter((f) => ADDRESS.has(f.type)).map((f) => f.type)).size;
    const explicit = !!el.getAttribute('autocomplete') && AUTOCOMPLETE[(el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).pop()];
    // e-mail ou telefone sozinhos (logins, newsletters) não são formulário de endereço
    return n >= 3 || (explicit && n >= 2) ? 'address' : null;
  }

  /* foco: a interface mostra os endereços ou cartões salvos */
  let lastField = null;
  let blurTimer = null;
  // logo depois de preencher, o Kona devolve o foco à página: essa volta não reabre a lista
  let quietUntil = 0;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !fillable(el)) return;
    if (Date.now() < quietUntil) return;
    const fields = fieldsIn(scopeOf(el));
    const kind = kindOf(el, fields);
    if (!kind) return;
    clearTimeout(blurTimer);
    lastField = el;
    const r = el.getBoundingClientRect();
    ipcRenderer.send('af:focus', {
      kind,
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    });
  }, true);
  document.addEventListener('focusout', () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => ipcRenderer.send('af:blur'), 200); }, true);

  /* preencher: valor nativo + eventos, para sites com React/Vue perceberem */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  function setValue(el, v) {
    if (v == null || v === '') return;
    if (el instanceof HTMLSelectElement) {
      const want = norm(v);
      const opt = [...el.options].find((o) => norm(o.value) === want || norm(o.textContent) === want)
        || [...el.options].find((o) => want.length > 2 && (norm(o.textContent).startsWith(want) || want.startsWith(norm(o.textContent)) && norm(o.textContent).length > 2));
      if (!opt) return;
      el.value = opt.value;
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /** Valor de cada tipo de campo a partir de um endereço/cartão, conforme o formulário. */
  function valuesFor(kind, d, fields, el) {
    const has = (t) => fields.some((f) => f.type === t);
    if (kind === 'card') {
      const mm = String(d.expMonth || '').padStart(2, '0');
      const yyyy = String(d.expYear || '');
      return (t, field) => {
        if (t === 'cc-name') return d.name;
        if (t === 'cc-number') return d.number;
        if (t === 'cc-exp-month') {
          if (field instanceof HTMLSelectElement && [...field.options].some((o) => o.value === String(Number(mm)))) return String(Number(mm));
          return mm;
        }
        if (t === 'cc-exp-year') {
          const two = yyyy.slice(-2);
          if (field instanceof HTMLSelectElement) return [...field.options].some((o) => o.value === yyyy || o.textContent.trim() === yyyy) ? yyyy : two;
          return (field.maxLength > 0 && field.maxLength <= 2) || /yy(?!yy)|aa(?!aa)/i.test(field.placeholder) ? two : yyyy;
        }
        if (t === 'cc-exp') return (field.maxLength > 0 && field.maxLength < 7) || !/yyyy|aaaa/i.test(field.placeholder || '') ? `${mm}/${yyyy.slice(-2)}` : `${mm}/${yyyy}`;
        return null;
      };
    }
    const streetLine = [d.street, !has('number') && d.number].filter(Boolean).join(', ');
    return (t) => ({
      name: d.name || [d.given, d.family].filter(Boolean).join(' '),
      given: d.given || (d.name || '').split(' ')[0],
      family: d.family || (d.name || '').split(' ').slice(1).join(' '),
      org: d.org,
      'street-address': [streetLine, !has('complement') && d.complement, !has('neighborhood') && d.neighborhood].filter(Boolean).join(el instanceof HTMLTextAreaElement ? '\n' : ', '),
      street: streetLine,
      number: d.number,
      complement: d.complement,
      neighborhood: d.neighborhood,
      city: d.city, state: d.state, postal: d.postal, country: d.country, tel: d.tel, email: d.email,
    }[t]);
  }
  ipcRenderer.on('af:fill', (_e, { kind, data }) => {
    quietUntil = Date.now() + 1000;
    const anchor = lastField && lastField.isConnected ? lastField : null;
    if (!anchor || !data) return;
    const fields = fieldsIn(scopeOf(anchor));
    const value = valuesFor(kind, data, fields, anchor);
    const set = kind === 'card' ? CARD : ADDRESS;
    for (const f of fields) {
      if (!set.has(f.type) || f.type === 'cc-csc') continue;
      // não apaga o que a pessoa já digitou em outro campo, a não ser no focado
      if (f.el !== anchor && f.el.value && !(f.el instanceof HTMLSelectElement)) continue;
      setValue(f.el, value(f.type, f.el));
    }
  });

  /* envio: o que foi preenchido no formulário (para oferecer salvar) */
  let sentAt = 0;
  function capture(from) {
    if (Date.now() - sentAt < 800) return;
    const fields = fieldsIn(from ? scopeOf(from) : document).filter((f) => f.el.value && f.type !== 'cc-csc');
    if (!fields.length) return;
    const pick = (t) => { const f = fields.find((x) => x.type === t); if (!f) return ''; return f.el instanceof HTMLSelectElement ? (f.el.selectedOptions[0]?.textContent || f.el.value).trim() : f.el.value.trim(); };
    const card = fields.some((f) => f.type === 'cc-number') ? {
      name: pick('cc-name'), number: pick('cc-number').replace(/[\s-]/g, ''),
      exp: pick('cc-exp'), expMonth: pick('cc-exp-month'), expYear: pick('cc-exp-year'),
    } : null;
    const types = new Set(fields.filter((f) => ADDRESS.has(f.type)).map((f) => f.type));
    const address = types.size >= 3 ? {
      name: pick('name') || [pick('given'), pick('family')].filter(Boolean).join(' '),
      org: pick('org'), street: pick('street') || pick('street-address'), number: pick('number'), complement: pick('complement'),
      neighborhood: pick('neighborhood'), city: pick('city'), state: pick('state'), postal: pick('postal'),
      country: pick('country'), tel: pick('tel'), email: pick('email'),
    } : null;
    if (!card && !address) return;
    sentAt = Date.now();
    ipcRenderer.send('af:submit', { address, card });
  }
  document.addEventListener('submit', (e) => capture(e.target.querySelector?.('input, select') || null), true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('button, input[type=submit], [role=button]');
    if (!b) return;
    const scope = b.form || scopeOf(b);
    if (scope !== document && fieldsIn(scope).some((f) => f.el.value && (f.type === 'cc-number' || ADDRESS.has(f.type)))) capture(scope.querySelector('input, select'));
  }, true);
}
