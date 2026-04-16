/**
 * Biomarker Reference Data — Dr. Chad Larson / The Adapt Lab
 *
 * Column guide:
 *   standardLow / standardHigh  — conventional lab reference range
 *   optimalLow  / optimalHigh   — Dr. Larson's tighter functional targets
 *   criticalLow / criticalHigh  — values requiring urgent clinical attention
 *   clinicalNote                — injected into AI interpretation prompt
 *   patientExplanation          — plain-English copy shown to patients
 *
 * Seeded via seedBiomarkers() in runIncrementalMigrations(). Upsert by slug
 * so re-running applies threshold edits without destroying lab result
 * history tied to biomarker ids.
 */

import type pg from "pg";

type BiomarkerSeedRow = {
  slug: string;
  name: string;
  abbreviation: string | null;
  unit: string;
  category:
    | "metabolic"
    | "lipid"
    | "inflammation"
    | "thyroid"
    | "hormones"
    | "nutrients"
    | "liver"
    | "kidney"
    | "cbc"
    | "derived";
  flagDirection: "high_bad" | "low_bad" | "both_bad" | "high_good";
  standardLow: number | null;
  standardHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  isDerived: boolean;
  derivationFormula: string | null;
  clinicalNote: string | null;
  description: string | null;
  patientExplanation: string | null;
  sortOrder: number;
  isActive: boolean;
};

export const biomarkerSeedData: BiomarkerSeedRow[] = [
  // ==================================================================
  // METABOLIC — glucose & insulin axis
  // ==================================================================
  {
    slug: "fasting_glucose",
    name: "Fasting Glucose",
    abbreviation: "FBG",
    unit: "mg/dL",
    category: "metabolic",
    flagDirection: "both_bad",
    standardLow: 70,
    standardHigh: 99,
    optimalLow: 72,
    optimalHigh: 90,
    criticalLow: 60,
    criticalHigh: 126,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Conventional cutoff of 99 mg/dL is too permissive. Target ≤90 for metabolic health. " +
      "Values 91–99 represent early insulin resistance even though standard range calls them normal. " +
      "Context matters — assess alongside fasting insulin and HOMA-IR before drawing conclusions.",
    description: "Blood sugar level after an overnight fast",
    patientExplanation:
      "This measures your blood sugar after not eating for at least 8 hours. " +
      "My optimal target (72–90 mg/dL) is tighter than the standard lab range because early insulin resistance shows up in glucose long before a diagnosis is made.",
    sortOrder: 10,
    isActive: true,
  },
  {
    slug: "fasting_insulin",
    name: "Fasting Insulin",
    abbreviation: null,
    unit: "μIU/mL",
    category: "metabolic",
    flagDirection: "high_bad",
    standardLow: 2,
    standardHigh: 25,
    optimalLow: 2,
    optimalHigh: 7,
    criticalLow: null,
    criticalHigh: 30,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Standard upper limit of 25 μIU/mL is far too permissive — it is the level at which insulin resistance is " +
      "already well-established. Optimal ceiling is <7 μIU/mL. Values 7–10 indicate early insulin resistance. " +
      "Values >10 indicate meaningful insulin resistance even with normal fasting glucose. " +
      "Always pair with fasting glucose to calculate HOMA-IR. This is the most sensitive early marker of metabolic dysfunction.",
    description: "Insulin level after an overnight fast — the most sensitive early marker of metabolic dysfunction",
    patientExplanation:
      "Insulin is the hormone that manages your blood sugar. When your cells stop responding to insulin efficiently, " +
      "your pancreas has to produce more and more of it. Elevated fasting insulin — even with normal blood sugar — is often the first sign " +
      "that your metabolism needs support. My target is under 7 μIU/mL.",
    sortOrder: 11,
    isActive: true,
  },
  {
    slug: "homa_ir",
    name: "HOMA-IR",
    abbreviation: "HOMA-IR",
    unit: "ratio",
    category: "derived",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 2.5,
    optimalLow: null,
    optimalHigh: 1.5,
    criticalLow: null,
    criticalHigh: 5.0,
    isDerived: true,
    derivationFormula: "(fasting_insulin * fasting_glucose) / 405",
    clinicalNote:
      "HOMA-IR (Homeostatic Model Assessment of Insulin Resistance) is calculated as " +
      "(fasting insulin × fasting glucose) / 405. " +
      "Optimal target is <1.5. Values 1.5–2.5 indicate developing insulin resistance. " +
      "Values >2.5 indicate clinically meaningful insulin resistance. Values >5.0 are consistent with severe insulin resistance or pre-diabetes. " +
      "This is one of the most actionable metabolic markers in the practice.",
    description: "Calculated index of insulin resistance using fasting insulin and glucose",
    patientExplanation:
      "HOMA-IR combines your fasting insulin and fasting glucose into a single number that reflects how hard " +
      "your pancreas is working to keep your blood sugar controlled. A lower number is better. " +
      "My target is under 1.5 — significantly tighter than the standard cutoff of 2.5.",
    sortOrder: 12,
    isActive: true,
  },
  {
    slug: "hemoglobin_a1c",
    name: "Hemoglobin A1c",
    abbreviation: "HbA1c",
    unit: "%",
    category: "metabolic",
    flagDirection: "high_bad",
    standardLow: 4.0,
    standardHigh: 5.6,
    optimalLow: 4.0,
    optimalHigh: 5.4,
    criticalLow: null,
    criticalHigh: 6.5,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "HbA1c reflects average blood glucose over approximately 3 months. " +
      "Standard normal cutoff is 5.6% but emerging research links values above 5.4% with increased cardiometabolic risk. " +
      "In the context of a low-carb/ketogenic program, expect HbA1c to trend downward. " +
      "Note: artificially low HbA1c can occur with hemolytic anemia or recent blood transfusion.",
    description: "A 3-month average of your blood sugar control",
    patientExplanation:
      "HbA1c gives us a snapshot of your average blood sugar over the past 3 months — think of it as a long-term average rather than a single day's reading. " +
      "My target is below 5.4%, which is tighter than the standard cutoff of 5.6%, because the research shows that cardiometabolic risk begins rising before you reach the pre-diabetic threshold.",
    sortOrder: 13,
    isActive: true,
  },
  {
    slug: "fasting_c_peptide",
    name: "Fasting C-Peptide",
    abbreviation: "C-Peptide",
    unit: "ng/mL",
    category: "metabolic",
    flagDirection: "both_bad",
    standardLow: 0.8,
    standardHigh: 3.1,
    optimalLow: 0.8,
    optimalHigh: 2.0,
    criticalLow: null,
    criticalHigh: 4.0,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "C-peptide is produced in equal amounts to insulin and provides a measure of pancreatic beta-cell output " +
      "that is not affected by exogenous insulin. Useful for distinguishing insulin resistance (elevated) from " +
      "beta-cell exhaustion (low). Elevated C-peptide alongside elevated fasting insulin confirms hyperinsulinemia.",
    description: "A measure of how much insulin your pancreas is producing",
    patientExplanation:
      "C-peptide is a byproduct of insulin production — it tells us how hard your pancreas is working to make insulin. " +
      "Combined with your fasting insulin level, it helps us understand whether high insulin reflects overproduction or poor clearance.",
    sortOrder: 14,
    isActive: true,
  },

  // ==================================================================
  // LIPID PANEL
  // ==================================================================
  {
    slug: "total_cholesterol",
    name: "Total Cholesterol",
    abbreviation: "TC",
    unit: "mg/dL",
    category: "lipid",
    flagDirection: "both_bad",
    standardLow: null,
    standardHigh: 200,
    optimalLow: 150,
    optimalHigh: 220,
    criticalLow: null,
    criticalHigh: 300,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Total cholesterol in isolation is a poor cardiovascular risk predictor. " +
      "Context matters enormously — high TC on a low-carb protocol often reflects elevated HDL and large buoyant LDL particles, " +
      "which is a favorable pattern. Always interpret alongside LDL-P, TG/HDL ratio, and sdLDL before treating the number.",
    description: "Total amount of cholesterol in your blood",
    patientExplanation:
      "Total cholesterol by itself is not a very useful number — it's like judging traffic by counting all the cars without knowing if they're moving. " +
      "What matters more is the type and size of particles carrying that cholesterol, which is why we look at LDL particle count and the TG/HDL ratio.",
    sortOrder: 20,
    isActive: true,
  },
  {
    slug: "ldl_cholesterol",
    name: "LDL Cholesterol",
    abbreviation: "LDL-C",
    unit: "mg/dL",
    category: "lipid",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 100,
    optimalLow: null,
    optimalHigh: 90,
    criticalLow: null,
    criticalHigh: 190,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "LDL-C is the calculated or direct LDL cholesterol mass. It significantly underestimates atherogenic risk in patients with " +
      "low triglycerides (common on ketogenic diets) due to the Friedewald equation limitation. " +
      "Always pair with LDL-P (particle count). A patient may have elevated LDL-C with low LDL-P (large fluffy particles) — " +
      "which carries lower risk. Do not treat LDL-C in isolation.",
    description: "The bad cholesterol — the amount carried by LDL particles",
    patientExplanation:
      "LDL-C is the standard bad cholesterol number on most lab panels, but it doesn't tell the full story. " +
      "What actually matters is how many LDL particles are in circulation (LDL-P) and what size they are. " +
      "On a low-carb diet, LDL-C can rise while actual cardiovascular risk stays flat or improves.",
    sortOrder: 21,
    isActive: true,
  },
  {
    slug: "ldl_particle_count",
    name: "LDL Particle Count",
    abbreviation: "LDL-P",
    unit: "nmol/L",
    category: "lipid",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 1000,
    optimalLow: null,
    optimalHigh: 700,
    criticalLow: null,
    criticalHigh: 1600,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "LDL-P (particle count via NMR) is a far superior predictor of cardiovascular events than LDL-C. " +
      "Optimal target: <700 nmol/L. Near optimal: 700–1000. Borderline high: 1000–1300. High: 1300–1600. Very high: >1600. " +
      "Discordance between LDL-C and LDL-P is common on low-carb diets — when TG is low, LDL-C underestimates particle burden.",
    description: "Number of LDL particles — a more precise cardiovascular risk marker than LDL cholesterol",
    patientExplanation:
      "This measures the actual number of LDL particles in your bloodstream. " +
      "Think of it like counting individual cars on a highway, not just measuring the total weight of the traffic. " +
      "A higher particle count means more potential for plaque buildup, even if your standard LDL-C looks acceptable.",
    sortOrder: 22,
    isActive: true,
  },
  {
    slug: "hdl_cholesterol",
    name: "HDL Cholesterol",
    abbreviation: "HDL-C",
    unit: "mg/dL",
    category: "lipid",
    flagDirection: "low_bad",
    standardLow: 40,
    standardHigh: null,
    optimalLow: 60,
    optimalHigh: null,
    criticalLow: 30,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "HDL is the protective cholesterol. Standard cutoff of 40 mg/dL is too low as a target. " +
      "Optimal >60 mg/dL for both men and women in the context of this practice. " +
      "HDL reliably rises on low-carb/ketogenic protocols — improvement here is one of the earliest positive signals after program initiation. " +
      "Note: very high HDL (>100) may paradoxically indicate dysfunctional HDL in some populations.",
    description: "The good cholesterol — helps remove LDL from the bloodstream",
    patientExplanation:
      "HDL is your cleanup crew — it helps remove LDL particles from your arteries and transport cholesterol back to the liver for processing. " +
      "The higher, the better (up to a point). The great news: HDL consistently rises on the low-carb protocol we follow together.",
    sortOrder: 23,
    isActive: true,
  },
  {
    slug: "triglycerides",
    name: "Triglycerides",
    abbreviation: "TG",
    unit: "mg/dL",
    category: "lipid",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 150,
    optimalLow: null,
    optimalHigh: 100,
    criticalLow: null,
    criticalHigh: 500,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Triglycerides are one of the most diet-responsive biomarkers. High TG reflects carbohydrate excess and insulin resistance. " +
      "Optimal target is <100 mg/dL — often achievable within 6–8 weeks on the ketogenic protocol. " +
      "TG is the numerator in the TG/HDL ratio, which is the most accessible surrogate for insulin resistance. " +
      "Fasting state matters — confirm 10–12 hr fast before interpreting.",
    description: "Fat particles in your blood — directly reflects carbohydrate intake",
    patientExplanation:
      "Triglycerides are fat molecules circulating in your blood, and they respond almost immediately to changes in carbohydrate intake. " +
      "High triglycerides are one of the clearest signs of metabolic dysfunction — and one of the fastest to improve. " +
      "My target is under 100 mg/dL.",
    sortOrder: 24,
    isActive: true,
  },
  {
    slug: "tg_hdl_ratio",
    name: "TG/HDL Ratio",
    abbreviation: "TG/HDL",
    unit: "ratio",
    category: "derived",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 3.5,
    optimalLow: null,
    optimalHigh: 1.5,
    criticalLow: null,
    criticalHigh: 5.0,
    isDerived: true,
    derivationFormula: "triglycerides / hdl_cholesterol",
    clinicalNote:
      "TG/HDL ratio is the most accessible proxy for insulin resistance and small dense LDL particle burden. " +
      "Optimal target: <1.5. Borderline: 1.5–3.5. High: >3.5. Critical: >5.0. " +
      "A ratio below 1.5 is strongly associated with a favorable LDL particle size profile (large buoyant). " +
      "A ratio above 3.5 is associated with small dense LDL pattern B, even when LDL-C appears normal. " +
      "This is one of the practice's primary clinical decision markers.",
    description: "Ratio of triglycerides to HDL — a powerful surrogate for insulin resistance",
    patientExplanation:
      "The TG/HDL ratio combines two of the most important cardiovascular and metabolic markers into one number. " +
      "When your triglycerides are low and your HDL is high (both outcomes of our protocol), this ratio drops — and that's exactly what we're aiming for. " +
      "My target is below 1.5.",
    sortOrder: 25,
    isActive: true,
  },
  {
    slug: "small_dense_ldl",
    name: "Small Dense LDL",
    abbreviation: "sdLDL",
    unit: "mg/dL",
    category: "lipid",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 30,
    optimalLow: null,
    optimalHigh: 20,
    criticalLow: null,
    criticalHigh: 60,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Small dense LDL particles are the atherogenic subtype. Pattern B (predominance of sdLDL) carries significantly higher cardiovascular risk " +
      "than Pattern A. sdLDL correlates strongly with TG/HDL ratio — when TG/HDL is <1.5, sdLDL is almost always favorable.",
    description: "The most dangerous form of LDL — small particles that penetrate artery walls more easily",
    patientExplanation:
      "Not all LDL particles are equal. Small, dense LDL particles are more likely to get lodged in artery walls than large, fluffy ones. " +
      "This marker tells us your LDL particle size pattern. The good news: a low-carb diet shifts you toward the larger, safer particle type.",
    sortOrder: 26,
    isActive: true,
  },

  // ==================================================================
  // INFLAMMATION
  // ==================================================================
  {
    slug: "hs_crp",
    name: "High-Sensitivity CRP",
    abbreviation: "hs-CRP",
    unit: "mg/L",
    category: "inflammation",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 3.0,
    optimalLow: null,
    optimalHigh: 1.0,
    criticalLow: null,
    criticalHigh: 10.0,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "hs-CRP is the most accessible systemic inflammation marker. " +
      "Conventional <3.0 mg/L is acceptable for cardiology; functional medicine target is <1.0 mg/L. " +
      "Transiently elevated hs-CRP (>10 mg/L) often reflects acute infection/injury — rule out before interpreting as chronic inflammation. " +
      "Chronically elevated hs-CRP alongside insulin resistance is a core finding in metabolic syndrome. " +
      "Expect improvement with carbohydrate restriction and weight loss.",
    description: "A sensitive marker of systemic inflammation throughout the body",
    patientExplanation:
      "CRP is produced by your liver in response to inflammation anywhere in the body. " +
      "The high-sensitivity version detects even very low levels, which makes it useful for identifying smoldering chronic inflammation — " +
      "the type linked to heart disease, insulin resistance, and cognitive decline. My target is below 1.0 mg/L.",
    sortOrder: 30,
    isActive: true,
  },
  {
    slug: "homocysteine",
    name: "Homocysteine",
    abbreviation: null,
    unit: "μmol/L",
    category: "inflammation",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 15.0,
    optimalLow: null,
    optimalHigh: 8.0,
    criticalLow: null,
    criticalHigh: 20.0,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Homocysteine is an independent cardiovascular risk factor and a marker of methylation capacity. " +
      "Standard cutoff of 15 μmol/L is too permissive — risk increases continuously above 8 μmol/L. " +
      "Elevated homocysteine often responds to B12, folate, and B6 supplementation. " +
      "MTHFR polymorphisms may require methylated B vitamins. " +
      "Also relevant to neuroinflammation and cognitive function — a key marker in the gut-brain axis research cohort.",
    description: "An amino acid that, when elevated, increases cardiovascular and cognitive risk",
    patientExplanation:
      "Homocysteine is an amino acid that builds up when your methylation pathways (a critical cellular process) aren't running efficiently. " +
      "Elevated levels are linked to increased risk of heart disease, stroke, and cognitive decline. " +
      "The good news: it often responds well to B-vitamin therapy. My target is below 8 μmol/L.",
    sortOrder: 31,
    isActive: true,
  },
  {
    slug: "fibrinogen",
    name: "Fibrinogen",
    abbreviation: null,
    unit: "mg/dL",
    category: "inflammation",
    flagDirection: "both_bad",
    standardLow: 200,
    standardHigh: 400,
    optimalLow: 200,
    optimalHigh: 300,
    criticalLow: 150,
    criticalHigh: 500,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Fibrinogen is both a clotting factor and an acute-phase inflammatory protein. " +
      "Elevated fibrinogen increases thrombotic risk and is a component of metabolic syndrome. " +
      "Rises with insulin resistance, smoking, and chronic inflammation. Falls with weight loss and exercise.",
    description: "A clotting protein that doubles as an inflammation marker",
    patientExplanation:
      "Fibrinogen helps your blood clot, but when it's chronically elevated it also signals ongoing inflammation " +
      "and increases the risk of clot-related events. Like CRP, it tends to normalize as metabolic health improves.",
    sortOrder: 32,
    isActive: true,
  },
  {
    slug: "uric_acid",
    name: "Uric Acid",
    abbreviation: null,
    unit: "mg/dL",
    category: "inflammation",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 7.0,
    optimalLow: null,
    optimalHigh: 5.5,
    criticalLow: null,
    criticalHigh: 9.0,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Uric acid is an underappreciated metabolic marker. Elevated levels correlate strongly with insulin resistance, " +
      "fructose overconsumption, and metabolic syndrome. Note: uric acid may transiently rise in the first 2–4 weeks " +
      "of a ketogenic diet (due to competition with ketones for renal excretion) before normalizing. " +
      "Gout history warrants close monitoring.",
    description: "A waste product linked to gout, insulin resistance, and fructose overload",
    patientExplanation:
      "Uric acid is a waste product from purine metabolism, but elevated levels also signal metabolic dysfunction — " +
      "particularly too much fructose in the diet and insulin resistance. If you're new to keto, it may temporarily rise before coming down.",
    sortOrder: 33,
    isActive: true,
  },

  // ==================================================================
  // THYROID
  // ==================================================================
  {
    slug: "tsh",
    name: "Thyroid Stimulating Hormone",
    abbreviation: "TSH",
    unit: "μIU/mL",
    category: "thyroid",
    flagDirection: "both_bad",
    standardLow: 0.45,
    standardHigh: 4.5,
    optimalLow: 1.0,
    optimalHigh: 2.5,
    criticalLow: 0.1,
    criticalHigh: 10.0,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Standard TSH range (0.45–4.5) is too wide for functional assessment. " +
      "Optimal range 1.0–2.5 μIU/mL reflects the range in which most people feel their best and tissue-level thyroid function is adequate. " +
      "TSH alone does not confirm adequate thyroid hormone conversion — always assess with free T3 and free T4. " +
      "TSH may suppress mildly on ketogenic diets in euthyroid patients — interpret in clinical context.",
    description: "The pituitary hormone that signals your thyroid to produce more thyroid hormone",
    patientExplanation:
      "TSH is like the thermostat signal your brain sends to your thyroid. " +
      "A high TSH means your brain is signaling we need more thyroid hormone, which can indicate your thyroid isn't keeping up. " +
      "But TSH alone doesn't tell the whole story — we also need to check the actual hormone levels your thyroid is producing.",
    sortOrder: 40,
    isActive: true,
  },
  {
    slug: "free_t3",
    name: "Free T3",
    abbreviation: "fT3",
    unit: "pg/mL",
    category: "thyroid",
    flagDirection: "both_bad",
    standardLow: 2.3,
    standardHigh: 4.2,
    optimalLow: 3.2,
    optimalHigh: 4.2,
    criticalLow: 1.8,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Free T3 is the metabolically active thyroid hormone at the tissue level. " +
      "Low-normal fT3 (below 3.2 pg/mL) is a common finding in patients with fatigue, cold intolerance, and weight resistance — " +
      "even with normal TSH. May be suppressed on very low-calorie or very low-carb diets. " +
      "Low fT3 with low-normal TSH suggests central hypothyroidism or nonthyroidal illness.",
    description: "The active form of thyroid hormone — the metabolic accelerator",
    patientExplanation:
      "Free T3 is the thyroid hormone that actually does the work inside your cells — it drives energy production, metabolism, and temperature regulation. " +
      "It's possible to have a normal TSH and still have low Free T3, which explains why some patients feel hypothyroid even after standard testing.",
    sortOrder: 41,
    isActive: true,
  },
  {
    slug: "free_t4",
    name: "Free T4",
    abbreviation: "fT4",
    unit: "ng/dL",
    category: "thyroid",
    flagDirection: "both_bad",
    standardLow: 0.82,
    standardHigh: 1.77,
    optimalLow: 1.0,
    optimalHigh: 1.5,
    criticalLow: 0.5,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Free T4 is the precursor to T3 — converted in peripheral tissues (liver, gut) to the active fT3. " +
      "Low-normal fT4 with low fT3 suggests impaired thyroid production. Normal fT4 with low fT3 suggests impaired conversion (common in gut dysbiosis, high cortisol, selenium deficiency). " +
      "The fT3:fT4 ratio is informative — a low ratio (<0.25) suggests poor conversion.",
    description: "The storage form of thyroid hormone — converted to active T3 in your tissues",
    patientExplanation:
      "Free T4 is the storage version of thyroid hormone. Your body converts it to the active form (T3) in your tissues. " +
      "When conversion is impaired — which can happen with gut dysfunction, high stress, or nutrient deficiencies — " +
      "T4 looks normal but T3 is low, and you still feel hypothyroid symptoms.",
    sortOrder: 42,
    isActive: true,
  },
  {
    slug: "reverse_t3",
    name: "Reverse T3",
    abbreviation: "rT3",
    unit: "ng/dL",
    category: "thyroid",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 25,
    optimalLow: null,
    optimalHigh: 20,
    criticalLow: null,
    criticalHigh: 35,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Reverse T3 is an inactive metabolite that competes with active fT3 at the receptor. " +
      "Chronically elevated rT3 (>20 ng/dL) — especially when fT3 is low — suggests functional hypothyroidism via a T3 block. " +
      "Common drivers: chronic stress, caloric restriction, heavy metal toxicity, inflammatory cytokines. " +
      "fT3/rT3 ratio <20 is associated with cellular hypothyroidism.",
    description: "An inactive thyroid hormone that can block the active form from working",
    patientExplanation:
      "Reverse T3 is a metabolite your body produces when it's under chronic stress or caloric restriction. " +
      "The problem is that it occupies the same receptor as the active thyroid hormone — effectively blocking it. " +
      "This is one reason why chronic stress can cause thyroid-like symptoms even when standard tests look normal.",
    sortOrder: 43,
    isActive: true,
  },

  // ==================================================================
  // NUTRIENTS & COFACTORS
  // ==================================================================
  {
    slug: "vitamin_d",
    name: "Vitamin D (25-OH)",
    abbreviation: "25(OH)D",
    unit: "ng/mL",
    category: "nutrients",
    flagDirection: "both_bad",
    standardLow: 30,
    standardHigh: 100,
    optimalLow: 50,
    optimalHigh: 80,
    criticalLow: 20,
    criticalHigh: 150,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Vitamin D is both a hormone and a critical immune/inflammatory regulator. " +
      "Standard cutoff of 30 ng/mL defines deficiency — but optimal function requires 50–80 ng/mL. " +
      "Vitamin D deficiency is pervasive (>70% of patients at initial evaluation) and correlates with insulin resistance, systemic inflammation, and metabolic syndrome. " +
      "In Southern California, despite sun exposure, many patients are still deficient due to indoor lifestyles, sunscreen use, and darker skin pigmentation. " +
      "Supplementation is nearly universal in this practice.",
    description: "A hormone-like nutrient essential for metabolic health, immunity, and inflammation control",
    patientExplanation:
      "Vitamin D functions more like a hormone than a vitamin — it regulates hundreds of genes involved in immune function, inflammation, and metabolism. " +
      "Despite living in San Diego, most of my patients come in deficient because sun exposure alone rarely gets levels to the optimal range (50–80 ng/mL). " +
      "Deficiency is linked to insulin resistance, poor immune function, and chronic inflammation.",
    sortOrder: 50,
    isActive: true,
  },
  {
    slug: "magnesium_rbc",
    name: "Magnesium (RBC)",
    abbreviation: "Mg-RBC",
    unit: "mg/dL",
    category: "nutrients",
    flagDirection: "both_bad",
    standardLow: 4.0,
    standardHigh: 6.4,
    optimalLow: 5.5,
    optimalHigh: 6.4,
    criticalLow: 3.5,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "RBC magnesium is a far superior measure of intracellular magnesium status compared to serum magnesium. " +
      "Serum magnesium can appear normal even when intracellular stores are depleted. " +
      "Magnesium is a cofactor in over 300 enzymatic reactions including insulin signaling, ATP production, and DNA repair. " +
      "Deficiency is common on ketogenic diets due to increased renal excretion. " +
      "Low RBC Mg correlates with insulin resistance, hypertension, and poor sleep.",
    description: "Intracellular magnesium — a more accurate measure than serum levels",
    patientExplanation:
      "Most labs measure magnesium in your blood serum, but the more meaningful measurement is inside your red blood cells — " +
      "that's where magnesium actually does its work. Magnesium is critical for insulin sensitivity, energy production, sleep quality, and muscle function. " +
      "It's commonly depleted on a ketogenic diet due to increased urinary losses.",
    sortOrder: 51,
    isActive: true,
  },
  {
    slug: "ferritin",
    name: "Ferritin",
    abbreviation: null,
    unit: "ng/mL",
    category: "nutrients",
    flagDirection: "both_bad",
    standardLow: 12,
    standardHigh: 300,
    optimalLow: 40,
    optimalHigh: 150,
    criticalLow: 10,
    criticalHigh: 400,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Ferritin is primarily an iron storage protein but also an acute-phase reactant that rises with inflammation. " +
      "Low ferritin (<40 ng/mL) indicates depleted iron stores — causes fatigue, poor thyroid T4→T3 conversion, and hair loss. " +
      "High ferritin (>150 ng/mL in absence of recent illness) suggests iron overload OR chronic inflammation masking true iron status. " +
      "Iron and inflammation should be distinguished before supplementing.",
    description: "The body's iron storage protein — also rises with inflammation",
    patientExplanation:
      "Ferritin stores iron in your cells. Too low causes fatigue, brain fog, and poor thyroid function. " +
      "Too high can be a sign of excess iron OR chronic inflammation — which is why we look at it alongside your CRP level. " +
      "Both ends of the spectrum have real consequences.",
    sortOrder: 52,
    isActive: true,
  },
  {
    slug: "vitamin_b12",
    name: "Vitamin B12",
    abbreviation: "B12",
    unit: "pg/mL",
    category: "nutrients",
    flagDirection: "both_bad",
    standardLow: 200,
    standardHigh: 900,
    optimalLow: 500,
    optimalHigh: 900,
    criticalLow: 150,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Standard lower limit of 200 pg/mL is far too low for neurological protection. " +
      "Subacute combined degeneration of the spinal cord can occur at normal serum B12 levels. " +
      "Functional B12 deficiency (elevated methylmalonic acid, elevated homocysteine) can occur with serum B12 in the 300–400 range. " +
      "Metformin depletes B12 — monitor closely in any patient on this medication.",
    description: "Essential for nerve function, red blood cell production, and methylation",
    patientExplanation:
      "B12 is essential for nerve health, energy production, and DNA synthesis. " +
      "The standard lab cutoff misses many people with functional deficiency — I aim for levels above 500 pg/mL. " +
      "If you're on metformin, B12 monitoring is especially important since this medication reduces absorption.",
    sortOrder: 53,
    isActive: true,
  },

  // ==================================================================
  // LIVER FUNCTION
  // ==================================================================
  {
    slug: "alt",
    name: "Alanine Aminotransferase",
    abbreviation: "ALT",
    unit: "U/L",
    category: "liver",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 40,
    optimalLow: null,
    optimalHigh: 25,
    criticalLow: null,
    criticalHigh: 80,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "ALT is a liver-specific enzyme elevated in hepatocyte damage. " +
      "Standard upper limit of 40 U/L is set too high — NHANES data suggest values above 19 (women) / 30 (men) correlate with increased metabolic risk. " +
      "Elevated ALT in the context of insulin resistance = MASLD (metabolic-associated steatotic liver disease). " +
      "ALT may transiently rise in the first 4–6 weeks of a very-low-carb diet as hepatic fat mobilizes — this is not concerning; " +
      "differentiate from true hepatocellular injury with clinical context.",
    description: "A liver enzyme elevated when liver cells are stressed or damaged",
    patientExplanation:
      "ALT is an enzyme released when liver cells are under stress. " +
      "Chronically elevated ALT — even mildly — is one of the most common signs of fatty liver associated with insulin resistance. " +
      "The great news: this marker typically normalizes dramatically on a low-carb protocol as the liver clears stored fat.",
    sortOrder: 60,
    isActive: true,
  },
  {
    slug: "ast",
    name: "Aspartate Aminotransferase",
    abbreviation: "AST",
    unit: "U/L",
    category: "liver",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 40,
    optimalLow: null,
    optimalHigh: 25,
    criticalLow: null,
    criticalHigh: 80,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "AST is found in the liver, muscle, and heart. Unlike ALT, it is not liver-specific. " +
      "AST/ALT ratio >2 suggests alcoholic liver disease. " +
      "Isolated elevated AST in an athlete may reflect muscle origin — check creatine kinase to differentiate. " +
      "In the absence of heavy exercise, elevated AST alongside elevated ALT confirms hepatic origin.",
    description: "A liver and muscle enzyme — elevated in liver stress or muscle damage",
    patientExplanation:
      "AST is similar to ALT but comes from both the liver and muscle. " +
      "We look at it alongside ALT to get a clearer picture of liver health. " +
      "If you've had an intense workout recently, AST can rise from muscle activity rather than liver stress.",
    sortOrder: 61,
    isActive: true,
  },
  {
    slug: "ggt",
    name: "Gamma-Glutamyl Transferase",
    abbreviation: "GGT",
    unit: "U/L",
    category: "liver",
    flagDirection: "high_bad",
    standardLow: null,
    standardHigh: 60,
    optimalLow: null,
    optimalHigh: 25,
    criticalLow: null,
    criticalHigh: 100,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "GGT is a sensitive marker of oxidative stress, alcohol consumption, and early liver dysfunction. " +
      "It is often elevated before ALT/AST in early MASLD. " +
      "Elevated GGT is an independent predictor of insulin resistance, type 2 diabetes, and cardiovascular events. " +
      "An underutilized marker that belongs in every metabolic panel.",
    description: "A sensitive liver enzyme that reflects oxidative stress and early liver dysfunction",
    patientExplanation:
      "GGT is a liver enzyme that rises early in liver stress — often before ALT and AST. " +
      "It's sensitive to alcohol, oxidative stress, and early fatty liver. " +
      "Chronically elevated GGT is a surprisingly strong predictor of metabolic disease, even when other liver markers look normal.",
    sortOrder: 62,
    isActive: true,
  },

  // ==================================================================
  // HORMONES
  // ==================================================================
  {
    slug: "testosterone_total",
    name: "Total Testosterone",
    abbreviation: "TT",
    unit: "ng/dL",
    category: "hormones",
    flagDirection: "low_bad",
    standardLow: 300,
    standardHigh: 1000,
    optimalLow: 600,
    optimalHigh: 900,
    criticalLow: 200,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Standard lower limit of 300 ng/dL reflects a population average that has declined over decades — not an optimal target. " +
      "Functional optimal in men is 600–900 ng/dL. Values 300–600 often produce symptoms (fatigue, body composition resistance, libido changes) even when called normal. " +
      "Insulin resistance is a primary driver of low testosterone — improving HOMA-IR is often the first therapeutic step. " +
      "Always assess alongside SHBG and free testosterone for full clinical picture.",
    description: "The primary male hormone — critical for energy, body composition, and metabolic health",
    patientExplanation:
      "Testosterone is critical for energy, muscle mass, fat distribution, mood, and libido — in both men and women, though at different levels. " +
      "The standard normal range on labs includes a lot of men who feel terrible. " +
      "Importantly, insulin resistance is one of the biggest drivers of low testosterone — which means our metabolic program directly addresses this.",
    sortOrder: 70,
    isActive: true,
  },
  {
    slug: "shbg",
    name: "Sex Hormone Binding Globulin",
    abbreviation: "SHBG",
    unit: "nmol/L",
    category: "hormones",
    flagDirection: "both_bad",
    standardLow: 10,
    standardHigh: 57,
    optimalLow: 20,
    optimalHigh: 45,
    criticalLow: null,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "SHBG binds testosterone (and estrogen), determining the fraction available for bioactivity. " +
      "Low SHBG is strongly associated with insulin resistance, PCOS, and metabolic syndrome — SHBG is suppressed by hyperinsulinemia. " +
      "High SHBG reduces free testosterone availability even when total testosterone is adequate. " +
      "SHBG is one of the most reliable surrogate markers of insulin signaling in clinical practice.",
    description: "The protein that binds and regulates the availability of sex hormones",
    patientExplanation:
      "SHBG is a protein that holds onto testosterone, determining how much of your total testosterone is actually available to your tissues. " +
      "Interestingly, high insulin suppresses SHBG — so insulin resistance is often reflected in low SHBG levels. " +
      "Improving insulin sensitivity tends to bring SHBG back into the optimal range.",
    sortOrder: 71,
    isActive: true,
  },
  {
    slug: "cortisol_morning",
    name: "Morning Cortisol",
    abbreviation: "Cortisol AM",
    unit: "μg/dL",
    category: "hormones",
    flagDirection: "both_bad",
    standardLow: 6,
    standardHigh: 23,
    optimalLow: 10,
    optimalHigh: 20,
    criticalLow: 3,
    criticalHigh: 30,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "Morning cortisol (drawn 7–9am) should be at its daily peak (cortisol awakening response). " +
      "Low morning cortisol suggests HPA axis dysregulation or adrenal insufficiency. " +
      "Chronically high morning cortisol drives insulin resistance via gluconeogenesis and inhibits thyroid T4→T3 conversion. " +
      "Interpret alongside clinical history — stress, sleep quality, and steroid use all affect this marker.",
    description: "The stress hormone — should be at its daily peak in the morning",
    patientExplanation:
      "Cortisol follows a daily rhythm — high in the morning (giving you energy to start the day) and low at night. " +
      "Chronically elevated cortisol from ongoing stress directly contributes to insulin resistance, fat storage around the midsection, and disrupted sleep. " +
      "Low morning cortisol can indicate HPA axis burnout from prolonged chronic stress.",
    sortOrder: 72,
    isActive: true,
  },

  // ==================================================================
  // KIDNEY FUNCTION
  // ==================================================================
  {
    slug: "egfr",
    name: "eGFR",
    abbreviation: "eGFR",
    unit: "mL/min/1.73m²",
    category: "kidney",
    flagDirection: "low_bad",
    standardLow: 60,
    standardHigh: null,
    optimalLow: 90,
    optimalHigh: null,
    criticalLow: 30,
    criticalHigh: null,
    isDerived: false,
    derivationFormula: null,
    clinicalNote:
      "eGFR estimates kidney filtration capacity. Values above 90 are optimal. " +
      "Mild decline (60–89) warrants monitoring; protein intake should be assessed and managed. " +
      "Relevant in GLP-1 patients — these agents are generally renal-protective but impaired kidney function affects dosing considerations. " +
      "Note: eGFR can underestimate GFR in highly muscular individuals.",
    description: "Estimated kidney filtration rate — measures how well your kidneys are cleaning your blood",
    patientExplanation:
      "eGFR tells us how efficiently your kidneys are filtering waste from your blood. " +
      "High-protein dietary protocols require healthy kidney function, so we monitor this closely. " +
      "The good news: improving metabolic health protects kidney function over the long term.",
    sortOrder: 80,
    isActive: true,
  },
];

/**
 * Upsert all biomarker reference rows by slug. Idempotent — safe to call on
 * every boot. Preserves row ids so lab_results FK references stay valid when
 * thresholds are edited.
 */
export async function seedBiomarkers(pool: pg.Pool): Promise<void> {
  const startedAt = Date.now();
  for (const b of biomarkerSeedData) {
    await pool.query(
      `INSERT INTO biomarkers (
        slug, name, abbreviation, unit, category, flag_direction,
        standard_low, standard_high, optimal_low, optimal_high,
        critical_low, critical_high, is_derived, derivation_formula,
        clinical_note, description, patient_explanation, sort_order, is_active, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19, NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        abbreviation = EXCLUDED.abbreviation,
        unit = EXCLUDED.unit,
        category = EXCLUDED.category,
        flag_direction = EXCLUDED.flag_direction,
        standard_low = EXCLUDED.standard_low,
        standard_high = EXCLUDED.standard_high,
        optimal_low = EXCLUDED.optimal_low,
        optimal_high = EXCLUDED.optimal_high,
        critical_low = EXCLUDED.critical_low,
        critical_high = EXCLUDED.critical_high,
        is_derived = EXCLUDED.is_derived,
        derivation_formula = EXCLUDED.derivation_formula,
        clinical_note = EXCLUDED.clinical_note,
        description = EXCLUDED.description,
        patient_explanation = EXCLUDED.patient_explanation,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        b.slug, b.name, b.abbreviation, b.unit, b.category, b.flagDirection,
        b.standardLow, b.standardHigh, b.optimalLow, b.optimalHigh,
        b.criticalLow, b.criticalHigh, b.isDerived, b.derivationFormula,
        b.clinicalNote, b.description, b.patientExplanation, b.sortOrder, b.isActive,
      ]
    );
  }
  console.log(
    `[migrate] Seeded ${biomarkerSeedData.length} biomarkers in ${Date.now() - startedAt}ms`
  );
}
