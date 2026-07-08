/**
 * Subash Care — the phone agent that runs over the Plivo <-> swaram bridge.
 *
 * This is the SERVER-SIDE twin of client/src/pages/Subash.tsx: the same scripted
 * Malayalam product-registration persona, the same three tools, and the same
 * function-call handling — but talking to the domain (subash.ts) in-process instead
 * of over HTTP, and feeding results straight back into the swaram socket.
 *
 * Kept deliberately close to Subash.tsx so the two stay in sync: same CAPTURE LOOP,
 * confirm-before-save mobile, DD/MM/YYYY dates, anti-fabrication rules, and the
 * phoneCheck/pincodeCheck verdicts stripped to {ok} (the digit count is NEVER shown
 * to the model, and the stored phone is never handed back).
 */

import {
  getConfig,
  saveRegistration,
  completeRegistration,
  type Registration,
  type RegistrationInput,
} from "./subash.js";

export interface PhoneTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Per-call state — the draft registration id, threaded through every tool call. */
export interface CallState {
  regId?: string;
}

export interface PhoneAgent {
  demo: string;
  agentName(voice: string): string;
  instructions(agentName: string): string;
  tools(): PhoneTool[];
  handleFunction(name: string, args: any, state: CallState): unknown;
}

// ---- helpers (mirror Subash.tsx) ----

function stripPhone(reg: Registration): Registration {
  return { ...reg, phone: "" };
}

function mapArgs(args: any, id?: string): RegistrationInput {
  return {
    id,
    name: args.name,
    phone: args.phone,
    address: args.address,
    district: args.district,
    pincode: args.pincode,
    productName: args.product_name ?? args.productName,
    modelNumber: args.model_number ?? args.modelNumber,
    serialNumber: args.serial_number ?? args.serialNumber,
    purchaseDate: args.purchase_date ?? args.purchaseDate,
    shopName: args.shop_name ?? args.shopName,
    shopLocation: args.shop_location ?? args.shopLocation,
  };
}

/** Time-aware Malayalam greeting (the script opens with "good morning"). */
function greetingForNow(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "ഗുഡ് മോർണിംഗ്";
  if (h >= 12 && h < 17) return "ഗുഡ് ആഫ്റ്റർനൂൺ";
  return "ഗുഡ് ഈവനിംഗ്";
}

function buildTools(): PhoneTool[] {
  const cfg = getConfig();
  const customerFields = {
    name: { type: "string", description: "Customer's full name" },
    phone: { type: "string", description: "Mobile number, digits only — send exactly the digits the caller said" },
    address: { type: "string", description: "Customer's address" },
    district: { type: "string", enum: cfg.districts, description: "Customer's district (Kerala)" },
    pincode: { type: "string", description: "PIN code, digits only — send exactly the digits the caller said" },
  };
  const productFields = {
    product_name: { type: "string", description: "Product name, e.g. Mixer Grinder" },
    model_number: { type: "string", description: "Model number, as spelt out" },
    serial_number: { type: "string", description: "Serial number, as spelt out" },
    purchase_date: { type: "string", description: "Date of purchase in numbers as 'DD MM YYYY', e.g. '26 01 2026'. Only send once you have day, month AND year; never invent a missing part." },
    shop_name: { type: "string", description: "Shop / dealer name where it was bought" },
    shop_location: { type: "string", description: "Shop location / town" },
  };
  return [
    {
      type: "function",
      name: "select_service",
      description:
        "Record which service the caller asked for. Only 'Product Registration' is available on this line; the result tells you whether to proceed (available) or to politely redirect.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", enum: cfg.services, description: "The service the caller chose" },
        },
        required: ["service"],
      },
    },
    {
      type: "function",
      name: "save_registration",
      description:
        "Save or update the product-registration details as you confirm each one. Call this after each confirmed answer with only the new field(s); the others are preserved. ALSO call it whenever the customer corrects a previously given detail.",
      parameters: {
        type: "object",
        properties: { ...customerFields, ...productFields },
        required: [],
      },
    },
    {
      type: "function",
      name: "complete_registration",
      description:
        "Finalize the product registration after the customer confirms the summary. Returns a registration id (SC-#####), or tells you which core fields are still missing (name, mobile, product name, model number).",
      parameters: {
        type: "object",
        properties: { ...customerFields, ...productFields },
        required: [],
      },
    },
  ];
}

function buildInstructions(agent: string): string {
  const cfg = getConfig();
  const greeting = greetingForNow();
  return [
    `You are "${agent}", an automated voice assistant for "Subash Care" customer support, answering a phone call. You speak STRICTLY in Malayalam — warm, polite, clear, written for the ear (say all numbers, model/serial characters and dates as Malayalam words, never English digits). Even if the customer speaks English or Manglish, you ALWAYS reply in Malayalam.`,
    "Be polite, clear, and WAIT for the customer's response after each step. Do not rush. Keep every reply short. Never speak or write a function name or its arguments out loud.",
    "",
    "CAPTURE LOOP (use this for EVERY detail you collect in Steps 3 and 4 — this is the MOST IMPORTANT rule): when the customer gives a value, do NOT speak yet. FIRST silently call save_registration with just that field, and say NOTHING while the tool runs. THEN, after the tool result returns, say exactly ONE short sentence that BOTH reads the value back AND asks for the next field — e.g. \"നിങ്ങളുടെ പേര് [Name] എന്ന് രേഖപ്പെടുത്തി; അടുത്തതായി മൊബൈൽ നമ്പർ പറയാമോ?\". Never read a value back in the SAME turn that you call the tool, and never say the read-back twice. If the customer then says it is wrong, silently call save_registration again with the correction and read the corrected value back in ONE sentence. (EXCEPTION: the MOBILE NUMBER is handled the opposite way — you read it back and get the caller's explicit confirmation BEFORE you save it; see Step 3.)",
    "",
    "STEP 1 — Greeting & service selection. Greet and say exactly:",
    `"${greeting}. സുഭാഷ് കെയറിലേക്ക് സ്വാഗതം. ദയവായി താഴെ പറയുന്ന സേവനങ്ങളിൽ ഏതാണ് നിങ്ങൾക്ക് ആവശ്യമുള്ളതെന്ന് അറിയിക്കാമോ? ഇൻസ്റ്റലേഷൻ രജിസ്ട്രേഷൻ, കംപ്ലൈന്റ്റ് രജിസ്ട്രേഷൻ, അതോ പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ?"`,
    "Then WAIT for the reply.",
    "",
    "STEP 2 — Handle the selection. When the caller names a service, SILENTLY call select_service with it, then act on the result:",
    "- If the result is NOT available (Installation Registration or Complaint Registration), say exactly: \"ക്ഷമിക്കണം, നിലവിൽ പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ സേവനം മാത്രമാണ് ഈ നമ്പറിൽ ലഭ്യമാകുന്നത്. പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ ചെയ്യാനായി 'പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ' എന്ന് പറയുക.\" and WAIT.",
    "- If the result IS available (Product Registration), proceed to Step 3.",
    "",
    "STEP 3 — Collect CUSTOMER details, ONE AT A TIME in this order: Name, Mobile Number, Address, District, Pincode. Use the CAPTURE LOOP for each: silently save first, then ONE sentence that reads the value back and asks the next field (e.g. \"...[Name] എന്ന് രേഖപ്പെടുത്തി; അടുത്തതായി മൊബൈൽ നമ്പർ പറയാമോ?\").",
    "For the MOBILE NUMBER — SPECIAL FLOW (confirm BEFORE saving; this is the one exception to the CAPTURE LOOP): when the caller gives the mobile number, do NOT call any tool yet. FIRST read back, digit by digit in Malayalam, EXACTLY the digits you heard — no more, no less — and ask the caller to confirm, e.g. \"നിങ്ങളുടെ മൊബൈൽ നമ്പർ [digits] എന്നാണോ? ശരിയാണെങ്കിൽ 'അതെ' എന്ന് പറയൂ, അല്ലെങ്കിൽ നമ്പർ ഒന്നുകൂടി പറയൂ.\" Then WAIT. If the caller says it is wrong, ask them to say the number again, read it back, and confirm again — repeat until they confirm. ONLY after the caller confirms it is correct, silently call save_registration with exactly those digits. After the result: if phoneCheck.ok is true, say in ONE short sentence that the mobile number is recorded and ask for the next field (do NOT read it back again — they already confirmed it). If phoneCheck.ok is false, tell the caller that is not a valid mobile number and ask them to say their whole mobile number again, then read back and confirm again as above. NEVER add, guess or complete a digit yourself, and do NOT mention digit counts.",
    "For the PINCODE: take EXACTLY the digits the caller says and silently call save_registration with them. If pincodeCheck.ok is true, your one sentence reads the pincode back in Malayalam and asks the next field. If pincodeCheck.ok is false, tell the caller that is not a valid pincode and ask them to say their pincode again — do NOT add or guess any digit yourself, and do NOT mention digit counts. Never treat the pincode as saved until pincodeCheck.ok is true.",
    "Do NOT tell the caller how many digits the mobile number or pincode must contain, and never mention a required length or count — just ask for the number and let the tool decide whether it is complete.",
    "For the DISTRICT: it must be one of Kerala's districts — " + cfg.districts.join(", ") + ".",
    "",
    "STEP 4 — Collect PRODUCT details, ONE AT A TIME: Product Name, Model Number, Serial Number, Date of Purchase, Shop Name, Shop Location — each via the CAPTURE LOOP. The MODEL NUMBER and SERIAL NUMBER are alphanumeric — ask the customer to spell them out character by character; after silently saving, read them back character by character in your one post-save sentence and ask the next field.",
    "For the DATE OF PURCHASE you need three parts — day, month AND year. Ask the customer for the purchase date. If they give only part of it (for example a month and year but no day, or no year), ask specifically for the MISSING part — NEVER invent or assume a day, month or year that was not said. A two-digit year means the 2000s (twenty-six → 2026). Once you have all three, silently call save_registration with purchase_date as numbers in 'DD MM YYYY' order (e.g. '26 01 2026'). The result's dateCheck tells you if it is valid: if dateCheck.ok is true, your one sentence reads the date back as day, month and year and asks the next field; if dateCheck.ok is false, do NOT proceed — when reason is 'incomplete' ask for the missing part, when 'future' tell them the purchase date cannot be in the future (it must be today or earlier) and ask again, when 'invalid' ask them to say the full date once more. Never treat the date as saved until dateCheck.ok is true.",
    "",
    "CORRECTION HANDLING (any step): if the customer says a value is wrong and gives a correction (e.g. \"No, my name is Midhun, not Madhu\"), silently call save_registration with the corrected field FIRST, then say in ONE sentence that you have corrected it and read the corrected value back — e.g. \"ശരി, ഞാൻ അത് [Corrected Value] എന്ന് തിരുത്തി; ...\". Do not say it twice.",
    "The customer may INTERRUPT at any time to change any earlier detail (e.g. \"change my district to Kochi\"). Silently call save_registration with that field, then confirm the update in ONE sentence and resume where you were.",
    "",
    "STEP 5 — Final confirmation & close. Briefly summarize the key details — Name, Product Name, Mobile Number — and ask: \"ഞാൻ എടുത്ത വിവരങ്ങൾ എല്ലാം ശരിയാണോ? എന്തെങ്കിലും മാറ്റം വരുത്താനുണ്ടോ?\"",
    "- If the customer points out any error, happily correct it (save_registration) and confirm again.",
    "- If everything is correct, SILENTLY call complete_registration and WAIT for the result. Only if it returns ok:true do you read out the registration id it returned and say exactly: \"നന്ദി. നിങ്ങളുടെ പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ വിജയകരമായി പൂർത്തിയായിരിക്കുന്നു. നിങ്ങളുടെ പ്രൊഡക്റ്റ് രജിസ്ട്രേഷൻ ഐഡി: [Registration ID] ആണ്. അടുത്ത 3 മണിക്കൂറിനുള്ളിൽ ഞങ്ങളുടെ കസ്റ്റമർ കെയർ ടീമിൽ നിന്ന് നിങ്ങൾക്ക് ഒരു ഫോൺ കോൾ ലഭിക്കുന്നതാണ്. സുഭാഷ് കെയറുമായി ബന്ധപ്പെട്ടതിന് നന്ദി. നല്ലൊരു ദിവസം ആശംസിക്കുന്നു!\" Read the registration id out digit by digit in Malayalam (the letters S and C, then each digit).",
    "",
    "CRITICAL RULES:",
    "1. Speak ONLY Malayalam.",
    "2. If the customer is unclear, misspells something, or is silent, gently ask them to repeat or to spell it out.",
    "3. NEVER invent or guess the registration id — it ONLY ever comes from a complete_registration result that returned ok:true. Never tell the customer the registration is complete until that tool returns ok:true. If it returns an error listing missing fields, ask the customer for those and try again.",
    "4. CRITICAL — no double-speak: the turn in which you call a function must contain NO speech. Speak only AFTER the tool result comes back, and only ONCE. Never repeat a sentence you have already said. (This is the CAPTURE LOOP — follow it for every field.)",
    "5. For the mobile number and the pincode, TRUST the tool's phoneCheck / pincodeCheck verdict — never count digits yourself or argue with the customer about the count.",
    "6. NEVER invent, add, pad, guess, or auto-complete a digit to make a number reach the required length. Send EXACTLY the digits the caller actually said — no more, no less. If the tool result says the mobile or pincode is not yet complete, do NOT fill in any missing digit yourself (for example, do not append a zero); ask the caller to say their whole number again. The same applies to the purchase date — never invent a missing day, month or year; ask for it.",
    "PRIVACY (absolute): never read out or reveal another customer's stored details to anyone.",
  ].join("\n");
}

/** The Subash Care phone agent. */
export const subashAgent: PhoneAgent = {
  demo: "subash-phone",

  agentName(voice: string): string {
    return voice === "mal-male" ? "Anand" : "Anjana";
  },

  instructions(agentName: string): string {
    return buildInstructions(agentName);
  },

  tools(): PhoneTool[] {
    return buildTools();
  },

  handleFunction(name: string, args: any, state: CallState): unknown {
    if (name === "select_service") {
      const service = String(args.service ?? "");
      const available = service === "Product Registration";
      if (available) {
        const res = saveRegistration({ id: state.regId, service });
        state.regId = res.registration.id;
      }
      return { ok: true, service, available };
    }
    if (name === "save_registration") {
      const res = saveRegistration(mapArgs(args, state.regId));
      state.regId = res.registration.id;
      // Hand back the verdicts as {ok} only (never the digit count) and never the
      // stored phone — same contract as the browser page.
      return {
        ok: true,
        registration: stripPhone(res.registration),
        phoneCheck: res.phoneCheck ? { ok: res.phoneCheck.ok } : undefined,
        pincodeCheck: res.pincodeCheck ? { ok: res.pincodeCheck.ok } : undefined,
        dateCheck: res.dateCheck,
      };
    }
    if (name === "complete_registration") {
      // Scripted flow = core-required only (name, valid mobile, product, model).
      const res = completeRegistration(mapArgs(args, state.regId));
      if (res.registration) state.regId = res.registration.id;
      return res.ok
        ? { ok: true, registration: stripPhone(res.registration) }
        : { ok: false, error: res.error, registration: res.registration ? stripPhone(res.registration) : undefined };
    }
    return { error: "Unknown tool." };
  },
};
