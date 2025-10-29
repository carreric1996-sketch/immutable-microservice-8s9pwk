import React, { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

/*
  Quick notes:
  - To enable Supabase, set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY
  - If Supabase env vars are missing, the app uses local state only.
*/

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

const SAMPLE_QUOTES = [
  { text: "من جدّ وجد، ومن زرع حصد.", author: "مثل عربي" },
  { text: "العقل زينة، والقلم سلاح.", author: "مجهول" },
  { text: "السعادة قرار، لا حالة.", author: "مجهول" },
  { text: "سر النجاح هو الثبات على المبدأ.", author: "مجهول" },
  { text: "الوقت كالسيف إن لم تقطعه قطعك.", author: "مثل عربي" },
  { text: "النجاح رحلة وليس محطة.", author: "مجهول" },
  { text: "العبرة بالنهاية لا بالبداية.", author: "مجهول" },
  { text: "ابتسم، فالحياة أجمل بابتسامتك.", author: "مجهول" },
  { text: "من توكل على الله فهو حسبه.", author: "آية قرآنية" },
  { text: "كل بداية صعبة، ولكن المثابرة تصنع النجاح.", author: "مجهول" },
];

export default function App() {
  const [quotes, setQuotes] = useState([]);
  const [query, setQuery] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [previewList, setPreviewList] = useState([]);
  const [importError, setImportError] = useState("");
  const posterRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  // load initial data (either from supabase or sample)
  useEffect(() => {
    async function load() {
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from("quotes")
            .select("*")
            .order("id", { ascending: false })
            .limit(200);
          if (!error && data) {
            setQuotes(
              data.map((d) => ({ text: d.text, author: d.author || "مجهول" }))
            );
            return;
          }
        } catch (e) {
          console.warn("Supabase fetch error", e);
        }
      }
      // fallback
      setQuotes(SAMPLE_QUOTES);
    }
    load();
  }, []);

  const filtered = quotes.filter((q) => {
    const t = q.text + " " + (q.author || "");
    return t.includes(query.trim());
  });

  async function handleDownload(quote) {
    setSelected(quote);
    await new Promise((r) => setTimeout(r, 60)); // allow DOM update
    if (!posterRef.current) return;
    const node = posterRef.current;
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
    });
    const data = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = data;
    a.download = `quote-${Date.now()}.png`;
    a.click();
  }

  function handleCopy(quote) {
    const txt = `\"${quote.text}\" — ${quote.author || "مجهول"}`;
    navigator.clipboard?.writeText(txt).then(
      () => {
        alert("تم نسخ الاقتباس!");
      },
      () => alert("لم نتمكن من النسخ")
    );
  }

  async function handleShare(quote) {
    const txt = `\"${quote.text}\" — ${quote.author || "مجهول"}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: txt });
      } catch (e) {
        console.warn(e);
      }
    } else {
      handleCopy(quote);
    }
  }

  // Import file and preview
  function handleFileChange(e) {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      if (name.endsWith(".json")) {
        try {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error("JSON must be array");
          const parsed = data.map((i) => ({
            text: (i.text || "").toString().trim(),
            author: (i.author || "مجهول").toString().trim(),
          }));
          setPreviewList(parsed.filter((p) => p.text));
        } catch (err) {
          setImportError("ملف JSON غير صالح.");
          setPreviewList([]);
        }
      } else if (name.endsWith(".csv")) {
        const parsed = Papa.parse(text, { header: false });
        const list = parsed.data
          .map((row) => {
            const t = row[0] || "";
            const a = row[1] || "مجهول";
            return { text: t.toString().trim(), author: a.toString().trim() };
          })
          .filter((r) => r.text);
        setPreviewList(list);
      } else {
        setImportError("الرجاء رفع ملف CSV أو JSON فقط.");
        setPreviewList([]);
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = ""; // allow same file re-upload
  }

  // Save preview into DB or local state
  async function confirmImport() {
    if (!previewList.length) return alert("لا توجد اقتباسات للاستيراد.");
    setLoading(true);
    if (supabase) {
      // insert into supabase table named 'quotes' with columns {text, author}
      try {
        const payload = previewList.map((p) => ({
          text: p.text,
          author: p.author || "مجهول",
        }));
        const { error } = await supabase.from("quotes").insert(payload);
        if (error) {
          alert("حدث خطأ أثناء حفظ الاقتباسات في Supabase.");
          console.warn(error);
        } else {
          alert(`تم استيراد ${payload.length} اقتباسًا إلى قاعدة البيانات.`);
          // refresh
          const { data } = await supabase
            .from("quotes")
            .select("*")
            .order("id", { ascending: false })
            .limit(500);
          setQuotes(
            data.map((d) => ({ text: d.text, author: d.author || "مجهول" }))
          );
          setPreviewList([]);
        }
      } catch (e) {
        console.warn(e);
        alert("خطأ أثناء الاتصال بقاعدة البيانات.");
      }
    } else {
      // fallback: local state
      setQuotes((prev) => [...previewList, ...prev]);
      alert(`تم إضافة ${previewList.length} اقتباسًا (محليًا).`);
      setPreviewList([]);
    }
    setLoading(false);
  }

  // Manual add
  function addManual(text, author = "مجهول") {
    if (!text?.trim()) return;
    const q = { text: text.trim(), author: (author || "مجهول").trim() };
    if (supabase) {
      supabase
        .from("quotes")
        .insert([q])
        .then((res) => {
          if (res.error) {
            alert("خطأ أثناء الإضافة");
            console.warn(res.error);
          } else {
            setQuotes((prev) => [q, ...prev]);
          }
        });
    } else {
      setQuotes((prev) => [q, ...prev]);
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-50 p-6"
      dir="rtl"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold">
              QuoteTok — اقتباسات عربية
            </h1>
            <p className="text-sm text-gray-600">
              تصفح اقتباسات عربية، حمّلها كصور عمودية، أو استورد مجموعات
              اقتباسات عبر CSV/JSON.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAdminMode((s) => !s)}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {adminMode ? "خروج من لوحة المدير" : "لوحة المدير"}
            </button>
          </div>
        </header>

        {adminMode && (
          <section className="bg-white p-4 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-2">
              لوحة المدير — استيراد الاقتباسات
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              تحميل CSV أو JSON. <br />
              CSV: كل سطر -> <code>نص الاقتباس,المؤلف</code> <br />
              JSON: مصفوفة كائنات{" "}
              <code>
                [{"{"}"text":"...", "author":"..."}{"}"}]
              </code>
            </p>

            <div className="flex flex-col md:flex-row gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                className="p-2 border rounded w-full md:w-2/3"
              />
              <div className="flex gap-2">
                <button
                  disabled={!previewList.length || loading}
                  onClick={confirmImport}
                  className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                >
                  {loading ? "جارٍ الحفظ..." : "استيراد الاقتباسات"}
                </button>
                <button
                  onClick={() => {
                    setPreviewList([]);
                    setImportError("");
                  }}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  إلغاء المعاينة
                </button>
              </div>
            </div>

            {importError && (
              <p className="text-sm text-red-600 mt-3">{importError}</p>
            )}

            {previewList.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium">
                  معاينة قبل الاستيراد ({previewList.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {previewList.slice(0, 200).map((p, i) => (
                    <div key={i} className="p-3 border rounded bg-slate-50">
                      <p className="text-right leading-tight"> {p.text} </p>
                      <p className="text-sm text-gray-500 mt-2">— {p.author}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <ManualAdd onAdd={addManual} />
            </div>
          </section>
        )}

        <main>
          <div className="mb-6 flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن نص أو مؤلف..."
              className="p-3 flex-1 rounded-lg border"
            />
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((q, idx) => (
              <article
                key={idx}
                className="bg-white p-6 rounded-2xl shadow hover:shadow-lg transition"
              >
                <p className="text-right text-lg leading-relaxed mb-4">
                  {q.text}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">— {q.author}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(q)}
                      className="px-3 py-1 rounded-lg border"
                    >
                      نسخ
                    </button>
                    <button
                      onClick={() => handleShare(q)}
                      className="px-3 py-1 rounded-lg border"
                    >
                      مشاركة
                    </button>
                    <button
                      onClick={() => handleDownload(q)}
                      className="px-3 py-1 rounded-lg border"
                    >
                      تحميل صورة
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </main>

        {/* hidden poster used for rendering PNG */}
        <div
          style={{ position: "absolute", left: -9999, top: -9999 }}
          aria-hidden
        >
          <div
            ref={posterRef}
            style={{
              width: 1080,
              height: 1920,
              padding: 80,
              boxSizing: "border-box",
              background: "linear-gradient(135deg,#fef3c7 0%, #fbcfe8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{ maxWidth: 920, textAlign: "right", direction: "rtl" }}
            >
              <p
                style={{
                  fontSize: 56,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {selected?.text || "نص الاقتباس"}
              </p>
              <p style={{ marginTop: 30, fontSize: 28, color: "#374151" }}>
                {selected ? `— ${selected.author}` : "— المؤلف"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualAdd({ onAdd }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(text, author || "مجهول");
        setText("");
        setAuthor("");
      }}
      className="bg-white p-3 rounded shadow-sm"
    >
      <label className="block text-sm text-gray-700 mb-2">
        إضافة اقتباس يدويًا
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full border p-2 rounded mb-2"
        placeholder="أدخل نص الاقتباس بالعربية"
      />
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="المؤلف (اختياري)"
        className="w-full border p-2 rounded mb-3"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded"
        >
          أضف
        </button>
      </div>
    </form>
  );
}
