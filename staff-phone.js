// Staff page: register by phone number (no email) and a "New password" button on every staff card.
(function () {
  'use strict';
  var FN = 'hyper-action';
  var cfg = window.SOMESHA_CONFIG;
  if (!cfg || !window.supabase) { return; }
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  var old = document.getElementById('reg-panel');
  var list = document.getElementById('staff-list');
  if (!old || !old.parentNode || !list) { return; }

  function $(id) { return document.getElementById(id); }
  function showErr(id, t) { var e = $(id); if (e) { e.textContent = t; e.hidden = !t; } }
  function normPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10 && d.charAt(0) === '0') { d = '254' + d.slice(1); }
    else if (d.length === 9 && /^[17]/.test(d)) { d = '254' + d; }
    return /^254[17]\d{8}$/.test(d) ? d : '';
  }
  function explain(err) {
    var fallback = (err && err.message) || 'Something went wrong. Please try again.';
    if (err && err.context && typeof err.context.json === 'function') {
      return err.context.json().then(function (j) { return (j && j.error) || fallback; }).catch(function () { return fallback; });
    }
    return Promise.resolve(fallback);
  }
  function line(parent, label, value, big) {
    var p = document.createElement('p');
    p.setAttribute('data-wa', '1');
    p.style.margin = '6px 0';
    p.textContent = label + ': ' + value;
    if (big) { p.style.fontSize = '20px'; p.style.fontWeight = '800'; p.style.letterSpacing = '1px'; p.style.wordBreak = 'break-all'; }
    parent.appendChild(p);
  }

  // The green card with the sign-in details, a WhatsApp button and a Copy button.
  function resultCard(title, name, d, kind) {
    var out = document.createElement('div');
    out.className = 'ok pin-out';
    var h = document.createElement('div');
    h.style.fontWeight = '800';
    h.textContent = title;
    out.appendChild(h);
    var login = d.login || d.phone;
    line(out, 'Sign in with', login, false);
    line(out, 'Password', d.pin, true);
    var msg = 'Hello ' + name + ', this is Ngurubani Junior School. ' +
      (kind === 'new'
        ? 'You can now sign in to Somesha at https://somesha.vercel.app . Sign in with ' + login + ' and password ' + d.pin + '.'
        : 'Your new Somesha password is ' + d.pin + '. Sign in with ' + login + ' at https://somesha.vercel.app .') +
      ' Please change it to your own password after signing in, and keep it private.';
    var ph = normPhone(d.phone);
    if (ph) {
      var wa = document.createElement('a');
      wa.className = 'btn small';
      wa.style.display = 'inline-block'; wa.style.textDecoration = 'none';
      wa.target = '_blank'; wa.rel = 'noopener';
      wa.href = 'https://wa.me/' + ph + '?text=' + encodeURIComponent(msg);
      wa.textContent = 'Send by WhatsApp';
      out.appendChild(wa);
    }
    var cp = document.createElement('button');
    cp.type = 'button'; cp.className = 'btn small secondary'; cp.textContent = 'Copy';
    cp.addEventListener('click', function () {
      if (navigator.clipboard) { navigator.clipboard.writeText(msg); cp.textContent = 'Copied'; }
    });
    out.appendChild(cp);
    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'This password is shown only once. Give it to the teacher and nobody else.';
    out.appendChild(hint);
    return out;
  }

  // ----- the registration panel (replaces the email one) -----
  old.hidden = true;
  var panel = document.createElement('details');
  panel.className = 'panel';
  panel.open = true;
  panel.innerHTML =
    '<summary>Register someone (phone number)</summary>' +
    '<p class="hint">No email needed. They sign in with their phone number and a password that is made for them.</p>' +
    '<form id="sp-form" novalidate>' +
    '<label for="sp-name">Full name</label><input id="sp-name" type="text" autocomplete="off">' +
    '<label for="sp-phone">Phone number</label><input id="sp-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="0712345678">' +
    '<div class="checks"><input id="sp-admin" type="checkbox"><label for="sp-admin">Make this person an admin</label></div>' +
    '<p id="sp-error" class="error" role="alert" hidden></p>' +
    '<button id="sp-btn" type="submit" class="btn">Register</button></form>' +
    '<div id="sp-result" hidden></div>';
  old.parentNode.insertBefore(panel, old);

  $('sp-form').addEventListener('submit', function (e) {
    e.preventDefault();
    showErr('sp-error', '');
    var name = $('sp-name').value.replace(/\s+/g, ' ').trim();
    var phone = $('sp-phone').value.trim();
    if (!name || !phone) { showErr('sp-error', 'Please enter the full name and the phone number.'); return; }
    var btn = $('sp-btn'); btn.disabled = true; btn.textContent = 'Registering...';
    sb.functions.invoke(FN, { body: { action: 'staff', name: name, phone: phone, is_admin: $('sp-admin').checked } }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Register';
      if (res.error) { return explain(res.error).then(function (m) { showErr('sp-error', m); }); }
      var box = $('sp-result');
      box.textContent = '';
      box.appendChild(resultCard(name + ' is registered', name, res.data, 'new'));
      var next = document.createElement('p');
      next.className = 'hint';
      next.textContent = 'Next: tap Done, then open their card in the list below to give them classes and subjects.';
      box.appendChild(next);
      var done = document.createElement('button');
      done.type = 'button'; done.className = 'btn small secondary'; done.textContent = 'Done';
      done.addEventListener('click', function () { window.location.reload(); });
      box.appendChild(done);
      box.hidden = false;
      $('sp-form').hidden = true;
    });
  });

  // ----- "New password" button on every staff card -----
  var ids = null;
  function keyOf(name, phone) {
    return String(name || '').replace(/\s+/g, ' ').trim() + '|' + String(phone || '').replace(/\s+/g, ' ').trim();
  }
  function loadIds() {
    return sb.from('profiles').select('id, full_name, phone').eq('kind', 'staff').then(function (r) {
      ids = {};
      (r.data || []).forEach(function (p) { ids[keyOf(p.full_name, p.phone)] = p.id; });
    });
  }
  function idFor(card) {
    var n = card.querySelector('.pname'), m = card.querySelector('.pmeta');
    var phone = m ? m.textContent.trim() : '';
    if (phone === 'No phone number') { phone = ''; }
    var k = keyOf(n ? n.textContent : '', phone);
    if (ids && ids[k]) { return Promise.resolve(ids[k]); }
    return loadIds().then(function () { return (ids && ids[k]) || null; });
  }
  function clearOld(card) {
    var o = card.querySelector('.pin-out'); if (o) { o.parentNode.removeChild(o); }
    var e = card.querySelector('.pin-err'); if (e) { e.parentNode.removeChild(e); }
  }
  function cardErr(card, text) {
    clearOld(card);
    var e = document.createElement('p');
    e.className = 'error pin-err'; e.textContent = text;
    card.appendChild(e);
  }
  function resetPw(card, btn) {
    var nameEl = card.querySelector('.pname');
    var name = nameEl ? nameEl.textContent : 'this person';
    if (!window.confirm('Make a new password for ' + name + '? Their old password will stop working.')) { return; }
    btn.disabled = true; btn.textContent = 'Working...';
    idFor(card).then(function (id) {
      if (!id) { throw new Error('Could not identify this person. Refresh the page and try again.'); }
      return sb.functions.invoke(FN, { body: { action: 'reset', id: id } });
    }).then(function (res) {
      btn.disabled = false; btn.textContent = 'New password';
      if (res.error) { return explain(res.error).then(function (m) { cardErr(card, m); }); }
      clearOld(card);
      card.appendChild(resultCard('New password for ' + name, name, res.data, 'reset'));
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = 'New password';
      cardErr(card, err.message || 'Something went wrong. Please try again.');
    });
  }
  function addButtons() {
    list.querySelectorAll('.person').forEach(function (card) {
      if (card.querySelector('.pw-btn')) { return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small secondary pw-btn'; b.textContent = 'New password';
      b.addEventListener('click', function () { resetPw(card, b); });
      card.appendChild(b);
    });
  }
  new MutationObserver(addButtons).observe(list, { childList: true });
  addButtons();
})();
