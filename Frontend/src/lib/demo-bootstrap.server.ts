
import { toInternalPassword } from "./auth-password";
import { DEMO_CASES } from "./mock-ai";

const DEMO_PHARMA = "11111111-1111-1111-1111-111111111111";
const SAMPLE_HC = "22222222-2222-2222-2222-222222222222";

const USERS = [
  { email: "superadmin@qardix.ai", name: "Platform Admin", role: "super_admin", company: null, status: "active", specialty: null },
  { email: "mm@demopharma.com", name: "Priya Sharma", role: "marketing_manager", company: DEMO_PHARMA, status: "active", specialty: null },
  { email: "dr.arjun@demopharma.com", name: "Dr. Arjun Kapoor", role: "doctor", company: DEMO_PHARMA, status: "active", specialty: "Cardiology" },
  { email: "dr.neha@demopharma.com", name: "Dr. Neha Iyer", role: "doctor", company: DEMO_PHARMA, status: "active", specialty: "Internal Medicine" },
  { email: "dr.vikram@demopharma.com", name: "Dr. Vikram Singh", role: "doctor", company: DEMO_PHARMA, status: "inactive", specialty: "General Physician" },
  { email: "dr.sana@samplehealth.com", name: "Dr. Sana Qureshi", role: "doctor", company: SAMPLE_HC, status: "active", specialty: "Cardiology" },
  { email: "mm@samplehealth.com", name: "Karan Joshi", role: "marketing_manager", company: SAMPLE_HC, status: "active", specialty: null },
] as const;

/** Idempotent one-time demo setup: no-op once the super admin exists. */
export async function runDemoBootstrap() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("login_id", "superadmin@qardix.ai").maybeSingle();
  if (existing) return { ok: true, skipped: true };

  const ids: Record<string, string> = {};
  for (const u of USERS) {
    let uid: string | undefined;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email, password: toInternalPassword("2798"), email_confirm: true,
    });
    if (data?.user) uid = data.user.id;
    else {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      uid = list?.users.find((x) => x.email === u.email)?.id;
      if (!uid) throw new Error(error?.message ?? "user create failed");
    }
    ids[u.email] = uid;
    await supabaseAdmin.from("profiles").upsert({
      id: uid, company_id: u.company, display_name: u.name, login_id: u.email, email: u.email,
      specialty: u.specialty, status: u.status,
      last_activity_at: new Date(Date.now() - Math.random() * 5 * 864e5).toISOString(),
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: u.role }, { onConflict: "user_id,role" });
  }

  // clinical seed
  const plan: { doc: string; key: "A" | "B" | "C"; daysAgo: number; age: number; sex: string; hr: number; sym: Record<string, boolean>; val: "confirm" | "correct" | "reject" }[] = [
    { doc: "dr.arjun@demopharma.com", key: "A", daysAgo: 1, age: 46, sex: "Male", hr: 72, sym: {}, val: "confirm" },
    { doc: "dr.arjun@demopharma.com", key: "B", daysAgo: 3, age: 67, sex: "Female", hr: 112, sym: { palpitation: true }, val: "confirm" },
    { doc: "dr.arjun@demopharma.com", key: "C", daysAgo: 4, age: 58, sex: "Male", hr: 88, sym: { chest_pain: true, breathlessness: true }, val: "correct" },
    { doc: "dr.arjun@demopharma.com", key: "A", daysAgo: 9, age: 34, sex: "Female", hr: 68, sym: {}, val: "confirm" },
    { doc: "dr.arjun@demopharma.com", key: "B", daysAgo: 16, age: 72, sex: "Male", hr: 104, sym: { palpitation: true }, val: "confirm" },
    { doc: "dr.arjun@demopharma.com", key: "A", daysAgo: 24, age: 51, sex: "Male", hr: 76, sym: {}, val: "reject" },
    { doc: "dr.neha@demopharma.com", key: "C", daysAgo: 2, age: 63, sex: "Female", hr: 94, sym: { chest_pain: true }, val: "confirm" },
    { doc: "dr.neha@demopharma.com", key: "A", daysAgo: 6, age: 41, sex: "Female", hr: 70, sym: {}, val: "confirm" },
    { doc: "dr.neha@demopharma.com", key: "B", daysAgo: 12, age: 69, sex: "Male", hr: 118, sym: { palpitation: true, breathlessness: true }, val: "correct" },
    { doc: "dr.neha@demopharma.com", key: "A", daysAgo: 38, age: 29, sex: "Male", hr: 64, sym: {}, val: "confirm" },
    { doc: "dr.sana@samplehealth.com", key: "A", daysAgo: 45, age: 55, sex: "Female", hr: 74, sym: {}, val: "confirm" },
  ];
  let n = 1;
  for (const p of plan) {
    const doctor_id = ids[p.doc]!;
    const company_id = USERS.find((u) => u.email === p.doc)!.company;
    const at = new Date(Date.now() - p.daysAgo * 864e5 - Math.random() * 8 * 36e5).toISOString();
    const c = DEMO_CASES[p.key];
    const h = 150 + Math.round(Math.random() * 30), w = 55 + Math.round(Math.random() * 35);
    const pid = `QX-P-${String(1000 + n).padStart(5, "0")}`;
    const { data: a } = await supabaseAdmin.from("patient_assessments").insert({
      anonymous_patient_id: pid, doctor_id, company_id, age: p.age, sex: p.sex, height_cm: h, weight_kg: w,
      bmi: Math.round((w / (h / 100) ** 2) * 10) / 10, bp_systolic: 118 + Math.round(Math.random() * 30),
      bp_diastolic: 76 + Math.round(Math.random() * 14), heart_rate: p.hr, spo2: 95 + Math.round(Math.random() * 4),
      diabetes_status: n % 3 === 0 ? "Type 2 Diabetes" : "Non-Diabetic",
      diabetic_complications: n % 3 === 0 ? ["Neuropathy"] : [],
      symptoms: { chest_pain: false, palpitation: false, breathlessness: false, syncope: false, ...p.sym },
      medicines: p.key === "B" ? ["Beta Blocker", "Anticoagulant"] : p.key === "C" ? ["Antiplatelet"] : [],
      created_at: at,
    }).select().single();
    if (!a) continue;
    const { data: e } = await supabaseAdmin.from("ecg_records").insert({
      assessment_id: a.id, doctor_id, company_id, image_path: null, quality_status: "accepted",
      processing_status: "completed", model_version: "demo-mock-1.0", created_at: at,
    }).select().single();
    const { data: r } = await supabaseAdmin.from("ai_results").insert({
      ecg_record_id: e!.id, assessment_id: a.id, doctor_id, company_id, ai_summary: c.ai_summary, findings: c.findings,
      confidence_json: { overall: c.confidence }, abnormal_leads: c.abnormal_leads, urgency: c.urgency,
      patient_explanation: c.patient_explanation, warning_signs: c.warning_signs,
      raw_output_json: { ...c, case_key: p.key }, created_at: at,
    }).select().single();
    const { data: v } = await supabaseAdmin.from("doctor_validations").insert({
      ai_result_id: r!.id, assessment_id: a.id, doctor_id, company_id, status: p.val,
      corrected_interpretation: p.val === "correct" ? (p.key === "C" ? "Lateral T-wave inversion; recommend troponin and repeat ECG." : "Atrial flutter with variable block favoured over AF.") : p.val === "reject" ? "Artefact-limited tracing; repeat ECG advised." : null,
      notes: p.val === "confirm" ? "Agree with AI-assisted summary." : null, validated_at: at,
    }).select().single();
    await supabaseAdmin.from("reports").insert({
      report_code: `QX-R-${String(2000 + n).padStart(5, "0")}`, assessment_id: a.id, validation_id: v!.id,
      doctor_id, company_id, report_status: "generated", generated_at: at,
    });
    await supabaseAdmin.from("usage_events").insert([
      { company_id, doctor_id, event_type: "analysis_completed", analysis_status: c.urgency, created_at: at },
      { company_id, doctor_id, event_type: "report_generated", analysis_status: "generated", created_at: at },
    ]);
    n++;
  }
  // login events
  for (const [email, d] of [["dr.arjun@demopharma.com", 0], ["dr.neha@demopharma.com", 1], ["mm@demopharma.com", 2], ["dr.vikram@demopharma.com", 20]] as const) {
    const u = USERS.find((x) => x.email === email)!;
    await supabaseAdmin.from("usage_events").insert({ company_id: u.company, doctor_id: ids[email]!, event_type: "login", created_at: new Date(Date.now() - d * 864e5).toISOString() });
  }
  return { ok: true, skipped: false };
}
