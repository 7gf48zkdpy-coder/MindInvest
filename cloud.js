// ============================================================
//  Mindinvest : connexion à la base de données Supabase
// ============================================================
// Remplace le stockage de l'ancien artifact. L'appli appelle
// MindCloud.use('user') et MindCloud.use('db') ; ce fichier
// répond avec le compte Supabase et une petite base « documents »
// (table public.mi_docs, protégée par les règles d'accès RLS).
// Le projet Supabase est partagé avec Finly : même compte, données séparées.
//
// La clé « publishable » est faite pour être publique : les données
// sont protégées par les règles de la base (Row Level Security).
(function () {
  var SUPABASE_URL = "https://kfyblltpzbbkbqcgcgyu.supabase.co";
  var SUPABASE_KEY = "sb_publishable_59-vAMgtakYJx58HkFoXjQ_57HSY7FH";
  var LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

  var clientP = null;
  function client() {
    if (!clientP) clientP = import(LIB).then(function (m) {
      return m.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "mindinvest-auth" } });
    });
    return clientP;
  }

  // Session : on reprend la session enregistrée, sinon connexion invité (anonyme)
  var sessionP = null;
  function session() {
    if (!sessionP) sessionP = client().then(function (sb) {
      return sb.auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (s && s.user) return { sb: sb, user: s.user };
        return sb.auth.signInAnonymously().then(function (a) {
          if (a.error || !a.data || !a.data.user) throw a.error || new Error("auth");
          return { sb: sb, user: a.data.user };
        });
      });
    }).catch(function (e) { sessionP = null; throw e; });
    return sessionP;
  }

  function err(e) { var x = new Error((e && e.message) || "erreur"); x.code = (e && e.code) || "erreur"; return x; }

  /* ---------- base « documents » ---------- */
  function split(path) { var i = path.lastIndexOf("/"); return { coll: path.slice(0, i), id: path.slice(i + 1) }; }
  function snap(path, row) {
    var p = split(path);
    return { id: p.id, exists: !!row, data: function () { return row ? JSON.parse(JSON.stringify(row.data)) : undefined; } };
  }
  function qsnap(rows) {
    var docs = rows.map(function (r) { return snap(r.path, r); });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
  }

  function makeDb(sb) {
    function doc(path) {
      return {
        id: split(path).id,
        get: function () {
          return sb.from("mi_docs").select("path,data").eq("path", path).maybeSingle().then(function (r) {
            if (r.error) throw err(r.error); return snap(path, r.data);
          });
        },
        set: function (data) {
          var p = split(path);
          return sb.from("mi_docs").upsert({ path: path, coll: p.coll, id: p.id, data: data, updated_at: new Date().toISOString() }, { onConflict: "path" }).then(function (r) {
            if (r.error) throw err(r.error);
          });
        },
        delete: function () {
          return sb.from("mi_docs").delete().eq("path", path).then(function (r) { if (r.error) throw err(r.error); });
        }
      };
    }
    function collection(coll) {
      var filters = [], lim = 1000;
      var q = {
        where: function (field, op, value) { filters.push([field, op, value]); return q; },
        limit: function (n) { lim = n; return q; },
        doc: function (id) { return doc(coll + "/" + id); },
        get: function () {
          var req = sb.from("mi_docs").select("path,data").eq("coll", coll);
          filters.forEach(function (f) {
            var o = {};
            if (f[1] === "==") { o[f[0]] = f[2]; req = req.contains("data", o); }
            else if (f[1] === "array-contains") { o[f[0]] = [f[2]]; req = req.contains("data", o); }
          });
          return req.order("updated_at", { ascending: false }).limit(lim).then(function (r) {
            if (r.error) throw err(r.error); return qsnap(r.data || []);
          });
        },
        // Suivi en direct : mise à jour dès qu'un document de la collection change,
        // plus une vérification toutes les 15 s (au cas où le direct est coupé).
        onSnapshot: function (cb, onErr) {
          var stopped = false, timer = null, chan = null, busy = false, again = false;
          function load() {
            if (stopped) return; if (busy) { again = true; return; } busy = true;
            q.get().then(function (s) { if (!stopped) cb(s); }).catch(function (e) { if (!stopped && onErr) onErr(e); })
              .then(function () { busy = false; if (again) { again = false; load(); } });
          }
          load();
          timer = setInterval(function () { if (document.visibilityState === "visible") load(); }, 15000);
          try {
            chan = sb.channel("docs-" + coll.replace(/[^a-z0-9]/gi, "_") + "-" + Math.random().toString(36).slice(2, 8))
              .on("postgres_changes", { event: "*", schema: "public", table: "mi_docs", filter: "coll=eq." + coll }, function () { load(); })
              .subscribe();
          } catch (e) { /* le contrôle toutes les 15 s suffit */ }
          return function () { stopped = true; clearInterval(timer); if (chan) sb.removeChannel(chan); };
        }
      };
      return q;
    }
    return { doc: doc, collection: collection };
  }

  /* ---------- compte ---------- */
  function makeUser(sb, user) {
    return {
      me: function () {
        return sb.auth.getUser().then(function (r) {
          var u = (r.data && r.data.user) || user, md = u.user_metadata || {};
          return { id: u.id, name: md.name || "", avatarUrl: "", email: u.email || "", anonymous: !!u.is_anonymous };
        });
      },
      isOwner: function () {
        return sb.rpc("is_admin").then(function (r) { return !r.error && r.data === true; });
      }
    };
  }

  /* ---------- actions de compte (écran Profil) ---------- */
  var account = {
    // Garde la même progression : le compte invité reçoit un e-mail et un mot de passe
    create: function (email, password) {
      return session().then(function (s) {
        return s.sb.functions.invoke("link-account", { body: { email: email, password: password } }).then(function (r) {
          if (r.error) {
            var ctx = r.error.context;
            if (ctx && typeof ctx.json === "function") return ctx.json().then(function (j) { throw new Error((j && j.error) || "Création impossible, réessaie."); }, function () { throw new Error("Création impossible, réessaie."); });
            throw new Error("Création impossible, réessaie.");
          }
          if (r.data && r.data.error) throw new Error(r.data.error);
          return s.sb.auth.refreshSession();
        });
      });
    },
    // Connexion sur un autre téléphone : la progression du compte remplace celle de l'appareil
    login: function (email, password) {
      return client().then(function (sb) {
        return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
          if (r.error) throw new Error(/invalid/i.test(r.error.message) ? "E-mail ou mot de passe incorrect. Pas encore de compte ? Reviens en arrière et touche « Créer un compte avec e-mail et mot de passe »." : /banned/i.test(r.error.message) ? "Ce compte est bloqué." : "Connexion impossible, réessaie.");
          try { localStorage.setItem("mi-adopt", "1"); } catch (e) {}
          return r.data && r.data.user;
        });
      });
    },
    logout: function () {
      return client().then(function (sb) { return sb.auth.signOut(); }).then(function () {
        try { localStorage.setItem("mi-adopt", "1"); } catch (e) {}
      });
    },
    password: function (pw) {
      return client().then(function (sb) {
        return sb.auth.updateUser({ password: pw }).then(function (r) { if (r.error) throw new Error("Modification impossible, réessaie."); });
      });
    },
    // Connexion avec Google (le compte invité est relié à Google quand c'est possible, pour garder la progression)
    google: function () {
      var back = location.origin + location.pathname;
      // on vérifie d'abord que Google est activé dans Supabase (sinon on resterait bloqué sur une page d'erreur)
      return fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_KEY } }).then(function (r) { return r.json(); }).then(function (st) {
        if (!(st && st.external && st.external.google)) throw new Error("La connexion Google n'est pas encore activée. Utilise ton e-mail en attendant.");
        return client();
      }).then(function (sb) {
        try { localStorage.setItem("mi-adopt", "1"); } catch (e) {}
        return sb.auth.getSession().then(function (r) {
          var u = r.data && r.data.session && r.data.session.user;
          var go = function () { return sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } }); };
          var p = u && u.is_anonymous && sb.auth.linkIdentity ? sb.auth.linkIdentity({ provider: "google", options: { redirectTo: back } }).then(function (x) { return x.error ? go() : x; }) : go();
          return p.then(function (x) { if (x && x.error) throw new Error(/provider is not enabled|Unsupported provider/i.test(x.error.message) ? "La connexion Google n'est pas encore activée." : "Connexion Google impossible, réessaie."); });
        });
      });
    },
    // Code à usage unique envoyé par e-mail
    sendCode: function (email, create) {
      return client().then(function (sb) {
        return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: !!create } }).then(function (r) {
          if (r.error) throw new Error(/rate|seconds/i.test(r.error.message) ? "Patiente une minute avant de redemander un code." : /signups? not allowed|not found/i.test(r.error.message) ? "Aucun compte avec cet e-mail." : "Envoi du code impossible, réessaie.");
        });
      });
    },
    verifyCode: function (email, code) {
      return client().then(function (sb) {
        return sb.auth.verifyOtp({ email: email, token: String(code).replace(/\s/g, ""), type: "email" }).then(function (r) {
          if (r.error) throw new Error("Code incorrect ou expiré.");
          try { localStorage.setItem("mi-adopt", "1"); } catch (e) {}
          return r.data && r.data.user;
        });
      });
    },
    // Informations du compte connecté
    info: function () {
      return client().then(function (sb) {
        return sb.auth.getUser().then(function (r) {
          var u = r.data && r.data.user; if (!u) return null;
          return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
            return sb.auth.mfa.listFactors().then(function (f) {
              var totp = ((f.data && f.data.totp) || []).filter(function (x) { return x.status === "verified"; });
              return { id: u.id, email: u.email || "", anonymous: !!u.is_anonymous, providers: (u.app_metadata && u.app_metadata.providers) || [],
                emailCode: !!(u.user_metadata && u.user_metadata.mfa_email), totp: totp.map(function (x) { return x.id; }),
                aal: a.data ? a.data.currentLevel : "aal1", next: a.data ? a.data.nextLevel : "aal1" };
            });
          });
        });
      });
    },
    // Double sécurité : appli de codes (TOTP)
    totpStart: function () {
      return client().then(function (sb) {
        return sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Mindinvest " + new Date().toISOString().slice(0, 16) }).then(function (r) {
          if (r.error) throw new Error("Activation impossible, réessaie.");
          return { id: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret, uri: r.data.totp.uri };
        });
      });
    },
    totpCheck: function (factorId, code) {
      return client().then(function (sb) {
        var go = function (id) { return sb.auth.mfa.challengeAndVerify({ factorId: id, code: String(code).replace(/\s/g, "") }).then(function (r) { if (r.error) throw new Error("Code incorrect, réessaie."); }); };
        if (factorId) return go(factorId);
        return sb.auth.mfa.listFactors().then(function (f) {
          var t = ((f.data && f.data.totp) || []).filter(function (x) { return x.status === "verified"; })[0];
          if (!t) throw new Error("Aucune appli de codes reliée."); return go(t.id);
        });
      });
    },
    totpRemove: function (factorId) {
      return client().then(function (sb) {
        return sb.auth.mfa.unenroll({ factorId: factorId }).then(function (r) { if (r.error) throw new Error("Entre d'abord un code de ton appli pour confirmer."); });
      });
    },
    // Double sécurité : code par e-mail à chaque connexion
    emailCode: function (on) {
      return client().then(function (sb) {
        return sb.auth.updateUser({ data: { mfa_email: !!on } }).then(function (r) { if (r.error) throw new Error("Modification impossible, réessaie."); });
      });
    }
  };

  window.MindCloud = {
    account: account,
    use: function (name) {
      if (name === "user") return session().then(function (s) { return makeUser(s.sb, s.user); });
      if (name === "db") return session().then(function (s) { return makeDb(s.sb); });
      // IA intégrée et enregistrement de fichiers : fonctions propres à claude.ai,
      // l'appli bascule automatiquement sur ses solutions de secours.
      return Promise.reject(Object.assign(new Error("indisponible"), { code: "unavailable" }));
    }
  };
})();
