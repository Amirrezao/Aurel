/* Maison Aurel concept site: small page runtime.
   Renders the markup inside <x-dc> from the values returned by the page's
   Component.renderVals(), and updates it in place when state changes. */
(function () {
  'use strict';

  function DCLogic(props) { this.props = props || {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state || {}) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = String(path).trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (path !== '' && !isNaN(path)) return Number(path);
    var parts = path.split('.'), value = scope;
    for (var i = 0; i < parts.length; i++) {
      if (value == null) return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  function fill(text, scope) {
    return text.replace(HOLE, function (all, path) {
      var value = lookup(path, scope);
      return value == null ? '' : String(value);
    });
  }

  function listen(el, ev) {
    el._l[ev] = true;
    el.addEventListener(ev, function (e) {
      var handler = el._h[ev];
      if (typeof handler === 'function') handler(e);
    });
  }

  function children(node, scope, out) {
    for (var c = node.firstChild; c; c = c.nextSibling) build(c, scope, out);
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) {
      var text = document.createTextNode(fill(node.data, scope));
      text._t = text.data;
      out.push(text);
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.nodeName.toLowerCase();
    if (tag === 'sc-for') {
      var m = WHOLE.exec(node.getAttribute('list') || '');
      var list = (m ? lookup(m[1], scope) : null) || [];
      var as = node.getAttribute('as') || 'item';
      list.forEach(function (item, i) {
        var inner = Object.create(scope);
        inner[as] = item;
        inner.$index = i;
        children(node, inner, out);
      });
      return;
    }
    if (tag === 'sc-if') {
      var c = WHOLE.exec(node.getAttribute('value') || '');
      if (c && lookup(c[1], scope)) children(node, scope, out);
      return;
    }
    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(tag);
    el._a = {}; el._h = {}; el._l = {};
    for (var i = 0; i < node.attributes.length; i++) {
      var name = node.attributes[i].name, raw = node.attributes[i].value;
      if (name.indexOf('hint-') === 0) continue;
      var whole = WHOLE.exec(raw);
      if (name.slice(0, 2) === 'on' && whole) {
        var ev = name.slice(2);
        if (ev === 'change' && tag === 'input') ev = 'input';
        el._h[ev] = lookup(whole[1], scope);
        listen(el, ev);
        continue;
      }
      var value = whole ? lookup(whole[1], scope) : fill(raw, scope);
      if (value === false || value == null) continue;
      value = String(value);
      el._a[name] = value;
      el.setAttribute(name, value);
    }
    var kids = [];
    children(node, scope, kids);
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  /* Update the live nodes in place. Only attributes whose rendered value
     changed are written, so styles set by page scripts survive a re-render. */
  function morph(parent, fresh) {
    var old = Array.prototype.slice.call(parent.childNodes), i, name, ev;
    for (i = 0; i < fresh.length; i++) {
      var n = fresh[i], o = old[i];
      if (!o) { parent.appendChild(n); continue; }
      var known = o.nodeType === 3 ? ('_t' in o) : !!o._a;
      if (!known || o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) { parent.replaceChild(n, o); continue; }
      if (n.nodeType === 3) {
        if (o._t !== n._t) { o.data = n.data; o._t = n._t; }
        continue;
      }
      for (name in n._a) {
        if (o._a[name] !== n._a[name]) {
          o.setAttribute(name, n._a[name]);
          if (name === 'value') o.value = n._a[name];
        }
      }
      for (name in o._a) if (!(name in n._a)) o.removeAttribute(name);
      o._a = n._a;
      o._h = n._h;
      for (ev in n._h) if (!o._l[ev]) listen(o, ev);
      morph(o, Array.prototype.slice.call(n.childNodes));
    }
    for (i = fresh.length; i < old.length; i++) parent.removeChild(old[i]);
  }

  /* Shared bag, kept in the visitor's browser so it follows them between pages. */
  var KEY = 'aurel-bag', memory = [];
  var store = {
    read: function () {
      try {
        var rows = JSON.parse(window.localStorage.getItem(KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
      } catch (e) { return memory; }
    },
    write: function (rows) {
      memory = rows;
      try { window.localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {}
    },
    add: function (row) {
      var rows = store.read(), hit = null;
      row.engrave = row.engrave || '';
      row.size = row.size || '';
      rows.forEach(function (r) {
        if (r.no === row.no && r.strap === row.strap && (r.engrave || '') === row.engrave && (r.size || '') === row.size) hit = r;
      });
      if (hit) hit.qty = Math.min(9, (hit.qty || 1) + 1);
      else rows.push({ no: row.no, strap: row.strap, size: row.size, engrave: row.engrave, qty: 1 });
      store.write(rows);
    },
    count: function () {
      return store.read().reduce(function (n, r) { return n + (r.qty || 0); }, 0);
    }
  };
  window.AUREL = store;

  function boot() {
    var root = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    if (!root || !script) return;
    /* The markup ships inside an inert <template>, so placeholders such as
       {{x}} are never parsed as live SVG attributes before the page fills them. */
    /* A static snapshot of the page ships for search engines and visitors
       without JavaScript; the live page replaces it here. */
    var snap = root.querySelector('[data-prerendered]');
    if (snap) root.removeChild(snap);
    var inert = root.querySelector('template[data-dc]');
    var source = inert ? inert.content : root;
    if (inert) root.removeChild(inert);
    var helmet = source.querySelector('helmet');
    if (helmet) {
      while (helmet.firstChild) document.head.appendChild(helmet.firstChild);
      helmet.parentNode.removeChild(helmet);
    }
    var template = source;
    if (!inert) {
      template = document.createDocumentFragment();
      while (source.firstChild) template.appendChild(source.firstChild);
    }

    var defs = {}, props = {};
    try { defs = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) {}
    Object.keys(defs).forEach(function (key) {
      if (key.charAt(0) !== '$' && defs[key] && 'default' in defs[key]) props[key] = defs[key].default;
    });

    var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    var page = new Component(props);
    if (!page.props) page.props = props;
    page.__render = function () {
      var out = [];
      children(template, page.renderVals(), out);
      morph(root, out);
    };
    page.__render();
    root.setAttribute('data-ready', '');
    if (page.componentDidMount) page.componentDidMount();
  }

  /* Cinematic page transitions (cross-document View Transitions).
     A link with data-vt="<selector>" names the element that flies; on the next
     page the element marked data-vt-land receives it. Browsers without support
     simply change page as usual. */
  var FLIGHT = 'aurel-watch', FLAG = 'aurel-vt', launch = null;
  function nameFor(el, name, vt) {
    if (!el) return;
    el.style.viewTransitionName = name;
    if (vt && vt.finished) vt.finished.then(clear, clear);
    function clear() { el.style.viewTransitionName = ''; }
  }
  function flag(v) {
    try { if (v) sessionStorage.setItem(FLAG, '1'); else sessionStorage.removeItem(FLAG); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-vt]');
    launch = link ? document.querySelector(link.getAttribute('data-vt')) : null;
  }, true);
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition || !launch) { flag(false); return; }
    nameFor(launch, FLIGHT, e.viewTransition);
    flag(true);
  });
  window.addEventListener('pagereveal', function (e) {
    var armed = false;
    try { armed = sessionStorage.getItem(FLAG) === '1'; } catch (err) {}
    flag(false);
    if (!e.viewTransition) return;
    if (armed) nameFor(document.querySelector('[data-vt-land]'), FLIGHT, e.viewTransition);
  });
  function frame() {
    var header = document.querySelector('[data-vt-header]');
    if (header) header.style.viewTransitionName = 'aurel-header';
  }

  /* The script sits at the end of <body>, after the page markup, so the page
     renders before the first paint and the transition captures the finished page. */
  if (document.querySelector('x-dc') && document.querySelector('script[data-dc-script]')) { boot(); frame(); }
  else document.addEventListener('DOMContentLoaded', function () { boot(); frame(); });
})();
