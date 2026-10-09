/* =====================================================================
   DrZiad — محرك البحث الموحد (Local, Arabic-aware)
   - تجاهل التشكيل.
   - توحيد الألف والهمزة (أ إ آ ا)، والياء والألف المقصورة (ي ى)،
     والتاء المربوطة والهاء (ة ه)، والواو بالهمزة (ؤ و).
   - دعم البحث بالمصطلح الإنجليزي والاختصار.
   يعمل كلياً دون خادم.
   ===================================================================== */
(function () {
  "use strict";

  const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // حركات + تطويل
  function normalize(str) {
    if (str == null) return "";
    return String(str)
      .replace(TASHKEEL, "")
      .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ -> ا
      .replace(/ى/g, "ي")                      // ى -> ي
      .replace(/ة/g, "ه")                      // ة -> ه
      .replace(/ؤ/g, "و")                      // ؤ -> و
      .replace(/ئ/g, "ي")                      // ئ -> ي
      .replace(/[^؀-ۿa-zA-Z0-9]+/g, " ")        // رموز -> مسافة
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  let INDEX = [];

  function add(list, type, typeLabel, route) {
    (list || []).forEach(x => INDEX.push({
      type, typeLabel, route,
      title: x.title, subtitle: x.subtitle || "",
      hay: normalize(x.terms.filter(Boolean).join(" "))
    }));
  }

  function build(D) {
    INDEX = [];
    // الصفحات
    D.navigation.forEach(g => g.items.forEach(i =>
      INDEX.push({ type:"page", typeLabel:"صفحة", route:"#/"+i.id, title:i.label, subtitle:g.group, hay:normalize(i.label+" "+i.id+" "+g.group) })));
    // الأنظمة
    add(D.systems.map(s => ({ title:s.name, subtitle:s.en, terms:[s.name,s.en,s.id,s.key] })), "system","نظام","#/systems-map");
    // المواد
    add(D.subjects.map(s => ({ title:s.ar, subtitle:s.en+" · "+s.abbr, terms:[s.ar,s.en,s.official,s.abbr,s.context,s.nature] })), "subject","مادة","#/subjects");
    // الاختصارات
    add(D.abbreviations.map(a => ({ title:a.abbr, subtitle:a.meaning, terms:[a.abbr,a.meaning,a.context] })), "abbr","اختصار","#/abbreviations");
    // مستويات اللغات
    add(D.languageLevels.map(l => ({ title:l.term, subtitle:l.system, terms:[l.term,l.system,l.meaning] })), "lang","مستوى لغة","#/language-levels");
    // مصطلحات التقييم
    add(D.assessmentTerms.map(t => ({ title:t.en, subtitle:t.ar, terms:[t.en,t.ar,t.schedule] })), "assess","مصطلح تقييم","#/classwork");
    // قواعد الدرجات
    add(D.gradingRules.map(r => ({ title:r.title, subtitle:r.id, terms:[r.title,r.text,r.id] })), "rule","قاعدة درجات","#/grades");
    // الأخطاء
    add(D.mistakes.map(m => ({ title:m.err, subtitle:m.id, terms:[m.err,m.impact,m.action,m.id] })), "mistake","خطأ شائع","#/mistakes");
    // الحالات
    add(D.cases.map(c => ({ title:c.title, subtitle:c.id, terms:[c.title,c.available,c.decision,c.id] })), "case","حالة تدريبية","#/cases");
    // المصادر
    add(D.sources.map(s => ({ title:s.id, subtitle:s.title, terms:[s.id,s.title,s.authority] })), "source","مصدر","#/sources");
    // غير المحسوم
    add(D.unresolved.map(u => ({ title:u.issue, subtitle:u.id, terms:[u.issue,u.gap,u.safe,u.id] })), "unres","غير محسوم","#/unresolved");
    // الدولية
    add(D.international.map(i => ({ title:i.name, subtitle:i.en, terms:[i.name,i.en,i.def] })), "intl","نظام دولي","#/international");
    return INDEX.length;
  }

  function query(q, limit) {
    const n = normalize(q);
    if (!n) return [];
    const parts = n.split(" ").filter(Boolean);
    const scored = [];
    INDEX.forEach(item => {
      let score = 0, ok = true;
      parts.forEach(p => {
        const idx = item.hay.indexOf(p);
        if (idx === -1) { ok = false; }
        else { score += (idx === 0 ? 3 : 1) + Math.max(0, 6 - idx / 6); }
      });
      if (ok) {
        if (normalize(item.title).indexOf(parts[0]) === 0) score += 5;
        scored.push({ item, score });
      }
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 40).map(s => s.item);
  }

  function highlight(text, q) {
    const n = normalize(q).split(" ").filter(Boolean);
    if (!n.length || text == null) return document.createTextNode(text == null ? "" : String(text));
    // نحدد المواضع على نسخة طبيعية ونعلّمها على النص الأصلي بمطابقة الطول تقريبياً
    const frag = document.createDocumentFragment();
    const original = String(text);
    const low = normalize(original);
    let cursor = 0, placed = false;
    // أبسط وأأمن: إبراز أول مطابقة لكل كلمة في النص الأصلي بمطابقة غير حساسة
    const ranges = [];
    n.forEach(p => {
      let i = low.indexOf(p);
      while (i !== -1) { ranges.push([i, i + p.length]); i = low.indexOf(p, i + p.length); }
    });
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(r => {
      if (merged.length && r[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      else merged.push(r.slice());
    });
    merged.forEach(r => {
      if (r[0] > cursor) frag.appendChild(document.createTextNode(original.slice(cursor, r[0])));
      const m = document.createElement("mark");
      m.textContent = original.slice(r[0], r[1]);
      frag.appendChild(m); cursor = r[1]; placed = true;
    });
    if (cursor < original.length) frag.appendChild(document.createTextNode(original.slice(cursor)));
    return placed ? frag : document.createTextNode(original);
  }

  window.DZSearch = { normalize, build, query, highlight };
})();
