// Preload das páginas para o gerenciador de senhas (roda num mundo isolado: os scripts do site não
// alcançam este código nem o ipcRenderer). Avisa quando um campo de login é focado, preenche quando
// a pessoa escolhe uma conta na interface e percebe o envio de um login para oferecer salvar.
// Nunca pede senhas: só as recebe do processo principal depois de a pessoa escolher a conta.
const { ipcRenderer } = require('electron');

if (/^https?:$/.test(location.protocol)) {
  const USER_HINT = /user|login|email|e-mail|account|conta|identifier|usuario|usuário|nome|phone|tel/i;
  const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const passwordFields = (root) => [...(root || document).querySelectorAll('input[type=password]')].filter((el) => !el.disabled && isVisible(el));
  const isUserField = (el) => el instanceof HTMLInputElement && ['text', 'email', 'tel', ''].includes(el.type)
    && (/username|email/.test(el.autocomplete) || el.type === 'email' || USER_HINT.test(`${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') || ''}`));
  const scopeOf = (el) => el.form || el.closest('[role=dialog], [role=form], main, section') || document;
  /** Campo de usuário de um formulário: o último campo de texto/e-mail antes da senha. */
  function userFieldFor(pw) {
    const scope = scopeOf(pw);
    const inputs = [...scope.querySelectorAll('input')].filter((el) => !el.disabled && isVisible(el));
    const i = inputs.indexOf(pw);
    const before = (i >= 0 ? inputs.slice(0, i) : inputs).reverse();
    return before.find(isUserField) || before.find((el) => ['text', 'email', 'tel'].includes(el.type)) || null;
  }
  const isSignup = (el) => {
    const scope = scopeOf(el);
    return el.autocomplete === 'new-password' || passwordFields(scope).length >= 2
      || /sign ?up|register|create (an |your )?account|criar conta|cadastr/i.test(scope.textContent?.slice(0, 2000) || '');
  };

  /* foco: a interface mostra as contas salvas (e o gerador de senha em cadastros) */
  let blurTimer = null;
  let lastField = null;
  // logo depois de preencher, o Kona devolve o foco à página: essa volta não reabre a lista
  let quietUntil = 0;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (Date.now() < quietUntil) return;
    const isPw = el.type === 'password';
    if (!isPw && !(isUserField(el) && (passwordFields(scopeOf(el)).length || passwordFields().length))) return;
    clearTimeout(blurTimer);
    lastField = el;
    const r = el.getBoundingClientRect();
    ipcRenderer.send('pw:focus', {
      fieldType: isPw ? 'password' : 'username',
      newPassword: isPw && isSignup(el),
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    });
  }, true);
  document.addEventListener('focusout', () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => ipcRenderer.send('pw:blur'), 200); }, true);

  /* preencher: valor nativo + eventos, para sites com React/Vue perceberem */
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  ipcRenderer.on('pw:fill', (_e, { username, password, generated }) => {
    quietUntil = Date.now() + 1000;
    const anchor = lastField && lastField.isConnected ? lastField : passwordFields()[0];
    if (!anchor) return;
    const scope = scopeOf(anchor);
    const pws = passwordFields(scope);
    if (generated) {
      // senha nova: no campo focado e no de confirmação
      for (const pw of pws.length ? pws : [anchor]) if (pw === anchor || !pw.value) setValue(pw, password);
      return;
    }
    const pw = anchor.type === 'password' ? anchor : pws[0];
    const user = anchor.type === 'password' ? userFieldFor(anchor) : anchor;
    if (user && username) setValue(user, username);
    if (pw && password) setValue(pw, password);
  });

  /* envio de um login: senha preenchida + (Enter | botão | submit) */
  let sentAt = 0;
  function capture(from) {
    const scope = from ? scopeOf(from) : document;
    const pws = passwordFields(scope).filter((el) => el.value);
    if (pws.length) {
      if (Date.now() - sentAt < 800) return;
      sentAt = Date.now();
      // cadastro/troca de senha: a nova é a última preenchida
      const pw = pws.length >= 2 ? pws[pws.length - 1] : pws[0];
      const user = userFieldFor(pws[0]);
      ipcRenderer.send('pw:submit', { username: user?.value || '', password: pw.value });
      return;
    }
    // primeira etapa de logins em duas telas (ex.: Google): só o usuário
    const u = from && (isUserField(from) ? from : [...scope.querySelectorAll('input')].find((el) => isUserField(el) && el.value && isVisible(el)));
    if (u?.value) ipcRenderer.send('pw:username', u.value);
  }
  document.addEventListener('submit', (e) => capture(e.target), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.target.type === 'password' || isUserField(e.target))) capture(e.target);
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('button, input[type=submit], [role=button]');
    if (!b) return;
    const near = b.form || scopeOf(b);
    if (passwordFields(near).some((el) => el.value) || (near !== document && [...near.querySelectorAll('input')].some((el) => isUserField(el) && el.value))) capture(b.form ? b.form.querySelector('input') : near.querySelector?.('input'));
  }, true);
}
