// Fake Firebase compat SDK: auth + firestore backed by a Node-side store via exposed binding __fsCall.
(function () {
  const call = (op, a) => window.__fsCall(op, a);
  const listeners = {}; let lid = 0;
  window.__fsNotify = function (id, payload) { const l = listeners[id]; if (l) try { l(payload); } catch (e) { console.error('snapshot cb error', e); } };
  function checkUndef(v, path) {
    if (v === undefined) throw new Error('Function DocumentReference.update() called with invalid data. Unsupported field value: undefined (found in field ' + path + ')');
    if (v && typeof v === 'object' && !(v instanceof FV)) {
      if (Array.isArray(v)) v.forEach((x, i) => checkUndef(x, path + '.' + i));
      else for (const k in v) checkUndef(v[k], path ? path + '.' + k : k);
    } else if (v instanceof FV && v.vals) v.vals.forEach((x, i) => checkUndef(x, path + '[fv]'));
  }
  function FV(kind, vals, n) { this.__fv = kind; if (vals) this.vals = vals; if (n !== undefined) this.n = n; }
  function enc(v) { // convert FV instances to plain marker objects
    if (v instanceof FV) return { __fv: v.__fv, vals: v.vals ? v.vals.map(enc) : undefined, n: v.n };
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
    return v;
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      if (v.__ts) { const ms = v.__ts; return { seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms, toDate: () => new Date(ms) }; }
      const o = {}; for (const k in v) o[k] = dec(v[k]); return o;
    }
    return v;
  }
  function snap(path, r) { return { id: path.split('/').pop(), exists: !!r, ref: new DocRef(path), data: () => (r ? dec(r) : undefined), get: (f) => (r ? dec(r)[f] : undefined) }; }
  function DocRef(path) { this.path = path; this.id = path.split('/').pop(); }
  DocRef.prototype.get = function () { return call('get', { path: this.path }).then(r => snap(this.path, r)); };
  DocRef.prototype.set = function (data, opts) { checkUndef(data, ''); return call('set', { path: this.path, data: enc(data), merge: !!(opts && opts.merge) }); };
  DocRef.prototype.update = function (a, b) { let data = a; if (typeof a === 'string') { data = {}; data[a] = b; } checkUndef(data, ''); return call('update', { path: this.path, data: enc(data) }); };
  DocRef.prototype.delete = function () { return call('delete', { path: this.path }); };
  DocRef.prototype.collection = function (c) { return new ColRef(this.path + '/' + c); };
  DocRef.prototype.onSnapshot = function (cb, err) {
    const id = 'l' + (++lid) + '_' + Math.random().toString(36).slice(2);
    const path = this.path;
    listeners[id] = (r) => cb(snap(path, r));
    call('listen', { path, id });
    return () => { delete listeners[id]; call('unlisten', { id }); };
  };
  function ColRef(path, filters) { this.path = path; this.filters = filters || []; this.id = path.split('/').pop(); }
  ColRef.prototype.doc = function (id) { if (!id) id = Math.random().toString(36).slice(2, 12); return new DocRef(this.path + '/' + id); };
  ColRef.prototype.where = function (f, op, v) { return new ColRef(this.path, this.filters.concat([[f, op, v]])); };
  ColRef.prototype.orderBy = function () { return this; };
  ColRef.prototype.limit = function () { return this; };
  ColRef.prototype.add = function (data) { const d = this.doc(); return d.set(data).then(() => d); };
  ColRef.prototype.get = function () {
    return call('query', { path: this.path, filters: this.filters }).then(rows => {
      const docs = rows.map(([p, r]) => snap(p, r));
      return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
    });
  };
  ColRef.prototype.onSnapshot = function (cb) { this.get().then(cb); return () => {}; };
  const db = {
    collection: (c) => new ColRef(c),
    doc: (p) => new DocRef(p),
    runTransaction: async function (fn) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const ops = []; const reads = {};
        const tx = {
          get: (ref) => call('get', { path: ref.path, withVer: true }).then(r => { reads[ref.path] = r ? r.ver : 0; return snap(ref.path, r ? r.doc : null); }),
          set: (ref, data, opts) => { checkUndef(data, ''); ops.push(['set', { path: ref.path, data: enc(data), merge: !!(opts && opts.merge) }]); return tx; },
          update: (ref, a, b) => { let data = a; if (typeof a === 'string') { data = {}; data[a] = b; } checkUndef(data, ''); ops.push(['update', { path: ref.path, data: enc(data) }]); return tx; },
          delete: (ref) => { ops.push(['delete', { path: ref.path }]); return tx; },
        };
        const res = await fn(tx);
        const ok = await call('commit', { ops, reads });
        if (ok) return res;
      }
      throw new Error('transaction contention');
    },
    batch: function () {
      const ops = [];
      const b = {
        set: (ref, data, opts) => { checkUndef(data, ''); ops.push(['set', { path: ref.path, data: enc(data), merge: !!(opts && opts.merge) }]); return b; },
        update: (ref, data) => { checkUndef(data, ''); ops.push(['update', { path: ref.path, data: enc(data) }]); return b; },
        delete: (ref) => { ops.push(['delete', { path: ref.path }]); return b; },
        commit: () => call('commit', { ops, reads: {} }),
      };
      return b;
    },
    waitForPendingWrites: () => Promise.resolve(),
    enablePersistence: () => Promise.resolve(),
    settings: () => {},
  };
  const firestoreFn = function () { return db; };
  firestoreFn.FieldValue = {
    arrayUnion: (...v) => new FV('arrayUnion', v),
    arrayRemove: (...v) => new FV('arrayRemove', v),
    increment: (n) => new FV('increment', null, n),
    delete: () => new FV('delete'),
    serverTimestamp: () => new FV('serverTimestamp'),
  };
  const user = window.__FAKE_USER || null;
  let authCbs = [];
  const auth = {
    currentUser: user,
    onAuthStateChanged: (cb) => { authCbs.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; },
    setPersistence: () => Promise.resolve(),
    signInWithEmailAndPassword: () => Promise.resolve({ user }),
    createUserWithEmailAndPassword: () => Promise.resolve({ user }),
    signInWithPopup: () => Promise.resolve({ user }),
    signOut: () => { auth.currentUser = null; authCbs.forEach(cb => cb(null)); return Promise.resolve(); },
  };
  const authFn = function () { return auth; };
  authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; };
  window.firebase = { initializeApp: () => ({}), apps: [], auth: authFn, firestore: firestoreFn };
})();
