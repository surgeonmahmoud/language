/* =====================================================================
   DrZiad — منطق التطبيق (Router + Views + Interactions)
   يعتمد على: data.js (DRZIAD_DATA), storage.js (DZStore), search.js (DZSearch)
   كل المحتوى من قاعدة المعرفة فقط — لا يُخترع أي رقم أو قاعدة.
   الأمان: كل النصوص تُدرج عبر textContent؛ ولا تُنفّذ أكواد مستوردة.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.DRZIAD_DATA;
  const S = window.DZStore;
  const Q = window.DZSearch;
  if (!D) { document.body.textContent = "تعذّر تحميل قاعدة البيانات (data.js)."; return; }

  /* ----------------------------- DOM helpers ----------------------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") { /* محظور للبيانات؛ يُستخدم فقط لأيقونات ثابتة */ el.innerHTML = v; }
        else if (k === "onclick") el.addEventListener("click", v);
        else if (k === "oninput") el.addEventListener("input", v);
        else if (k === "onchange") el.addEventListener("change", v);
        else if (k === "onsubmit") el.addEventListener("submit", v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k in el && k !== "list" && typeof v !== "object") { try { el[k] = v; } catch(e){ el.setAttribute(k, v);} }
        else el.setAttribute(k, v);
      }
    }
    appendKids(el, kids);
    return el;
  }
  function appendKids(el, kids) {
    kids.forEach(kid => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) appendKids(el, kid);
      else if (kid instanceof Node) el.appendChild(kid);
      else el.appendChild(document.createTextNode(String(kid)));
    });
  }
  const frag = (...kids) => { const f = document.createDocumentFragment(); appendKids(f, kids); return f; };
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); };
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = h("div", { id:"toast", class:"toast", role:"status", "aria-live":"polite" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ----------------------------- Reusable components ----------------------------- */
  function confMeta(level) { return D.confidenceLevels.find(c => c.level === level) || null; }
  function confBadge(level) {
    const m = confMeta(level);
    if (!m) return naText();
    return h("span", { class: "conf " + level, title: m.label + " — " + m.meaning, "aria-label": "مستوى الثقة " + m.label + ": " + m.meaning, role:"img" },
      h("span", { class:"dot", "aria-hidden":"true" }),
      h("span", { "aria-hidden":"true" }, m.icon + " "),
      m.level + " · " + m.label);
  }
  function naText(reason) {
    return h("span", { class:"notice-na", title: reason || "المعلومة غير متاحة في حزمة البيانات" }, "غير متاح");
  }
  function addedPill(added) {
    if (added === true) return h("span", { class:"conf pill-added" }, "مضافة للمجموع");
    if (added === false) return h("span", { class:"conf pill-not" }, "غير مضافة");
    return h("span", { class:"badge" }, "حسب الاختيار/السياق");
  }
  function card(...kids) { return h("div", { class:"card" }, ...kids); }
  function alertBox(type, title, body) {
    const icons = { warn:"⚠️", danger:"⛔", info:"ℹ️", ok:"✅" };
    return h("div", { class:"alert " + type, role: type==="danger"?"alert":"note" },
      h("span", { class:"ic", "aria-hidden":"true" }, icons[type] || "•"),
      h("div", { class:"body" }, title ? h("b", null, title + " ") : null, body));
  }
  function conflictCard(title, srcA, srcB, safe) {
    return h("div", { class:"alert danger" },
      h("span", { class:"ic" }, "⚔️"),
      h("div", { class:"body" },
        h("b", null, "تعارض يحتاج مراجعة: "), title,
        h("div", { class:"muted", style:"margin-top:.3rem" }, "المصدر (أ): " + srcA + " | المصدر (ب): " + srcB),
        h("div", { style:"margin-top:.3rem" }, h("b", null, "الإجراء الآمن: "), safe)));
  }
  function emptyState(msg, icon) {
    return h("div", { class:"empty" }, h("span", { class:"ic", "aria-hidden":"true" }, icon || "🔍"), msg);
  }
  function kv(pairs) {
    const dl = h("dl", { class:"kv" });
    pairs.forEach(([k, v]) => { if (v == null) return; dl.appendChild(h("dt", null, k)); dl.appendChild(h("dd", null, v)); });
    return dl;
  }
  function tableEl(head, rows, opts) {
    opts = opts || {};
    const thead = h("thead", null, h("tr", null, head.map(hh => h("th", null, hh))));
    const tbody = h("tbody");
    if (!rows.length) tbody.appendChild(h("tr", null, h("td", { colspan: head.length }, h("div",{class:"notice-na"},"لا توجد صفوف مطابقة."))));
    rows.forEach(r => tbody.appendChild(h("tr", null, r.map(c => h("td", null, c)))));
    return h("div", { class:"table-wrap" }, h("table", opts.cls?{class:opts.cls}:null, thead, tbody));
  }
  function sectionTitle(txt) { return h("h2", { class:"section-title" }, txt); }
  function pageHead(title, lead, sectionId) {
    const head = h("div", { class:"page-head" }, h("h1", null, title), lead ? h("p", { class:"lead" }, lead) : null);
    if (sectionId) head.appendChild(readRow(sectionId));
    return head;
  }
  function readRow(sectionId) {
    const read = S.isRead(sectionId);
    const visits = (S.get(S.KEYS.sectionVisits, {})[sectionId]) || null;
    const btn = h("button", { class:"btn sm no-print", "aria-pressed": String(read) },
      read ? "✓ تمت القراءة" : "وضع علامة: تمت القراءة");
    btn.addEventListener("click", () => {
      const now = !S.isRead(sectionId);
      S.markRead(sectionId, now);
      btn.textContent = now ? "✓ تمت القراءة" : "وضع علامة: تمت القراءة";
      btn.setAttribute("aria-pressed", String(now));
      toast(now ? "تم وضع علامة القراءة" : "تمت الإزالة");
    });
    return h("div", { class:"toolbar no-print", style:"margin-top:.5rem" }, btn,
      visits ? h("small", { class:"muted" }, "آخر زيارة: " + fmtDate(visits.last) + " · عدد الزيارات: " + visits.count) : null,
      bookmarkBtn({ kind:"section", id:sectionId, title: currentTitle(sectionId) }));
  }
  function currentTitle(id) {
    for (const g of D.navigation) for (const it of g.items) if (it.id === id) return it.label;
    return id;
  }
  function fmtDate(iso) {
    try { const d = new Date(iso); return d.toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric" }); }
    catch (e) { return iso; }
  }

  /* ----------------------------- Bookmarks & notes ----------------------------- */
  function bookmarkBtn(ref) {
    const list = S.get(S.KEYS.bookmarks, []);
    const exists = list.some(b => b.kind === ref.kind && b.id === ref.id);
    const btn = h("button", { class:"btn sm ghost no-print", title:"إضافة/إزالة من المحفوظات", "aria-pressed": String(exists) },
      exists ? "🔖 محفوظ" : "🔖 حفظ");
    btn.addEventListener("click", () => {
      let arr = S.get(S.KEYS.bookmarks, []);
      const i = arr.findIndex(b => b.kind === ref.kind && b.id === ref.id);
      if (i >= 0) { arr.splice(i, 1); toast("أُزيل من المحفوظات"); }
      else { arr.push(Object.assign({ at:new Date().toISOString(), route: location.hash }, ref)); toast("أُضيف إلى المحفوظات"); }
      S.set(S.KEYS.bookmarks, arr);
      btn.textContent = (i < 0) ? "🔖 محفوظ" : "🔖 حفظ";
      btn.setAttribute("aria-pressed", String(i < 0));
    });
    return btn;
  }

  /* ----------------------------- Filters helper ----------------------------- */
  function selectField(label, options, value, onChange, allLabel) {
    const sel = h("select", { "aria-label": label, onchange: e => onChange(e.target.value) },
      h("option", { value:"" }, allLabel || "الكل"),
      options.map(o => h("option", { value: typeof o === "object" ? o.v : o, selected: (typeof o==="object"?o.v:o) === value }, typeof o === "object" ? o.t : o)));
    return h("label", { class:"field" }, h("span", null, label), sel);
  }
  function searchField(ph, value, onInput) {
    return h("input", { class:"input search-input", type:"search", placeholder: ph, value: value || "",
      "aria-label": ph, oninput: e => onInput(e.target.value) });
  }
  function countChip(n) { return h("span", { class:"count-chip" }, "النتائج: " + n); }

  /* ===================================================================
     الصفحات (Views)
     =================================================================== */
  const views = {};

  /* ---------- لوحة التحكم ---------- */
  views.dashboard = () => {
    const wrap = h("div");
    wrap.appendChild(pageHead("لوحة تحكم DrZiad",
      "دليل داخلي لتدريب دكاترة المتابعة بفريق مذاكراوي على فهم أنظمة المرحلة الثانوية وإعداد جداول الطلاب."));

    // ملخص الحالة + تنبيه الرمز
    const dataStale = isStale();
    wrap.appendChild(h("div", { class:"grid c4" },
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "العام الدراسي"), h("span", { class:"num" }, D.meta.academicYear)),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "آخر تحقق"), h("span", { class:"num", style:"font-size:1.1rem" }, D.meta.lastVerified)),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "الإصدار"), h("span", { class:"num" }, D.version)),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "حالة البيانات"),
        h("span", { class:"num", style:"font-size:1.05rem; color:" + (dataStale ? "var(--warn)" : "var(--ok)") }, dataStale ? "تحتاج مراجعة" : "محدّثة"))));

    wrap.appendChild(alertBox("info", "تنبيه أمني:", D.meta.securityDisclosure));

    // إحصائيات الجرد
    wrap.appendChild(sectionTitle("بطاقات الإحصائيات (من البيانات الفعلية)"));
    wrap.appendChild(h("div", { class:"grid auto" },
      D.inventory.map(x => h("div", { class:"stat" }, h("span", { class:"num" }, x.v), h("span", { class:"lbl" }, x.k)))));

    // تقدم الدكتور
    const prof = doctorProfile();
    wrap.appendChild(sectionTitle("تقدمك في التدريب"));
    wrap.appendChild(h("div", { class:"grid c3" },
      progStat("إكمال المحتوى", prof.contentPct),
      progStat("قائمة التحقق", prof.checklistPct),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "آخر نتيجة اختبار"),
        h("span", { class:"num" }, prof.lastExam == null ? "—" : prof.lastExam + "%"),
        h("small", { class:"muted" }, prof.attempts ? ("محاولات: " + prof.attempts + " · أفضل: " + prof.best + "%") : "لم تبدأ بعد"))));

    // الوصول السريع
    wrap.appendChild(sectionTitle("الوصول السريع"));
    const quick = D.navigation.flatMap(g => g.items).filter(i => !["dashboard"].includes(i.id));
    wrap.appendChild(h("div", { class:"grid auto" },
      quick.map(i => linkTile(i))));

    // آخر ما تم الاطلاع عليه
    const visits = S.get(S.KEYS.sectionVisits, {});
    const recent = Object.keys(visits).sort((a,b)=> new Date(visits[b].last)-new Date(visits[a].last)).slice(0,5);
    if (recent.length) {
      wrap.appendChild(sectionTitle("آخر ما تم الاطلاع عليه"));
      wrap.appendChild(h("div", { class:"chips" }, recent.map(id =>
        h("a", { class:"badge", href:"#/"+id, style:"text-decoration:none" }, currentTitle(id)))));
    }

    // ما يحتاج إلى مراجعة
    wrap.appendChild(sectionTitle("ما يحتاج إلى مراجعة"));
    const lowConf = D.sources.filter(s => s.conf !== "A").length;
    wrap.appendChild(h("div", { class:"grid c3" },
      reviewTile("🚩 معلومات غير محسومة", D.unresolved.length + " بنود (تصنيف E)", "#/unresolved"),
      reviewTile("🕓 عناصر تحتاج تحديثاً", D.watchlist.length + " عنصر بسجل المتابعة", "#/changelog"),
      reviewTile("📎 مصادر غير رسمية", lowConf + " مصادر (توضيحية/ميدانية)", "#/sources")));

    return wrap;
  };
  function progStat(label, pct) {
    return h("div", { class:"stat" }, h("span", { class:"lbl" }, label),
      h("span", { class:"num" }, pct + "%"),
      h("div", { class:"progress", style:"margin-top:.4rem" }, h("span", { style:"width:"+pct+"%" })));
  }
  function linkTile(i) {
    return h("a", { class:"tile", href:"#/"+i.id },
      h("span", { class:"ic", "aria-hidden":"true" }, i.icon),
      h("div", null, h("b", null, i.label)));
  }
  function reviewTile(t, s, route) {
    return h("a", { class:"tile", href:route },
      h("div", null, h("b", null, t), h("small", null, s)));
  }

  /* ---------- عن الدليل ---------- */
  views.about = () => {
    const a = D.about;
    return frag(pageHead("عن الدليل", null, "about"),
      card(h("h3", null, "الهدف"), h("p", null, a.goal)),
      card(h("h3", null, "الجمهور المستخدم"), h("p", null, a.audience)),
      card(h("h3", null, "كيفية الاستخدام"), h("p", null, a.howToUse)),
      card(h("h3", null, "معنى مستويات الثقة"), confLegendNode()),
      card(h("h3", null, "الفرق بين المعلومة الرسمية والممارسة المدرسية"), h("p", null, a.officialVsPractice)),
      card(h("h3", null, "حدود الدليل"), h("p", null, a.limits),
        h("ul", null, a.disclaimers.map(d => h("li", null, d)))),
      sectionTitle("الملخص التنفيذي (قراءة في 10 دقائق)"),
      h("div", { class:"grid c2" }, D.executiveSummary.map(x =>
        card(h("b", null, x.t), h("p", { style:"margin:.3rem 0 0" }, x.d)))),
      alertBox("info", "الإصدار:", D.version + " — تاريخ آخر تحديث للبيانات: " + D.meta.lastVerified));
  };
  function confLegendNode() {
    return h("div", { class:"grid auto" }, D.confidenceLevels.map(c =>
      h("div", { class:"card", style:"padding:.7rem" },
        confBadge(c.level), h("p", { style:"margin:.4rem 0 0" }, c.meaning))));
  }

  /* ---------- خريطة الأنظمة ---------- */
  views["systems-map"] = () => {
    const wrap = frag(pageHead("خريطة الأنظمة",
      "العلاقة بين نوع المدرسة، ولغة الدراسة، ونظام الشهادة، والصف والشعبة، والتقييم، والتنسيق.", "systems-map"));
    wrap.appendChild(alertBox("warn", "تنبيه حاسم:",
      "نوع المدرسة، ولغة الدراسة، ونظام الشهادة، والشعبة أو المسار ليست مصطلحات مترادفة. طالب الرسمي لغات والحكومي العربي يدرسان المنهج القومي ذاته ويمتحنان نفس الشهادة بذات المجموع."));

    // سلسلة الخطوات
    const steps = [
      ["نوع المنشأة","حكومي/رسمي لغات/خاص/دولي/أزهري"],
      ["لغة الدراسة","عربية/إنجليزية/أخرى"],
      ["نظام الشهادة","عامة/بكالوريا/أزهري/دولي"],
      ["الصف والشعبة/المسار","أولى…ثالثة · علمي/أدبي/مسارات"],
      ["نظام التقييم","أعمال سنة/امتحان موحد/شفهي"],
      ["التنسيق الجامعي","مجموع/مجموع اعتباري/كوتة"]
    ];
    wrap.appendChild(h("div", { class:"grid auto" }, steps.map((s,i) =>
      h("div", { class:"tile" }, h("span", { class:"ic" }, String(i+1)), h("div", null, h("b", null, s[0]), h("small", null, s[1]))))));

    // الأنظمة الستة
    wrap.appendChild(sectionTitle("الأنظمة التعليمية الستة"));
    wrap.appendChild(h("div", { class:"grid c2" }, D.systems.map(sys =>
      h("div", { class:"card" },
        h("div", { class:"toolbar", style:"margin:0 0 .4rem" }, h("h3", { style:"margin:0" }, sys.name), confBadge(sys.confidence)),
        h("div", { class:"en muted", style:"font-size:.8rem" }, sys.en),
        kv([["الجهة", sys.authority], ["الأساس القانوني", sys.legal]]),
        h("p", null, sys.key),
        h("div", { class:"chips" }, Object.keys(sys.stats).map(k =>
          h("span", { class:"badge" }, k + ": " + sys.stats[k])))))));
    return wrap;
  };

  /* ---------- العربي واللغات ---------- */
  views["arabic-lang"] = () => {
    const wrap = frag(pageHead("مدارس العربي واللغات",
      "مقارنة أنواع المنشآت التي تمنح الثانوية العامة المصرية، وأثرها على إعداد الجدول.", "arabic-lang"));
    wrap.appendChild(alertBox("ok", "القاعدة الذهبية:",
      "مناهج العلوم والرياضيات متطابقة تماماً بين العربي واللغات؛ الفارق هو لغة التدريس فقط. ولطالب اللغات حق قانوني كامل في تعريب امتحان الثانوية العامة دون خصم درجات."));

    const localTypes = D.schoolTypes.filter(s => s.certificate === "الثانوية العامة المصرية");
    // أداة المقارنة جنباً إلى جنب
    let aId = localTypes[0].id, bId = localTypes[1].id;
    const compareBox = h("div", { class:"compare" });
    const renderCompare = () => {
      clear(compareBox);
      [aId, bId].forEach(id => {
        const t = D.schoolTypes.find(s => s.id === id);
        compareBox.appendChild(h("div", { class:"card" },
          h("h3", null, t.title), h("div", { class:"en muted", style:"font-size:.8rem" }, t.en),
          kv([["لغة الدراسة", t.medium], ["الشهادة", t.certificate], ["أولوية الجدولة", t.priority]]),
          h("div", null, confBadge(t.confidence))));
      });
    };
    const selA = selectField("النوع (أ)", localTypes.map(t => ({ v:t.id, t:t.title })), aId, v => { aId = v; renderCompare(); }, null);
    const selB = selectField("النوع (ب)", localTypes.map(t => ({ v:t.id, t:t.title })), bId, v => { bId = v; renderCompare(); }, null);
    wrap.appendChild(sectionTitle("قارن نوعين جنباً إلى جنب"));
    wrap.appendChild(h("div", { class:"toolbar" }, selA, selB));
    wrap.appendChild(compareBox); renderCompare();

    // مصفوفة شاملة
    wrap.appendChild(sectionTitle("مصفوفة مقارنة المنشآت والشهادات"));
    wrap.appendChild(tableEl(
      ["نوع المنشأة","الشهادة","لغة الامتحان","نمط التقييم","التنسيق","ملاحظة"],
      D.comparisonMatrix.map(r => [r.school, r.certificate, r.examLang, r.pattern, r.coordination, r.note])));

    // ماذا يعني هذا للجدول
    wrap.appendChild(sectionTitle("ماذا يعني هذا للجدول؟"));
    wrap.appendChild(h("div", { class:"grid c2" },
      card(h("b", null, "طالب اللغات"), h("p", null, "أضف هامشاً زمنياً 20%–30% للمصطلحات والمسائل اللفظية في الأسابيع الأولى، مع طمأنته لحق التعريب.")),
      card(h("b", null, "طالب العربي"), h("p", null, "مذاكرة مفاهيمية مباشرة دون وقت ترجمة، مع التركيز على الأسئلة المقالية والموضوعية."))));

    // أسئلة شائعة
    wrap.appendChild(sectionTitle("أسئلة شائعة"));
    [["هل لطالب اللغات ميزة في التنسيق؟","لا، إطلاقاً — ينافس الجميع على نفس المقاعد وبالمجموع نفسه (320)."],
     ["هل منهج اللغات مختلف؟","لا — الكتب الإنجليزية ترجمة علمية مباشرة للنصوص العربية الرسمية بنفس الوحدات والأهداف والامتحان."],
     ["هل اللغة الثانية مضافة للمجموع؟","لا — مادة نجاح ورسوب غير مضافة (40 درجة) بالثانوية العامة."]
    ].forEach(([q,a]) => wrap.appendChild(h("details", { class:"acc" }, h("summary", null, q), h("div", { class:"acc-body" }, h("p", null, a)))));
    return wrap;
  };

  /* ---------- قاموس المواد ---------- */
  views.subjects = () => {
    const wrap = frag(pageHead("قاموس المواد",
      "قاموس المواد بالعربية والإنجليزية (" + D.subjects.length + " مادة) بالاختصارات ومحاذير الجدولة. اضغط أي بطاقة لفتح التفاصيل.", "subjects"));
    const st = S.get(S.KEYS.filters, {}).subjects || {};
    let fText = st.text || "", fAdded = st.added || "", fConf = st.conf || "", fMedium = st.medium || "";
    const results = h("div", { class:"grid auto" });
    const countEl = countChip(0);

    const persist = () => S.set(S.KEYS.filters, Object.assign(S.get(S.KEYS.filters, {}), { subjects:{ text:fText, added:fAdded, conf:fConf, medium:fMedium } }));
    const render = () => {
      clear(results);
      const nf = Q.normalize(fText);
      const list = D.subjects.filter(s => {
        if (fAdded === "added" && s.added !== true) return false;
        if (fAdded === "not" && s.added !== false) return false;
        if (fAdded === "opt" && s.added !== null) return false;
        if (fConf && s.conf !== fConf) return false;
        if (fMedium && s.medium !== fMedium) return false;
        if (nf) { const hay = Q.normalize([s.ar,s.en,s.official,s.abbr,s.context,s.nature].join(" ")); if (hay.indexOf(nf) === -1) return false; }
        return true;
      });
      countEl.textContent = "النتائج: " + list.length;
      if (!list.length) { results.appendChild(emptyState("لا توجد مواد مطابقة للبحث/التصفية.")); return; }
      list.forEach(s => results.appendChild(subjectCard(s, fText)));
      persist();
    };
    const mediums = Array.from(new Set(D.subjects.map(s => s.medium))).filter(Boolean);
    wrap.appendChild(h("div", { class:"toolbar" },
      searchField("ابحث: الاسم العربي/الإنجليزي/الاختصار…", fText, v => { fText = v; render(); }),
      selectField("الحالة", [{v:"added",t:"مضافة"},{v:"not",t:"غير مضافة"},{v:"opt",t:"حسب الاختيار"}], fAdded, v => { fAdded = v; render(); }, "كل الحالات"),
      selectField("لغة المادة", mediums, fMedium, v => { fMedium = v; render(); }, "كل اللغات"),
      selectField("الثقة", D.confidenceLevels.map(c => ({ v:c.level, t:c.level+" · "+c.label })), fConf, v => { fConf = v; render(); }, "كل المستويات"),
      h("button", { class:"btn sm", onclick:()=>{ fText=fAdded=fConf=fMedium=""; wrap.querySelectorAll("select").forEach(s=>s.value=""); const si=wrap.querySelector("input[type=search]"); if(si) si.value=""; render(); } }, "مسح الفلاتر"),
      countEl));
    wrap.appendChild(results); render();
    return wrap;
  };
  function subjectCard(s, q) {
    const details = h("div", { class:"acc-body", style:"display:none" },
      kv([
        ["الاسم الرسمي", s.official],
        ["الاختصار", h("span", { class:"en" }, s.abbr)],
        ["النظام/الصف", s.context],
        ["الطبيعة", s.nature],
        ["لغة المادة", s.medium],
        ["ملاحظة الجدولة / مثال", s.example],
        ["محذور الخلط", s.warning]
      ]),
      h("div", { class:"toolbar", style:"margin-top:.4rem" }, confBadge(s.conf), addedPill(s.added),
        bookmarkBtn({ kind:"subject", id:s.id || ("SUB-"+s.n), title:s.ar })));
    const head = h("button", { class:"btn ghost", style:"width:100%;justify-content:space-between;text-align:start", "aria-expanded":"false" },
      h("span", null, Q.highlight(s.ar, q), " ", h("span", { class:"en muted", style:"font-size:.8rem" }, s.en)),
      h("span", { class:"en badge" }, s.abbr));
    head.addEventListener("click", () => {
      const open = details.style.display === "none";
      details.style.display = open ? "block" : "none";
      head.setAttribute("aria-expanded", String(open));
    });
    return h("div", { class:"card", style:"padding:.6rem .7rem" }, head, details);
  }

  /* ---------- اختصارات الجداول ---------- */
  views.abbreviations = () => {
    const wrap = frag(pageHead("اختصارات الجداول",
      "فك رموز جداول المدارس (" + D.abbreviations.length + " اختصاراً) مع احتمالات الالتباس والسؤال الواجب طرحه على الطالب.", "abbreviations"));
    wrap.appendChild(alertBox("warn", "قاعدة إلزامية:",
      "عند ورود رمز مثل Math أو Geo أو Sci دون بيان، يُحظر التخمين، ويجب سؤال الطالب لتحديد الفرع الدقيق وفق بطاقة مواده الرسمية."));
    let fText = "";
    const grid = h("div", { class:"grid auto" });
    const countEl = countChip(0);
    const render = () => {
      clear(grid);
      const nf = Q.normalize(fText);
      const list = D.abbreviations.filter(a => !nf || Q.normalize([a.abbr,a.meaning,a.context,a.ambiguity].join(" ")).indexOf(nf) !== -1);
      countEl.textContent = "النتائج: " + list.length;
      if (!list.length) { grid.appendChild(emptyState("لا يوجد اختصار مطابق.")); return; }
      list.forEach(a => grid.appendChild(h("div", { class:"card" },
        h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("h3", { class:"en", style:"margin:0" }, a.abbr)),
        h("p", { style:"margin:.1rem 0" }, Q.highlight(a.meaning, fText)),
        kv([["السياق", a.context], ["احتمالات الالتباس", a.ambiguity], ["الأثر على الوقت", a.effect], ["السؤال/الإجراء", a.action]]))));
    };
    wrap.appendChild(h("div", { class:"toolbar" },
      searchField("اكتب الاختصار أو معناه…", "", v => { fText = v; render(); }), countEl));
    wrap.appendChild(grid); render();
    return wrap;
  };

  /* ---------- مستويات اللغات ---------- */
  views["language-levels"] = () => {
    const wrap = frag(pageHead("مستويات وأنواع اللغات",
      "لا تُطابق التسميات المتشابهة بين الأنظمة. المصطلحات مفصولة حسب النظام التابع له (مصري / IGCSE / IB / أمريكي).", "language-levels"));
    const groups = {};
    D.languageLevels.forEach(l => { (groups[l.system] = groups[l.system] || []).push(l); });
    Object.keys(groups).forEach(sys => {
      wrap.appendChild(sectionTitle(sys));
      wrap.appendChild(h("div", { class:"grid c2" }, groups[sys].map(l =>
        h("div", { class:"card" },
          h("h3", { class:"en", style:"margin:0 0 .3rem" }, l.term),
          kv([["المعنى", l.meaning], ["الصفة", l.status], ["الأثر الامتحاني", l.exam], ["الساعات الأسبوعية", l.hours], ["الخطأ الشائع", l.mistake]])))));
    });
    return wrap;
  };

  /* ---------- Class Work والتقييمات ---------- */
  views.classwork = () => {
    const wrap = frag(pageHead("Class Work ومنظومة التقييم",
      "مصطلحات التقييم (" + D.assessmentTerms.length + ") بالترجمة والدرجة ودخولها المجموع وقرار الجدولة والتنبيه ضد التعميم.", "classwork"));
    wrap.appendChild(alertBox("info", "توزيع صفوف النقل العام:",
      "أعمال السنة 70% (شهر أول 15% + شهر ثانٍ 15% + أسبوعي 15% + كشكول وواجب 15% + سلوك ومواظبة 10%) + امتحان نهائي 30%."));
    let fText = "";
    const grid = h("div", { class:"grid c2" });
    const countEl = countChip(0);
    const render = () => {
      clear(grid);
      const nf = Q.normalize(fText);
      const list = D.assessmentTerms.filter(t => !nf || Q.normalize([t.en,t.ar,t.schedule,t.warning].join(" ")).indexOf(nf) !== -1);
      countEl.textContent = "النتائج: " + list.length;
      if (!list.length) { grid.appendChild(emptyState("لا يوجد مصطلح مطابق.")); return; }
      list.forEach(t => grid.appendChild(h("div", { class:"card" },
        h("h3", { style:"margin:0 0 .2rem" }, h("span", { class:"en" }, t.en), " — ", t.ar),
        kv([["الدرجة", t.grade], ["يدخل المجموع؟", t.inTotal], ["قرار الجدولة", t.schedule]]),
        alertBox("warn", "تنبيه ضد التعميم:", t.warning))));
    };
    wrap.appendChild(h("div", { class:"toolbar" }, searchField("ابحث في مصطلحات التقييم…", "", v => { fText=v; render(); }), countEl));
    wrap.appendChild(grid); render();

    wrap.appendChild(sectionTitle("بروتوكول الجدولة المعتمد"));
    wrap.appendChild(h("div", { class:"grid c2" }, D.schedulingPrinciples.map(p =>
      card(h("b", null, p.title), h("p", { style:"margin:.3rem 0 0" }, p.text)))));
    return wrap;
  };

  /* ---------- جداول الدرجات ---------- */
  views.grades = () => {
    const wrap = frag(pageHead("جداول توزيع الدرجات",
      "جداول الدرجات الرسمية لصفوف النقل والثانوية العامة والبكالوريا والأزهر. راجِع المصدر دائماً قبل أي قرار فعلي.", "grades"));
    wrap.appendChild(alertBox("warn", "تنبيه ثابت:", "يجب مراجعة العام الدراسي والمصدر قبل استخدام أي درجة في قرار فعلي. عند غياب المعلومة تُعرض «غير متاح» ولا يوضع صفر."));

    // القواعد الثماني
    wrap.appendChild(sectionTitle("القواعد اللوائحية الحاكمة (" + D.gradingRules.length + ")"));
    wrap.appendChild(h("div", { class:"grid c2" }, D.gradingRules.map(r =>
      card(h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("b", null, r.id + " — " + r.title), confBadge(r.conf)),
        h("p", { style:"margin:.2rem 0" }, r.text), h("small", { class:"muted" }, "المصدر: " + r.source)))));

    // منتقي الجدول
    wrap.appendChild(sectionTitle("الجداول التفصيلية"));
    const tabs = [["grade1","الأول العام"],["grade2","الثاني العام"],["grade3","الثالث العام"],["bac","البكالوريا"],["azhar","الأزهر"]];
    let cur = "grade1";
    const tabBar = h("div", { class:"toolbar" });
    const host = h("div");
    const renderTable = () => {
      clear(host);
      const t = D.gradeTables[cur];
      host.appendChild(h("h3", null, t.title));
      if (t.note) host.appendChild(alertBox("info", "ملاحظة:", t.note));
      host.appendChild(tableEl(t.head, t.rows.map(r => r.slice())));
      $$("button", tabBar).forEach(b => b.classList.toggle("primary", b.dataset.k === cur));
    };
    tabs.forEach(([k,label]) => tabBar.appendChild(h("button", { class:"btn sm", dataset:{k}, onclick:()=>{ cur=k; renderTable(); } }, label)));
    wrap.appendChild(tabBar); wrap.appendChild(host); renderTable();
    return wrap;
  };

  /* ---------- الثانوية العامة ---------- */
  views.general = () => {
    const g = D.generalSecondary;
    const wrap = frag(pageHead("الثانوية العامة المصرية",
      "التشريح الصفي الدقيق للصفوف الثلاثة والشعب والمواد الملغاة وفق القرارين 138 و234.", "general"));
    [g.grade1, g.grade2, g.grade3].forEach(gr => {
      wrap.appendChild(h("details", { class:"acc", open: gr === g.grade1 },
        h("summary", null, gr.title, " ", h("span", { class:"badge" }, gr.total)),
        h("div", { class:"acc-body" },
          kv([["المواد المضافة", gr.added], ["مواد النجاح والرسوب (غير مضافة)", gr.notAdded], ["نظام التقييم", gr.assessment]]),
          alertBox("info", "ملاحظة:", gr.note))));
    });
    wrap.appendChild(sectionTitle("أخطاء شائعة بالثانوية العامة"));
    const rel = D.mistakes.filter(m => /جيولوجيا|فلسفة|Math|اللغات|Class Work|الواجب|أعمال السنة|مقالي|المقالي/.test(m.err+m.action));
    wrap.appendChild(h("div", { class:"grid c2" }, rel.slice(0,6).map(mistakeCard)));
    return wrap;
  };

  /* ---------- البكالوريا المصرية ---------- */
  views.baccalaureate = () => {
    const b = D.baccalaureate;
    const wrap = frag(pageHead("البكالوريا المصرية",
      "نظام تراكمي موازٍ من 600 درجة على الصفين الثاني والثالث، بأربعة مسارات ومحاولتي امتحان.", "baccalaureate"));
    wrap.appendChild(kvCard("الأساس القانوني والبنية", [
      ["الأساس القانوني", b.legal], ["البنية والدرجات", b.structure],
      ["المحاولات والتحسين", b.attempts], ["تغيير المسار", b.trackChange]]));

    wrap.appendChild(sectionTitle("المسارات الأربعة"));
    let cur = b.tracks[0].id;
    const bar = h("div", { class:"toolbar" });
    const host = h("div");
    const renderTrack = () => {
      clear(host);
      const t = b.tracks.find(x => x.id === cur);
      host.appendChild(h("div", { class:"card" },
        h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("h3", { style:"margin:0" }, t.name), confBadge(t.conf)),
        kv([["الصف الثاني بكالوريا", t.grade2], ["الصف الثالث بكالوريا", t.grade3], ["الكليات المؤهلة", t.colleges]])));
      $$("button", bar).forEach(x => x.classList.toggle("primary", x.dataset.k === cur));
    };
    b.tracks.forEach(t => bar.appendChild(h("button", { class:"btn sm", dataset:{k:t.id}, onclick:()=>{ cur=t.id; renderTrack(); } }, t.name)));
    wrap.appendChild(bar); wrap.appendChild(host); renderTrack();

    // المؤكد مقابل غير المحسوم
    wrap.appendChild(h("div", { class:"compare", style:"margin-top:1rem" },
      h("div", { class:"card" }, h("h3", null, "✅ المؤكد رسمياً (A/B)"),
        h("ul", null, [
          "4 مسارات محددة بنصوص القرارين 213 و234.",
          "مجموع تراكمي 600 درجة بالصفين الثاني والثالث (100 لكل مادة).",
          "محاولتان: يونيو مجاناً + أغسطس تحسين بـ 200 جنيه للمادة، وترصد الأعلى.",
          "الشهادة معادلة رسمياً للثانوية العامة وتؤهل للقطاعات المناظرة."
        ].map(x => h("li", null, x)))),
      h("div", { class:"card" }, h("h3", null, "🚩 غير المحسوم / يحتاج تحديثاً (E)"),
        h("ul", null, D.unresolved.map(u => h("li", null, u.issue + " — " + u.gap))))));

    wrap.appendChild(alertBox("danger", "الإجراء الآمن لدكتور المتابعة:", b.safeAction));
    return wrap;
  };
  function kvCard(title, pairs) { return card(h("h3", null, title), kv(pairs)); }

  /* ---------- الثانوية الأزهرية ---------- */
  views.azhar = () => {
    const a = D.azhar;
    const wrap = frag(pageHead("الثانوية الأزهرية",
      "بنية تجمع بين العلوم الشرعية والعربية والثقافية، بامتحانات تحريرية وشفهية متزامنة.", "azhar"));
    wrap.appendChild(h("div", { class:"grid c2" },
      card(h("h3", null, "القسم العلمي (650 درجة)"), h("p", null, a.scientific)),
      card(h("h3", null, "القسم الأدبي (590–630)"), h("p", null, a.literary))));
    wrap.appendChild(alertBox("warn", "الامتحانات الشفهية:", a.oral));
    wrap.appendChild(sectionTitle("قواعد الجدولة للأزهر"));
    wrap.appendChild(card(h("ul", null, a.schedulingRules.map(r => h("li", null, r)))));
    wrap.appendChild(sectionTitle("جدول توزيع الدرجات (الأزهر)"));
    const t = D.gradeTables.azhar;
    if (t.note) wrap.appendChild(alertBox("info", "ملاحظة:", t.note));
    wrap.appendChild(tableEl(t.head, t.rows.map(r => r.slice())));
    return wrap;
  };

  /* ---------- الأنظمة الدولية ---------- */
  views.international = () => {
    const wrap = frag(pageHead("الأنظمة الدولية الأكثر انتشاراً",
      "ثلاثة أنظمة مستقلة لا تتطابق: الدبلومة الأمريكية، IGCSE البريطانية، البكالوريا الدولية IB.", "international"));
    D.international.forEach(sys => {
      wrap.appendChild(h("details", { class:"acc" },
        h("summary", null, sys.name, " ", h("span", { class:"en muted", style:"font-size:.78rem" }, sys.en)),
        h("div", { class:"acc-body" },
          h("div", { class:"toolbar", style:"margin:0 0 .4rem" }, confBadge(sys.conf),
            bookmarkBtn({ kind:"intl", id:sys.id, title:sys.name })),
          kv([
            ["تعريف مختصر", sys.def], ["طبيعة المواد", sys.subjects], ["المستويات", sys.levels],
            ["التقييم", sys.assessment], ["البيانات المطلوبة", sys.requiredData],
            ["اسأل الطالب", sys.askStudent], ["أثر النظام على الجدول", sys.scheduleImpact],
            ["خطأ شائع", sys.mistake], ["العلاقة بالتنسيق المصري", sys.coordination],
            ["المصادر", sys.sources.join(" · ")]
          ]))));
    });
    return wrap;
  };

  /* ---------- التنسيق الجامعي ---------- */
  views.coordination = () => {
    const wrap = frag(pageHead("قواعد التنسيق والقبول الجامعي",
      "القواعد الحاكمة للمجموع الاعتباري والجامعات التكنولوجية ونفي أي ميزة تفضيلية لطلاب اللغات.", "coordination"));
    wrap.appendChild(h("div", { class:"card", style:"border-color:var(--brand)" },
      h("h3", null, "هل طالب اللغات له تنسيق مختلف؟"),
      h("p", { style:"font-weight:800;color:var(--brand-dark)" }, "الإجابة القطعية: لا — ليس لطالب مدارس اللغات أي تنسيق مختلف أو أفضلية تنافسية إطلاقاً."),
      h("p", null, "طالب اللغات (رسمي أو خاص) الحاصل على الثانوية العامة ينافس بذات قواعد المجموع (320) على المقاعد نفسها مع طالب العربي، دون أي درجات تقديرية.")));
    wrap.appendChild(sectionTitle("القواعد التنسيقية"));
    wrap.appendChild(h("div", { class:"grid c2" }, D.coordination.map(c =>
      card(h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("b", null, c.title), confBadge(c.conf)),
        h("p", { style:"margin:0" }, c.text)))));
    wrap.appendChild(alertBox("warn", "ملاحظة:", "الحدود الدنيا للسنوات السابقة استرشادية بحتة لا تمثل ضماناً؛ ويُحظر التنبؤ بنسب القبول للعام الحالي."));
    return wrap;
  };

  /* ---------- الأخطاء الشائعة ---------- */
  function tagMistake(m) {
    const txt = m.err + " " + m.impact + " " + m.action + " " + m.detect;
    const tags = [];
    if (/لغات|اللغات|اللغة الإنجليزية|المصطلح/.test(txt)) tags.push("اللغات");
    if (/الثانوية العامة|ثالثة ثانوي عام|الجيولوجيا|الفلسفة|مقالي/.test(txt)) tags.push("الثانوية العامة");
    if (/بكالوريا/.test(txt)) tags.push("البكالوريا");
    if (/الأزهر|القرآن|شرعي/.test(txt)) tags.push("الأزهر");
    if (/IGCSE|Core|Extended|دولي|EST/.test(txt)) tags.push("الدولي");
    if (/Class Work|الواجب|التقييم|أعمال السنة|كشكول/.test(txt)) tags.push("التقييمات");
    if (/تنسيق|التنسيق/.test(txt)) tags.push("التنسيق");
    if (/جدول|الجدول|شهري|أولوية/.test(txt)) tags.push("الجدولة");
    if (/الرياضيات|Math|فرع|ديناميكا/.test(txt)) tags.push("الجدولة");
    return Array.from(new Set(tags));
  }
  function mistakeCard(m) {
    const state = (S.get(S.KEYS.mistakes, {})[m.id]) || "";
    const stSel = h("select", { class:"input sm", "aria-label":"حالة الخطأ "+m.id,
      onchange: e => { const o = S.get(S.KEYS.mistakes, {}); o[m.id] = e.target.value; S.set(S.KEYS.mistakes, o); toast("تم الحفظ"); } },
      h("option", { value:"" }, "— الحالة —"),
      ["تمت مراجعته","يحتاج إعادة قراءة","تم فهمه"].map(s => h("option", { value:s, selected:s===state }, s)));
    return h("div", { class:"card" },
      h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("b", null, m.id + " — " + m.err),
        h("span", { class:"chips" }, tagMistake(m).map(t => h("span", { class:"badge" }, t)))),
      kv([["الأثر على الطالب", m.impact], ["كيف يُكتشف", m.detect], ["التصرف الصحيح", m.action]]),
      h("div", { class:"toolbar", style:"margin-top:.3rem" }, stSel, bookmarkBtn({ kind:"mistake", id:m.id, title:m.err })));
  }
  views.mistakes = () => {
    const wrap = frag(pageHead("سجل الأخطاء الشائعة وعلاجها",
      D.mistakes.length + " خطأ ميداني موثّق مع الأثر وطريقة الاكتشاف والتصرف الصحيح. يمكنك تعليم كل خطأ محلياً.", "mistakes"));
    let fTag = "", fText = "";
    const grid = h("div", { class:"grid c2" });
    const countEl = countChip(0);
    const allTags = ["اللغات","الثانوية العامة","البكالوريا","الأزهر","الدولي","التقييمات","التنسيق","الجدولة"];
    const render = () => {
      clear(grid);
      const nf = Q.normalize(fText);
      const list = D.mistakes.filter(m => {
        if (fTag && !tagMistake(m).includes(fTag)) return false;
        if (nf && Q.normalize([m.err,m.impact,m.action,m.detect].join(" ")).indexOf(nf) === -1) return false;
        return true;
      });
      countEl.textContent = "النتائج: " + list.length;
      if (!list.length) { grid.appendChild(emptyState("لا توجد أخطاء مطابقة.")); return; }
      list.forEach(m => grid.appendChild(mistakeCard(m)));
    };
    wrap.appendChild(h("div", { class:"toolbar" },
      searchField("ابحث في الأخطاء…", "", v => { fText=v; render(); }),
      selectField("التصنيف", allTags, "", v => { fTag=v; render(); }, "كل التصنيفات"), countEl));
    wrap.appendChild(grid); render();
    return wrap;
  };

  /* ---------- الحالات التدريبية ---------- */
  views.cases = () => {
    const wrap = frag(pageHead("استوديو الحالات التدريبية",
      D.cases.length + " حالة تطبيقية. حاول اتخاذ القرار أولاً ثم اضغط «إظهار الحل». يُحفظ تقدمك محلياً.", "cases"));
    const prog = S.get(S.KEYS.cases, {});
    const done = Object.values(prog).filter(p => p.completed).length;
    wrap.appendChild(progStat("الحالات المكتملة", Math.round(done / D.cases.length * 100)));
    D.cases.forEach(c => wrap.appendChild(caseCard(c)));
    return wrap;
  };
  function caseCard(c) {
    const prog = S.get(S.KEYS.cases, {})[c.id] || { attempts:0, completed:false };
    const solution = h("div", { style:"display:none; margin-top:.6rem" },
      kv([["القرار الصحيح", c.decision], ["أثر القرار على الجدول", c.impact], ["الخطأ المحتمل", c.mistake]]),
      h("div", null, confBadge(c.conf)));
    const showBtn = h("button", { class:"btn sm primary" }, "إظهار الحل");
    showBtn.addEventListener("click", () => {
      solution.style.display = "block"; showBtn.disabled = true;
      const p = S.get(S.KEYS.cases, {}); p[c.id] = { attempts:(prog.attempts||0)+1, completed:true, at:new Date().toISOString() };
      S.set(S.KEYS.cases, p); toast("تم تعليم الحالة كمكتملة");
    });
    return h("details", { class:"acc" },
      h("summary", null, c.id + " — " + c.title, prog.completed ? h("span", { class:"badge pill-added", style:"margin-inline-start:.4rem" }, "مكتملة") : null),
      h("div", { class:"acc-body" },
        kv([["المعلومات المتاحة", c.available], ["المعلومات الناقصة", c.missing], ["السؤال المطلوب من الدكتور", c.questions]]),
        h("div", { class:"toolbar" }, showBtn, bookmarkBtn({ kind:"case", id:c.id, title:c.title })),
        solution));
  }

  /* ---------- نموذج بيانات الطالب ---------- */
  views.intake = () => {
    const wrap = frag(pageHead("مولد استمارة تشخيص الطالب",
      "أداة لجمع بيانات الطالب قبل إعداد أي جدول. تُحفظ محلياً على جهازك فقط ولا تُرسل لأي جهة.", "intake"));
    wrap.appendChild(alertBox("info", "خصوصية:", "استخدم كوداً اختيارياً بدل الاسم الكامل. لا تُدخل الرقم القومي أو العنوان التفصيلي أو أي بيانات حساسة."));
    const saved = S.get(S.KEYS.studentForm, {});
    const groups = {};
    D.intakeFields.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
    const form = h("form", { onsubmit: e => e.preventDefault() });
    const getVals = () => {
      const v = {};
      D.intakeFields.forEach(f => { const el = $("#f_"+f.id, form); if (el) v[f.id] = el.value.trim(); });
      // dynamic lists
      v._subjects = dynItems(subjectsHost); v._lessons = dynItems(lessonsHost); v._assess = dynItems(assessHost);
      return v;
    };
    const autosave = () => { S.set(S.KEYS.studentForm, getVals()); renderSummary(); };

    Object.keys(groups).forEach(gName => {
      const sec = h("div", { class:"card", style:"margin-bottom:.8rem" }, h("h3", null, gName));
      const grid = h("div", { class:"grid c2" });
      groups[gName].forEach(f => {
        let input;
        if (f.type === "select") input = h("select", { id:"f_"+f.id, onchange:autosave }, h("option", { value:"" }, "— اختر —"), f.options.map(o => h("option", { value:o, selected:saved[f.id]===o }, o)));
        else if (f.type === "textarea") input = h("textarea", { id:"f_"+f.id, oninput:autosave }, saved[f.id] || "");
        else input = h("input", { id:"f_"+f.id, class:"input", type:"text", value:saved[f.id] || "", oninput:autosave });
        grid.appendChild(h("label", { class:"field" }, h("span", null, f.label + (["std_grade","std_schooltype","std_cert"].includes(f.id) ? " *" : "")), input));
      });
      sec.appendChild(grid); form.appendChild(sec);
    });

    // قوائم ديناميكية
    const subjectsHost = dynList("المواد (المادة + لغتها + مستواها)", ["المادة","اللغة","المستوى/ملاحظة"], saved._subjects, autosave);
    const lessonsHost = dynList("الدروس الخارجية (المادة + اليوم)", ["المادة","اليوم/الموعد"], saved._lessons, autosave);
    const assessHost = dynList("التقييمات القادمة (النوع + الموعد)", ["النوع","الموعد"], saved._assess, autosave);
    form.appendChild(subjectsHost.card); form.appendChild(lessonsHost.card); form.appendChild(assessHost.card);

    // أزرار
    form.appendChild(h("div", { class:"toolbar no-print" },
      h("button", { class:"btn primary", type:"button", onclick: () => { autosave(); toast("تم الحفظ محلياً"); } }, "💾 حفظ"),
      h("button", { class:"btn", type:"button", onclick: exportStudent }, "⬇️ تصدير JSON"),
      h("label", { class:"btn", style:"cursor:pointer" }, "⬆️ استيراد",
        h("input", { type:"file", accept:".json,application/json", style:"display:none",
          onchange: e => importStudent(e.target.files[0], form) })),
      h("button", { class:"btn", type:"button", onclick: () => window.print() }, "🖨️ طباعة الملخص"),
      h("button", { class:"btn danger", type:"button", onclick: () => confirmClearStudent(form) }, "🗑️ مسح البيانات")));

    wrap.appendChild(form);

    // الملخص
    const summaryHost = h("div", { id:"intakeSummary" });
    wrap.appendChild(sectionTitle("ملخص الحالة وجاهزية الجدول"));
    wrap.appendChild(summaryHost);
    function renderSummary() {
      clear(summaryHost);
      const v = getVals();
      const missing = [];
      if (!v.std_schooltype) missing.push("نوع المنشأة");
      if (!v.std_cert) missing.push("نظام الشهادة");
      if (!v.std_grade) missing.push("الصف الدراسي");
      const needsTrack = /الثاني|الثالث/.test(v.std_grade || "");
      if (needsTrack && (!v.std_track || v.std_track === "لا ينطبق (أولى)")) missing.push("الشعبة/المسار");
      if (!(v._subjects && v._subjects.length) && !v.std_subjects) missing.push("المواد المسجلة");
      if (!(v._lessons && v._lessons.length) && !v.std_lessons) missing.push("جدول الدروس/المدرسة");

      const ready = missing.length === 0;
      summaryHost.appendChild(ready
        ? alertBox("ok", "اكتملت هوية النظام:", "تم استيفاء البيانات الجوهرية؛ يمكن الانتقال لبناء الجدول بعد مراجعة قائمة التحقق.")
        : alertBox("danger", "المعلومات غير مكتملة — يجب جمع التالي أولاً:", missing.join("، ")));

      summaryHost.appendChild(kvCard("البيانات المؤكدة", [
        ["كود/اسم الطالب", v.std_name || naText()],
        ["النظام المحتمل", v.std_cert || naText("لم يُحدد بعد")],
        ["نوع المنشأة", v.std_schooltype || naText()],
        ["الصف/المسار", [v.std_grade, v.std_track].filter(Boolean).join(" · ") || naText()],
        ["لغة العلوم/الرياضيات", v.std_medium || naText()],
        ["حق التعريب", v.std_arabization || naText()]
      ]));
      if (!ready) summaryHost.appendChild(alertBox("warn", "أسئلة متابعة مقترحة:",
        "اطلب صورة جدول الحصص وأغلفة الكتب واستمارة التسجيل الرسمية قبل اعتماد أي جدول (راجع CASE-010)."));
    }
    renderSummary();
    function exportStudent() {
      autosave();
      downloadJSON(S.get(S.KEYS.studentForm, {}), "drziad_student_" + Date.now() + ".json");
      toast("تم التصدير");
    }
    return wrap;
  };
  function dynList(title, cols, initial, onChange) {
    const body = h("div");
    const card = h("div", { class:"card", style:"margin-bottom:.8rem" },
      h("div", { class:"toolbar", style:"margin:0 0 .4rem" }, h("h3", { style:"margin:0" }, title),
        h("button", { class:"btn sm", type:"button", onclick: () => { addRow(); onChange(); } }, "＋ إضافة")),
      body);
    function addRow(vals) {
      vals = vals || {};
      const row = h("div", { class:"toolbar", style:"margin:.2rem 0", dataset:{ row:"1" } });
      cols.forEach((c, i) => row.appendChild(h("input", { class:"input", placeholder:c, "data-col":i, value: vals["c"+i] || "", oninput:onChange })));
      row.appendChild(h("button", { class:"btn sm danger", type:"button", onclick: () => { row.remove(); onChange(); } }, "حذف"));
      body.appendChild(row);
    }
    (initial || []).forEach(v => addRow(v));
    return { card, body, cols };
  }
  function dynItems(host) {
    return $$("[data-row]", host.body).map(row => {
      const o = {};
      $$("input", row).forEach(inp => { const c = inp.getAttribute("data-col"); if (c != null) o["c"+c] = inp.value.trim(); });
      return o;
    }).filter(o => Object.values(o).some(Boolean));
  }
  function confirmClearStudent(form) {
    if (!confirm("سيتم مسح بيانات الطالب المحفوظة محلياً. متأكد؟")) return;
    S.remove(S.KEYS.studentForm); toast("تم المسح");
    navigate("intake");
  }
  function importStudent(file, form) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || typeof obj !== "object") throw new Error("بنية غير صالحة");
        // قبول ملف طالب (حقول std_*) أو نسخة احتياطية تحوي student_form
        const data = obj.data && obj.data.student_form ? obj.data.student_form : obj;
        S.set(S.KEYS.studentForm, data); toast("تم الاستيراد"); navigate("intake");
      } catch (e) { toast("ملف غير صالح: " + e.message); }
    };
    r.readAsText(file);
  }

  /* ---------- قائمة التحقق ---------- */
  function checklistCriticality(groupIdx) {
    return groupIdx === 0 ? "crit" : (groupIdx <= 2 ? "imp" : "sup");
  }
  views.checklist = () => {
    const wrap = frag(pageHead("قائمة تحقق دكتور المتابعة",
      "راجع كل بند قبل اعتماد جدول الطالب. تُحفظ الحالة محلياً. لا تكتمل الجاهزية إلا باستيفاء البنود الحرجة.", "checklist"));
    const state = S.get(S.KEYS.checklist, {});
    const barHost = h("div");
    const readyHost = h("div");
    const allItems = [];
    D.checklist.forEach((g, gi) => g.items.forEach((it, ii) => allItems.push({ key: "g"+gi+"_"+ii, crit: checklistCriticality(gi) })));
    const update = () => {
      const st = S.get(S.KEYS.checklist, {});
      const total = allItems.length, done = allItems.filter(x => st[x.key]).length;
      const pct = Math.round(done / total * 100);
      clear(barHost);
      barHost.appendChild(h("div", { class:"toolbar" }, h("b", null, "الإنجاز: " + pct + "%"), h("small", { class:"muted" }, done + " / " + total)));
      barHost.appendChild(h("div", { class:"progress" }, h("span", { style:"width:"+pct+"%" })));
      const critDone = allItems.filter(x => x.crit === "crit").every(x => st[x.key]);
      clear(readyHost);
      readyHost.appendChild(critDone
        ? alertBox("ok", "جاهز للاعتماد:", "تم استيفاء جميع البنود الحرجة. راجع البنود المهمة والتكميلية قبل الاعتماد النهائي.")
        : alertBox("danger", "غير جاهز للاعتماد:", "توجد بنود حرجة (هوية النظام) غير مكتملة. لا يجوز اعتماد الجدول قبل استيفائها."));
    };

    wrap.appendChild(barHost);
    wrap.appendChild(readyHost);
    wrap.appendChild(h("div", { class:"toolbar no-print" },
      h("button", { class:"btn sm", onclick: () => { S.remove(S.KEYS.checklist); navigate("checklist"); } }, "إعادة الضبط"),
      h("button", { class:"btn sm", onclick: () => window.print() }, "🖨️ طباعة"),
      h("span", { class:"chips" }, h("span", { class:"tag crit" }, "حرج"), h("span", { class:"tag imp" }, "مهم"), h("span", { class:"tag sup" }, "تكميلي"))));

    D.checklist.forEach((g, gi) => {
      const sec = h("div", { class:"card", style:"margin-bottom:.7rem" }, h("h3", null, g.group));
      g.items.forEach((it, ii) => {
        const key = "g"+gi+"_"+ii;
        const checked = !!state[key];
        const cb = h("input", { type:"checkbox", id:"ck_"+key, checked });
        cb.addEventListener("change", () => {
          const st = S.get(S.KEYS.checklist, {}); st[key] = cb.checked; S.set(S.KEYS.checklist, st);
          const meta = S.get(S.KEYS.checklistMeta, {}); meta.lastUpdate = new Date().toISOString(); S.set(S.KEYS.checklistMeta, meta);
          row.classList.toggle("done", cb.checked); update();
        });
        const row = h("div", { class:"check-item" + (checked?" done":"") },
          cb, h("label", { for:"ck_"+key }, it, " ", h("span", { class:"tag " + checklistCriticality(gi) }, checklistCriticality(gi)==="crit"?"حرج":checklistCriticality(gi)==="imp"?"مهم":"تكميلي")));
        sec.appendChild(row);
      });
      wrap.appendChild(sec);
    });
    const meta = S.get(S.KEYS.checklistMeta, {});
    wrap.appendChild(h("div", null, h("label", { class:"field" }, h("span", null, "ملاحظات إضافية"),
      h("textarea", { oninput: e => { const m = S.get(S.KEYS.checklistMeta, {}); m.notes = e.target.value; S.set(S.KEYS.checklistMeta, m); } }, meta.notes || "")),
      meta.lastUpdate ? h("small", { class:"muted" }, "آخر تحديث: " + fmtDate(meta.lastUpdate)) : null));
    update();
    return wrap;
  };

  /* ---------- اختبار الاعتماد ---------- */
  views.exam = () => {
    const wrap = h("div");
    wrap.appendChild(pageHead("بوابة اختبار اعتماد المشرفين",
      D.examBank.length + " سؤالاً ذاتي التصحيح. حد النجاح المقترح داخلياً: " + D.examPassPercent + "%.", "exam"));
    wrap.appendChild(alertBox("warn", "محجوب خلف تأكيد المشرف:",
      "هذا القسم مخصص للمشرفين الأكاديميين. والاعتماد هنا «اعتماد داخلي مقترح داخل فريق مذاكراوي» وليس اعتماداً رسمياً أو مهنياً."));

    const unlocked = sessionStorage.getItem("drziad_exam_ok") === "1";
    if (!unlocked) {
      const gate = h("div", { class:"card" },
        h("h3", null, "تأكيد المشرف"),
        h("p", null, "للدخول إلى الاختبار، فعّل تأكيد المشرف. (آلية عرض محلية فقط وليست وسيلة أمان.)"),
        h("label", { class:"check-item" }, h("input", { type:"checkbox", id:"supConfirm" }),
          h("span", null, "أؤكد أنني مشرف أكاديمي وأرغب في بدء الاختبار.")),
        h("button", { class:"btn primary", onclick: () => {
          if (!$("#supConfirm").checked) { toast("فعّل التأكيد أولاً"); return; }
          sessionStorage.setItem("drziad_exam_ok", "1"); navigate("exam");
        } }, "فتح الاختبار"));
      wrap.appendChild(gate);
      // عرض آخر النتائج المحفوظة
      const att = S.get(S.KEYS.quizAttempts, []);
      if (att.length) wrap.appendChild(examHistory(att));
      return wrap;
    }

    wrap.appendChild(examRunner());
    const att = S.get(S.KEYS.quizAttempts, []);
    if (att.length) wrap.appendChild(examHistory(att));
    return wrap;
  };
  function examHistory(att) {
    return frag(sectionTitle("سجل المحاولات المحفوظة"),
      tableEl(["#","التاريخ","النتيجة","الحالة"], att.slice().reverse().map((a,i) =>
        [String(att.length - i), fmtDate(a.at), a.score + "%",
         h("span", { class:"conf " + (a.pass?"A":"E") }, a.pass ? "اجتاز" : "دون الحد")])));
  }
  function examRunner() {
    const box = h("div");
    let state = S.get(S.KEYS.quizState, null);
    const buildOrder = (shuffle) => {
      const idx = D.examBank.map((_, i) => i);
      if (shuffle) for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
      return idx;
    };
    const start = (shuffle) => { state = { order: buildOrder(shuffle), answers: {}, submitted:false, at:new Date().toISOString() }; S.set(S.KEYS.quizState, state); render(); };

    const render = () => {
      clear(box);
      if (!state) {
        box.appendChild(h("div", { class:"toolbar" },
          h("button", { class:"btn primary", onclick: () => start(false) }, "بدء الاختبار"),
          h("button", { class:"btn", onclick: () => start(true) }, "بدء مع ترتيب عشوائي")));
        return;
      }
      const total = state.order.length;
      const answered = Object.keys(state.answers).length;
      const pct = Math.round(answered / total * 100);
      box.appendChild(h("div", { class:"toolbar no-print" },
        h("b", null, (state.submitted ? "تمت المراجعة" : "أجبت عن ") + answered + " / " + total),
        h("div", { class:"progress", style:"flex:1" }, h("span", { style:"width:"+pct+"%" }))));

      state.order.forEach((qi, pos) => box.appendChild(qCard(D.examBank[qi], qi, pos + 1)));

      if (!state.submitted) {
        box.appendChild(h("div", { class:"toolbar no-print" },
          h("button", { class:"btn primary", onclick: submit }, "إنهاء وتسليم"),
          h("button", { class:"btn danger", onclick: () => { S.remove(S.KEYS.quizState); state=null; render(); } }, "إلغاء")));
      } else {
        box.appendChild(resultPanel());
      }
    };

    function qCard(qq, qi, num) {
      const sel = state.answers[qi];
      const c = h("div", { class:"q-card" }, h("div", { class:"toolbar", style:"margin:0 0 .4rem" },
        h("span", { class:"badge" }, qTypeLabel(qq.type)), h("b", null, "س" + num)), h("p", null, qq.q));
      if (qq.type === "tf") {
        [["صواب", true], ["خطأ", false]].forEach(([label, val]) => c.appendChild(optRow(qi, qq, label, val, sel)));
      } else {
        qq.options.forEach((opt, i) => c.appendChild(optRow(qi, qq, opt, i, sel)));
      }
      if (state.submitted) {
        const correct = qq.type === "tf" ? qq.answer : qq.answer;
        c.appendChild(h("div", { class:"alert " + (isCorrect(qq, sel) ? "ok" : "danger") },
          h("span", { class:"ic" }, isCorrect(qq, sel) ? "✅" : "✖️"),
          h("div", { class:"body" }, h("b", null, isCorrect(qq, sel) ? "إجابة صحيحة. " : "إجابة غير صحيحة. "), qq.why)));
      }
      return c;
    }
    function optRow(qi, qq, label, val, sel) {
      const selected = sel === val || (typeof sel === "boolean" && sel === val);
      let cls = "q-opt" + (selected ? " sel" : "");
      if (state.submitted) {
        const correctVal = qq.answer;
        if (val === correctVal) cls += " correct";
        else if (selected) cls += " wrong";
      }
      const input = h("input", { type:"radio", name:"q"+qi, checked:selected, disabled: state.submitted });
      const row = h("label", { class:cls }, input, h("span", null, label));
      if (!state.submitted) row.addEventListener("click", () => {
        state.answers[qi] = val; S.set(S.KEYS.quizState, state); render();
      });
      return row;
    }
    function submit() {
      if (!confirm("تسليم الاختبار الآن؟ لن تتمكن من تغيير الإجابات.")) return;
      state.submitted = true; S.set(S.KEYS.quizState, state);
      const { score, pass, byType } = grade();
      const att = S.get(S.KEYS.quizAttempts, []);
      att.push({ at:new Date().toISOString(), score, pass, byType });
      S.set(S.KEYS.quizAttempts, att);
      updateDoctorExam(score, pass);
      render();
      box.scrollIntoView({ behavior:"smooth" });
    }
    function grade() {
      let correct = 0; const byType = {};
      D.examBank.forEach((qq, i) => {
        const t = qq.type; byType[t] = byType[t] || { c:0, n:0 };
        byType[t].n++;
        if (isCorrect(qq, state.answers[i])) { correct++; byType[t].c++; }
      });
      const score = Math.round(correct / D.examBank.length * 100);
      return { score, pass: score >= D.examPassPercent, byType, correct };
    }
    function resultPanel() {
      const { score, pass, byType, correct } = grade();
      const panel = h("div", { class:"card", style:"margin-top:1rem" },
        h("h3", null, "النتيجة"),
        h("div", { class:"stat", style:"display:inline-flex;margin-bottom:.6rem" },
          h("span", { class:"num", style:"color:" + (pass?"var(--ok)":"var(--danger)") }, score + "%"),
          h("span", { class:"lbl" }, correct + " / " + D.examBank.length + " · حد النجاح " + D.examPassPercent + "%")),
        pass ? alertBox("ok", "النتيجة:", "اجتزت الاختبار — اعتماد داخلي مقترح داخل فريق مذاكراوي.")
             : alertBox("danger", "النتيجة:", "دون حد النجاح المقترح. راجع الأقسام التالية وأعد المحاولة."),
        sectionTitle("تحليل حسب الموضوع"),
        tableEl(["النوع","صحيح","الإجمالي","الحالة"], Object.keys(byType).map(t => {
          const b = byType[t]; const ok = b.c / b.n >= 0.85;
          return [qTypeLabel(t), String(b.c), String(b.n), h("span", { class:"conf " + (ok?"A":"C") }, ok ? "قوي" : "يحتاج مراجعة")];
        })),
        h("div", { class:"toolbar no-print" },
          h("button", { class:"btn primary", onclick: () => { S.remove(S.KEYS.quizState); start(false); } }, "إعادة الاختبار"),
          h("button", { class:"btn", onclick: () => window.print() }, "🖨️ طباعة النتيجة"),
          h("button", { class:"btn", onclick: () => downloadJSON({ at:new Date().toISOString(), score, pass, byType }, "drziad_exam_result.json") }, "⬇️ تصدير النتيجة")));
      return panel;
    }
    render();
    return box;
  }
  function isCorrect(qq, sel) {
    if (sel === undefined) return false;
    return sel === qq.answer;
  }
  function qTypeLabel(t) { return { mcq:"اختيار من متعدد", tf:"صواب/خطأ", decision:"قرار عملي", spot:"اكتشاف خطأ" }[t] || t; }

  /* ---------- المصادر ---------- */
  views.sources = () => {
    const wrap = frag(pageHead("مكتبة المصادر والأسانيد",
      D.sources.length + " مصدراً (" + D.sources.filter(s=>s.kind==="رسمي").length + " رسمياً) مع الجهة ومستوى الثقة.", "sources"));
    let fText = "", fKind = "", fConf = "";
    const host = h("div");
    const countEl = countChip(0);
    const render = () => {
      clear(host);
      const nf = Q.normalize(fText);
      const list = D.sources.filter(s => {
        if (fKind && s.kind !== fKind) return false;
        if (fConf && s.conf !== fConf) return false;
        if (nf && Q.normalize([s.id,s.title,s.authority].join(" ")).indexOf(nf) === -1) return false;
        return true;
      });
      countEl.textContent = "النتائج: " + list.length;
      host.appendChild(tableEl(["الرمز","العنوان","الجهة","النوع","الثقة","نسخ"],
        list.map(s => [
          h("span", { class:"en mono" }, s.id), s.title, s.authority, s.kind, confBadge(s.conf),
          h("button", { class:"btn sm no-print", onclick: () => { copyText(s.id); } }, "نسخ الرمز")
        ])));
    };
    wrap.appendChild(h("div", { class:"toolbar" },
      searchField("ابحث في المصادر…", "", v => { fText=v; render(); }),
      selectField("النوع", ["رسمي","توضيحي","ميداني"], "", v => { fKind=v; render(); }, "كل الأنواع"),
      selectField("الثقة", D.confidenceLevels.map(c=>({v:c.level,t:c.level})), "", v => { fConf=v; render(); }, "كل المستويات"),
      countEl));
    wrap.appendChild(host); render();
    wrap.appendChild(alertBox("info", "ملاحظة:", "الروابط الرسمية تُفتح في نافذة جديدة بخصائص أمان (rel=noopener). لم تُدرج روابط مباشرة في حزمة البيانات؛ ارجع للبوابات الرسمية المذكورة بالجهة."));
    return wrap;
  };

  /* ---------- غير المحسوم + سجل المتابعة ---------- */
  views.unresolved = () => {
    const wrap = frag(pageHead("سجل الفجوات والمعلومات غير المحسومة",
      "ثلاثة بنود لوائحية معلّقة (تصنيف E) مع الإجراء الآمن، وسجل متابعة التحديثات الدورية.", "unresolved"));
    D.unresolved.forEach(u => wrap.appendChild(h("div", { class:"card", style:"border-color:var(--confE-bd)" },
      h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("b", null, u.id + " — " + u.issue), confBadge(u.conf)),
      kv([["المؤكد رسمياً", u.confirmed], ["مساحة عدم الحسم", u.gap]]),
      alertBox("danger", "الإجراء الآمن:", u.safe))));

    wrap.appendChild(sectionTitle("سجل المتابعة والتحديث الدوري"));
    let fSev = "";
    const host = h("div");
    const render = () => {
      clear(host);
      const list = D.watchlist.filter(w => !fSev || w.severity === fSev);
      host.appendChild(tableEl(["العنصر","الدورية","الخطورة","الإجراء"],
        list.map(w => [w.item, w.cadence,
          h("span", { class:"conf " + sevClass(w.severity) }, w.severity), w.action])));
    };
    wrap.appendChild(h("div", { class:"toolbar" },
      selectField("الخطورة", ["حرج","مرتفع","متوسط","منخفض"], "", v => { fSev=v; render(); }, "كل المستويات")));
    wrap.appendChild(host); render();
    return wrap;
  };
  function sevClass(s) { return { "حرج":"E", "مرتفع":"C", "متوسط":"B", "منخفض":"D" }[s] || "D"; }

  /* ---------- سجل التحديثات ---------- */
  views.changelog = () => {
    const wrap = frag(pageHead("سجل التحديثات",
      "سجل إصدارات المشروع. يبدأ بالإصدار " + D.version + " بتاريخ البيانات " + D.meta.lastVerified + "، ويُستكمل محلياً.", "changelog"));
    wrap.appendChild(tableEl(["الإصدار","التاريخ","القسم","الوصف","المصدر"],
      D.changelog.map(c => [c.version, c.date, c.section, c.desc, c.source])));
    wrap.appendChild(alertBox("info", "ملاحظة:", "لا تُخترع تواريخ تعديلات غير موجودة. أي تعديل محلي يُسجَّل من لوحة الإدارة."));
    return wrap;
  };

  /* ---------- المحفوظات ---------- */
  views.bookmarks = () => {
    const wrap = frag(pageHead("المحفوظات والملاحظات",
      "العناصر التي حفظتها محلياً مع إمكانية إضافة ملاحظة شخصية وتصديرها.", "bookmarks"));
    const list = S.get(S.KEYS.bookmarks, []);
    wrap.appendChild(h("div", { class:"toolbar no-print" },
      h("button", { class:"btn sm", onclick: () => downloadJSON(list, "drziad_bookmarks.json") }, "⬇️ تصدير المحفوظات")));
    if (!list.length) { wrap.appendChild(emptyState("لا توجد محفوظات بعد. استخدم زر 🔖 حفظ في أي بطاقة.", "🔖")); return wrap; }
    const notes = S.get(S.KEYS.notes, {});
    const host = h("div", { class:"grid c2" });
    list.forEach((b, i) => {
      const nkey = b.kind + ":" + b.id;
      host.appendChild(h("div", { class:"card" },
        h("div", { class:"toolbar", style:"margin:0 0 .3rem" }, h("span", { class:"badge" }, b.kind), h("b", null, b.title || b.id)),
        b.route ? h("a", { class:"btn sm", href:b.route }, "فتح") : null,
        h("label", { class:"field", style:"margin-top:.4rem" }, h("span", null, "ملاحظة شخصية"),
          h("textarea", { oninput: e => { const n = S.get(S.KEYS.notes, {}); n[nkey] = e.target.value; S.set(S.KEYS.notes, n); } }, notes[nkey] || "")),
        h("button", { class:"btn sm danger", onclick: () => { const arr = S.get(S.KEYS.bookmarks, []); arr.splice(i,1); S.set(S.KEYS.bookmarks, arr); navigate("bookmarks"); } }, "حذف")));
    });
    wrap.appendChild(host);
    return wrap;
  };

  /* ---------- لوحة الإدارة ---------- */
  views.admin = () => {
    const wrap = h("div");
    wrap.appendChild(pageHead("لوحة إدارة DrZiad", "تنظيم العرض المحلي ومتابعة التقدم والنسخ الاحتياطي — وليست نظام حماية أمني."));
    const unlocked = S.get(S.KEYS.adminUnlocked, false);
    if (!unlocked) {
      const input = h("input", { class:"input", type:"text", placeholder:"أدخل رمز العرض (DrZiad)", "aria-label":"رمز العرض" });
      wrap.appendChild(h("div", { class:"card" },
        h("h3", null, "فتح لوحة الإدارة"),
        alertBox("warn", "تنبيه:", "رمز DrZiad للتحكم في العرض المحلي فقط، وليس نظام مصادقة آمناً. لا تضع فيه بيانات حساسة."),
        h("div", { class:"toolbar" }, input,
          h("button", { class:"btn primary", onclick: () => {
            if (input.value.trim() === D.meta.accessCode) { S.set(S.KEYS.adminUnlocked, true); toast("تم الفتح"); navigate("admin"); }
            else toast("رمز غير صحيح");
          } }, "فتح"))));
      return wrap;
    }

    const prof = doctorProfile();
    // اسم المستخدم المحلي
    const doc = S.get(S.KEYS.doctor, {});
    wrap.appendChild(h("div", { class:"card" }, h("h3", null, "هوية الدكتور المحلية"),
      h("div", { class:"toolbar" },
        h("label", { class:"field" }, h("span", null, "الاسم/الكود المحلي"),
          h("input", { class:"input", value: doc.name || "", oninput: e => { const d = S.get(S.KEYS.doctor, {}); d.name = e.target.value; if (!d.startedAt) d.startedAt = new Date().toISOString(); S.set(S.KEYS.doctor, d); } })),
        h("div", { class:"field" }, h("span", null, "تاريخ بدء التدريب"), h("div", null, doc.startedAt ? fmtDate(doc.startedAt) : "—")))));

    // بطاقات التقدم
    wrap.appendChild(sectionTitle("مؤشرات التدريب (محلية)"));
    wrap.appendChild(h("div", { class:"grid c3" },
      progStat("إكمال المحتوى", prof.contentPct),
      progStat("قائمة التحقق", prof.checklistPct),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "الحالات المكتملة"), h("span", { class:"num" }, prof.casesDone + " / " + D.cases.length))));
    wrap.appendChild(h("div", { class:"grid c3" },
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "آخر اختبار"), h("span", { class:"num" }, prof.lastExam==null?"—":prof.lastExam+"%")),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "أفضل نتيجة"), h("span", { class:"num" }, prof.best==null?"—":prof.best+"%")),
      h("div", { class:"stat" }, h("span", { class:"lbl" }, "عدد المحاولات"), h("span", { class:"num" }, String(prof.attempts)))));
    wrap.appendChild(h("div", { class:"card" }, h("h3", null, "حالة الاعتماد الداخلي"),
      h("p", { style:"font-size:1.1rem;font-weight:800;color:var(--brand-dark)" }, prof.status),
      prof.needsReview.length ? h("div", null, h("b", null, "أقسام تحتاج مراجعة: "), prof.needsReview.join("، ")) : null));

    // غير المحسوم + المتابعة
    wrap.appendChild(sectionTitle("ما يحتاج متابعة"));
    wrap.appendChild(h("div", { class:"grid c2" },
      reviewTile("🚩 بنود غير محسومة", D.unresolved.length + " (E)", "#/unresolved"),
      reviewTile("🕓 سجل المتابعة", D.watchlist.length + " عنصر", "#/unresolved")));

    // التحكم في ظهور الأقسام
    wrap.appendChild(sectionTitle("التحكم في ظهور الأقسام (محلي)"));
    const vis = S.get(S.KEYS.sectionVis, {});
    const visGrid = h("div", { class:"grid c3" });
    D.navigation.flatMap(g => g.items).filter(i => !["dashboard","admin"].includes(i.id)).forEach(i => {
      visGrid.appendChild(h("label", { class:"check-item" },
        h("input", { type:"checkbox", checked: vis[i.id] !== false, onchange: e => { const v = S.get(S.KEYS.sectionVis, {}); v[i.id] = e.target.checked; S.set(S.KEYS.sectionVis, v); buildSidebar(); } }),
        h("span", null, i.label)));
    });
    wrap.appendChild(visGrid);

    // النسخ الاحتياطي
    wrap.appendChild(sectionTitle("النسخ الاحتياطي (تصدير/استيراد)"));
    wrap.appendChild(h("div", { class:"toolbar" },
      h("button", { class:"btn primary", onclick: () => { downloadJSON(S.exportAll(), "drziad_backup_" + Date.now() + ".json"); toast("تم تصدير النسخة"); } }, "⬇️ تصدير كل البيانات"),
      h("label", { class:"btn", style:"cursor:pointer" }, "⬆️ استيراد نسخة",
        h("input", { type:"file", accept:".json", style:"display:none", onchange: e => importBackupFlow(e.target.files[0]) })),
      h("button", { class:"btn danger", onclick: resetAllFlow }, "🗑️ إعادة ضبط المشروع"),
      h("button", { class:"btn", onclick: () => { S.set(S.KEYS.adminUnlocked, false); navigate("admin"); } }, "قفل اللوحة")));

    // سجل النشاط
    const act = S.get(S.KEYS.activity, []);
    if (act.length) {
      wrap.appendChild(sectionTitle("سجل النشاط المحلي"));
      wrap.appendChild(tableEl(["النوع","العنصر","التاريخ"], act.slice(0,15).map(a => [a.type, a.label, fmtDate(a.at)])));
    }
    return wrap;
  };

  function importBackupFlow(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let obj;
      try { obj = JSON.parse(r.result); } catch (e) { toast("ملف JSON غير صالح"); return; }
      const v = S.validateBackup(obj);
      const summary = S.summarizeBackup(obj);
      const body = h("div", null,
        v.ok ? alertBox("ok", "ملف صالح", "يمكن المتابعة.") : alertBox("danger", "الملف غير متوافق:", v.errors.join(" / ")),
        summary.length ? h("div", null, h("b", null, "ملخص المحتوى:"), h("ul", null, summary.map(s => h("li", null, s.key + ": " + s.info)))) : null,
        v.errors.filter(e=>e.startsWith("مفتاح")).length ? alertBox("warn","مفاتيح ستُتجاهل:", v.errors.filter(e=>e.startsWith("مفتاح")).join(" / ")) : null);
      if (v.ok) {
        const merge = h("button", { class:"btn", onclick: () => { S.importBackup(obj, "merge"); closeModal(); toast("تم الدمج"); navigate("admin"); } }, "دمج مع الحالي");
        const replace = h("button", { class:"btn danger", onclick: () => { if (confirm("سيستبدل البيانات الحالية. متأكد؟")) { S.importBackup(obj, "replace"); closeModal(); toast("تم الاستبدال"); navigate("admin"); } } }, "استبدال الكل");
        body.appendChild(h("div", { class:"toolbar" }, merge, replace, h("button", { class:"btn ghost", onclick: closeModal }, "إلغاء")));
      } else {
        body.appendChild(h("div", { class:"toolbar" }, h("button", { class:"btn", onclick: closeModal }, "إغلاق")));
      }
      openModal("مراجعة الاستيراد", body);
    };
    r.readAsText(file);
  }
  function resetAllFlow() {
    if (!confirm("الخطوة 1/2: سيتم مسح جميع البيانات المحلية (التقدم، الاختبار، النموذج، المحفوظات). متابعة؟")) return;
    if (!confirm("الخطوة 2/2: تأكيد نهائي — لا يمكن التراجع. مسح الآن؟")) return;
    S.clearAll(); toast("تم مسح كل البيانات المحلية"); location.hash = "#/dashboard"; location.reload();
  }

  /* ----------------------------- Doctor profile ----------------------------- */
  function doctorProfile() {
    const navItems = D.navigation.flatMap(g => g.items).filter(i => !["dashboard","admin","about","bookmarks","changelog"].includes(i.id));
    const read = S.get(S.KEYS.readSections, {});
    const contentPct = Math.round(navItems.filter(i => read[i.id]).length / navItems.length * 100);
    const clState = S.get(S.KEYS.checklist, {});
    let total=0, done=0; D.checklist.forEach((g,gi)=>g.items.forEach((_,ii)=>{ total++; if (clState["g"+gi+"_"+ii]) done++; }));
    const checklistPct = total ? Math.round(done/total*100) : 0;
    const casesDone = Object.values(S.get(S.KEYS.cases, {})).filter(p => p.completed).length;
    const att = S.get(S.KEYS.quizAttempts, []);
    const lastExam = att.length ? att[att.length-1].score : null;
    const best = att.length ? Math.max.apply(null, att.map(a => a.score)) : null;
    const passed = att.some(a => a.pass);
    const needsReview = [];
    navItems.forEach(i => { if (!read[i.id]) needsReview.push(i.label); });
    let status = "لم يبدأ";
    if (contentPct > 0 || att.length) status = "قيد التدريب";
    if (contentPct >= 100) status = "أكمل المحتوى";
    if (att.length && !passed) status = "يحتاج مراجعة";
    if (passed) status = "اجتاز الاختبار الداخلي";
    if (passed && contentPct >= 100 && checklistPct >= 100) status = "معتمد داخلياً داخل فريق مذاكراوي";
    return { contentPct, checklistPct, casesDone, lastExam, best, attempts: att.length, status, needsReview: needsReview.slice(0,6) };
  }
  function updateDoctorExam() { /* النتائج محفوظة في quizAttempts ويُشتق منها الملف */ }

  /* ----------------------------- Utilities ----------------------------- */
  function downloadJSON(obj, name) {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = h("a", { href:url, download:name }); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { toast("تعذّر التصدير"); }
  }
  function copyText(t) {
    try { navigator.clipboard.writeText(t); toast("تم النسخ: " + t); }
    catch (e) { toast("انسخ يدوياً: " + t); }
  }
  function isStale() {
    try {
      const v = new Date(D.meta.lastVerified);
      const days = (Date.now() - v.getTime()) / 86400000;
      const sept1 = new Date(new Date().getFullYear(), 8, 1);
      return days > (D.meta.staleAfterDays || 180) || (Date.now() >= sept1.getTime() && v.getTime() < sept1.getTime());
    } catch (e) { return false; }
  }

  /* ===================================================================
     Router + Chrome
     =================================================================== */
  function buildSidebar() {
    const nav = $("#sidebar"); if (!nav) return;
    clear(nav);
    const navState = S.get(S.KEYS.navState, {});
    const vis = S.get(S.KEYS.sectionVis, {});
    D.navigation.forEach((g, gi) => {
      const collapsed = navState["g"+gi] === true;
      const items = g.items.filter(i => vis[i.id] !== false || ["dashboard","admin"].includes(i.id));
      if (!items.length) return;
      const group = h("div", { class:"nav-group" + (collapsed?" collapsed":"") });
      const title = h("button", { class:"nav-title", "aria-expanded": String(!collapsed) },
        h("span", null, g.group), h("span", { class:"chev", "aria-hidden":"true" }, "▾"));
      title.addEventListener("click", () => {
        group.classList.toggle("collapsed");
        const ns = S.get(S.KEYS.navState, {}); ns["g"+gi] = group.classList.contains("collapsed"); S.set(S.KEYS.navState, ns);
        title.setAttribute("aria-expanded", String(!group.classList.contains("collapsed")));
      });
      const ul = h("div", { class:"nav-items" });
      items.forEach(i => ul.appendChild(h("a", { class:"nav-link", href:"#/"+i.id, "data-id":i.id },
        h("span", { class:"ic", "aria-hidden":"true" }, i.icon), i.label)));
      group.appendChild(title); group.appendChild(ul); nav.appendChild(group);
    });
    highlightNav();
  }
  function highlightNav() {
    const cur = currentRoute();
    $$("#sidebar .nav-link").forEach(a => a.classList.toggle("active", a.getAttribute("data-id") === cur));
  }
  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, "");
    return hash || "dashboard";
  }
  function breadcrumbs(id) {
    const bc = $("#breadcrumbs"); clear(bc);
    let groupName = "";
    for (const g of D.navigation) for (const it of g.items) if (it.id === id) groupName = g.group;
    bc.appendChild(h("a", { href:"#/dashboard" }, "الرئيسية"));
    if (groupName && id !== "dashboard") { bc.appendChild(document.createTextNode(" / ")); bc.appendChild(h("span", null, groupName)); }
    if (id !== "dashboard") { bc.appendChild(document.createTextNode(" / ")); bc.appendChild(h("b", null, currentTitle(id))); }
  }
  function prevNext(id) {
    const flat = D.navigation.flatMap(g => g.items);
    const idx = flat.findIndex(i => i.id === id);
    if (idx === -1) return null;
    const prev = flat[idx-1], next = flat[idx+1];
    return h("div", { class:"toolbar no-print", style:"justify-content:space-between;margin-top:1.4rem;border-top:1px solid var(--border);padding-top:1rem" },
      prev ? h("a", { class:"btn sm", href:"#/"+prev.id }, "→ " + prev.label) : h("span"),
      next ? h("a", { class:"btn sm primary", href:"#/"+next.id }, next.label + " ←") : h("span"));
  }

  function render() {
    const id = currentRoute();
    const vis = S.get(S.KEYS.sectionVis, {});
    let fn = views[id];
    if (!fn) fn = views.dashboard;
    if (vis[id] === false && !["dashboard","admin"].includes(id)) {
      // قسم مخفي من لوحة الإدارة
      const view = $("#view"); clear(view);
      view.appendChild(alertBox("warn", "قسم مخفي:", "تم إخفاء هذا القسم من لوحة الإدارة. يمكن إعادة إظهاره من هناك."));
      return;
    }
    const view = $("#view");
    clear(view);
    let node;
    try { node = fn(); }
    catch (e) {
      node = h("div", null, alertBox("danger", "حدث خطأ أثناء عرض القسم.", "جرّب تحديث الصفحة. تفاصيل تقنية بالأسفل."),
        h("details", { class:"acc" }, h("summary", null, "تفاصيل تقنية"), h("div", { class:"acc-body" }, h("pre", { style:"white-space:pre-wrap" }, String(e && e.stack || e)))));
    }
    view.appendChild(node);
    const pn = prevNext(id); if (pn) view.appendChild(pn);
    breadcrumbs(id);
    highlightNav();
    S.markVisit(id);
    S.set(S.KEYS.lastRoute, id);
    // print header refresh
    refreshPrintHeader();
    // close mobile nav
    closeMobileNav();
    window.scrollTo({ top:0, behavior:"instant" in window ? "instant" : "auto" });
    $("#view").focus();
  }
  function navigate(id) { if (currentRoute() === id) render(); else location.hash = "#/"+id; }

  function refreshPrintHeader() {
    const ph = $("#printHeader");
    if (ph) { clear(ph); ph.appendChild(h("b", null, D.meta.name + " — " + D.meta.code));
      ph.appendChild(h("div", { class:"meta" }, "تاريخ الطباعة: " + new Date().toLocaleDateString("ar-EG") + " · العام: " + D.meta.academicYear + " · آخر تحقق للبيانات: " + D.meta.lastVerified)); }
    const ps = $("#printSources");
    if (ps) { clear(ps); ps.appendChild(h("b", null, "المصادر الأساسية: "));
      ps.appendChild(document.createTextNode(D.sources.filter(s=>s.kind==="رسمي").slice(0,6).map(s=>s.id).join(" · "))); }
  }

  /* ----------------------------- Search modal ----------------------------- */
  function openSearch() {
    const overlay = $("#searchOverlay"); overlay.classList.add("open");
    const inp = $("#searchInput"); inp.value = ""; inp.focus(); renderSearch("");
  }
  function renderSearch(q) {
    const host = $("#searchResults"); clear(host);
    if (!q || q.trim().length < 2) { host.appendChild(h("p", { class:"muted" }, "اكتب كلمتين على الأقل للبحث في كل المحتوى…")); return; }
    const res = Q.query(q, 40);
    if (!res.length) { host.appendChild(emptyState("لا توجد نتائج مطابقة.")); return; }
    res.forEach(r => {
      const a = h("a", { class:"search-result", href:r.route, onclick: () => closeSearch() },
        h("div", { class:"type" }, r.typeLabel),
        h("div", null, Q.highlight(r.title, q)),
        r.subtitle ? h("div", { class:"path" }, r.subtitle) : null);
      host.appendChild(a);
    });
  }
  function closeSearch() { $("#searchOverlay").classList.remove("open"); }

  /* ----------------------------- Modal ----------------------------- */
  function openModal(title, bodyNode) {
    const ov = $("#modalOverlay"); const body = $("#modalBody"); const ttl = $("#modalTitle");
    ttl.textContent = title; clear(body); body.appendChild(bodyNode); ov.classList.add("open");
  }
  function closeModal() { $("#modalOverlay").classList.remove("open"); }

  /* ----------------------------- Theme & a11y ----------------------------- */
  function applyTheme(t) {
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    S.set(S.KEYS.theme, t || "auto");
    const btn = $("#themeBtn"); if (btn) btn.textContent = (effectiveDark() ? "☀️" : "🌙");
  }
  function effectiveDark() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark") return true; if (t === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() { applyTheme(effectiveDark() ? "light" : "dark"); }
  function applyFontScale(scale) {
    scale = Math.min(1.4, Math.max(0.9, scale));
    document.documentElement.style.fontSize = (16 * scale) + "px";
    S.set(S.KEYS.fontScale, scale);
  }

  function closeMobileNav() { $("#sidebar").classList.remove("open"); $("#backdrop").classList.remove("open"); }
  function openMobileNav() { $("#sidebar").classList.add("open"); $("#backdrop").classList.add("open"); }

  /* ----------------------------- Init ----------------------------- */
  function init() {
    // storage availability notice
    if (!S.available()) {
      const b = $("#storageWarn"); if (b) b.style.display = "block";
    }
    // theme
    applyTheme(S.get(S.KEYS.theme, "auto"));
    applyFontScale(S.get(S.KEYS.fontScale, 1));
    // search index
    Q.build(D);
    // sidebar
    buildSidebar();
    // header bindings
    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#menuBtn").addEventListener("click", openMobileNav);
    $("#backdrop").addEventListener("click", closeMobileNav);
    $("#searchBtn").addEventListener("click", openSearch);
    $("#fontUp").addEventListener("click", () => applyFontScale((S.get(S.KEYS.fontScale,1)) + 0.1));
    $("#fontDown").addEventListener("click", () => applyFontScale((S.get(S.KEYS.fontScale,1)) - 0.1));
    $("#searchClose").addEventListener("click", closeSearch);
    $("#searchOverlay").addEventListener("click", e => { if (e.target.id === "searchOverlay") closeSearch(); });
    $("#searchInput").addEventListener("input", e => renderSearch(e.target.value));
    $("#modalClose").addEventListener("click", closeModal);
    $("#modalOverlay").addEventListener("click", e => { if (e.target.id === "modalOverlay") closeModal(); });
    // keyboard
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeSearch(); closeModal(); closeMobileNav(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); openSearch(); }
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    });
    // back to top
    const toTop = $("#toTop");
    window.addEventListener("scroll", () => toTop.classList.toggle("show", window.scrollY > 500));
    toTop.addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));
    // meta chip
    const chip = $("#metaChip"); if (chip) chip.textContent = "العام " + D.meta.academicYear + " · " + D.version;
    // routing
    window.addEventListener("hashchange", render);
    if (!location.hash) location.hash = "#/" + (S.get(S.KEYS.lastRoute, "dashboard"));
    render();
    // welcome (once)
    maybeWelcome();
  }
  function maybeWelcome() {
    const settings = S.get(S.KEYS.settings, {});
    if (settings.welcomed) return;
    const body = h("div", null,
      h("p", null, "مرحباً بك في دليل DrZiad الداخلي لفريق مذاكراوي."),
      alertBox("info", "تنبيه أمني:", D.meta.securityDisclosure),
      h("p", { class:"muted" }, "ابدأ من «خريطة الأنظمة» لتحديد هوية الطالب، ثم استخدم الأدوات والاختبار."),
      h("div", { class:"toolbar" }, h("button", { class:"btn primary", onclick: () => { const s = S.get(S.KEYS.settings, {}); s.welcomed = true; S.set(S.KEYS.settings, s); closeModal(); } }, "ابدأ")));
    openModal("أهلاً بك — DrZiad", body);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // تصدير بسيط للاستخدام من وحدة التحكم إن لزم
  window.DrZiadApp = { navigate, render, buildSidebar };
})();
