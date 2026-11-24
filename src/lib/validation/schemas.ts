import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, { message: min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters` })
    .max(max, { message: `${label} must be at most ${max} characters` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Must be at most ${max} characters` })
    .optional()
    .transform((v) => (v ? v : null));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? (v.startsWith("http") ? v : `https://${v}`) : null))
  .refine((v) => !v || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), { message: "Enter a valid URL" });

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Enter a valid email" });

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^\+?[0-9 ()\-]{7,20}$/.test(v), { message: "Enter a valid phone number" });

const uuid = z.string().uuid({ message: "Invalid selection" });
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^[0-9a-f-]{36}$/i.test(v), { message: "Invalid selection" });

const stringList = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    const arr = Array.isArray(v) ? v : (v ?? "").split(/[,\n]/);
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))).slice(0, 30);
  });

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Enter a valid date" });

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

// ─── Auth ─────────────────────────────────────────────────────────────
export const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(72, { message: "Password is too long" })
  .regex(/[A-Za-z]/, { message: "Include at least one letter" })
  .regex(/[0-9]/, { message: "Include at least one number" });

export const registerSchema = z.object({
  fullName: trimmed(2, 100, "Full name"),
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid work email" }),
  password: passwordSchema,
  acceptTerms: z.literal("on", { message: "You must accept the Terms and Privacy Policy" }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export const emailOnlySchema = z.object({ email: z.string().trim().toLowerCase().email({ message: "Enter a valid email" }) });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

// ─── Profile & onboarding ─────────────────────────────────────────────
export const personalSchema = z.object({
  fullName: trimmed(2, 100, "Full name"),
  designation: trimmed(2, 100, "Designation"),
  phone: optionalPhone,
});

export const companyInfoSchema = z.object({
  name: trimmed(2, 120, "Company name"),
  website: optionalUrl,
  email: optionalEmail,
  phone: optionalPhone,
  yearEstablished: z.coerce
    .number({ message: "Enter a year" })
    .int()
    .min(1800, { message: "Enter a valid year" })
    .max(new Date().getFullYear(), { message: "Year cannot be in the future" })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  companySize: z.enum(COMPANY_SIZES, { message: "Select a company size" }),
  industryId: uuid,
  subIndustryId: optionalUuid,
  registrationCountry: trimmed(2, 80, "Registration country"),
  country: trimmed(2, 80, "Country"),
  state: optionalText(80),
  city: trimmed(2, 80, "City"),
  address: optionalText(300),
});

export const companyDescriptionSchema = z.object({
  shortDescription: trimmed(20, 280, "Short description"),
  overview: trimmed(50, 5000, "Company overview"),
  mission: optionalText(2000),
  capabilities: stringList,
  targetCustomers: optionalText(1000),
  targetMarkets: stringList,
  locationsServed: stringList,
  industriesServed: stringList,
  services: z
    .array(z.object({ name: trimmed(2, 120, "Name"), kind: z.enum(["product", "service"]), description: optionalText(500) }))
    .max(30)
    .default([]),
});

export const preferencesSchema = z
  .object({
    offered: z.array(uuid).max(14).default([]),
    wanted: z.array(uuid).max(14).default([]),
    openToPartnership: z.boolean().default(true),
  })
  .refine((d) => d.offered.length + d.wanted.length > 0, { message: "Select at least one partnership type", path: ["wanted"] });

export const PARTNERSHIP_GOALS = [
  "increase-sales",
  "enter-new-markets",
  "find-new-customers",
  "expand-product-offerings",
  "find-technology-providers",
  "find-distributors",
  "collaborate-on-marketing",
  "share-resources",
  "build-strategic-relationships",
] as const;

export const goalsSchema = z.object({
  goals: z.array(z.enum(PARTNERSHIP_GOALS)).min(1, { message: "Choose at least one goal" }),
});

export const verificationSchema = z.object({
  registrationCountry: trimmed(2, 80, "Registration country"),
  registrationType: trimmed(2, 80, "Registration type"),
  registrationNumber: trimmed(3, 60, "Registration number"),
  taxId: optionalText(40),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "") : null)),
  representativeName: trimmed(2, 100, "Representative name"),
  representativeDesignation: trimmed(2, 100, "Representative designation"),
  representativeEmail: z.string().trim().toLowerCase().email({ message: "Enter a valid email" }),
  representativePhone: optionalPhone,
});

export const privacySchema = z.object({
  show_email: z.boolean(),
  show_phone: z.boolean(),
  show_activity: z.boolean(),
});

export const socialSchema = z.object({
  linkedin: optionalUrl,
  twitter: optionalUrl,
  facebook: optionalUrl,
  instagram: optionalUrl,
  youtube: optionalUrl,
});

// ─── Opportunities ────────────────────────────────────────────────────
export const opportunitySchema = z.object({
  title: trimmed(5, 160, "Title"),
  categoryId: uuid,
  description: trimmed(50, 6000, "Description"),
  requiredCapabilities: stringList,
  preferredIndustryIds: z.array(uuid).max(10).default([]),
  targetLocations: stringList,
  expectedPartnerSize: z
    .enum(COMPANY_SIZES)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  commercialModel: optionalText(500),
  duration: optionalText(120),
  requirements: optionalText(4000),
  benefits: optionalText(4000),
  deadline: optionalDate.refine((v) => !v || new Date(v) >= new Date(new Date().toDateString()), {
    message: "Deadline must be today or later",
  }),
  visibility: z.enum(["public", "members", "verified_only"]),
  publish: z.boolean().default(false),
});

export const applicationSchema = z.object({
  opportunityId: uuid,
  proposal: trimmed(50, 5000, "Proposal"),
  capabilities: optionalText(3000),
});

// ─── Requests ─────────────────────────────────────────────────────────
export const requestSchema = z.object({
  receiverOrganizationId: uuid,
  categoryId: uuid,
  subject: trimmed(5, 160, "Subject"),
  introduction: trimmed(30, 4000, "Introduction"),
  proposedCollaboration: trimmed(30, 4000, "Proposed collaboration"),
  expectedBenefits: optionalText(3000),
  commercialModel: optionalText(1000),
  asDraft: z.boolean().default(false),
});

// ─── Workspace ────────────────────────────────────────────────────────
export const taskSchema = z.object({
  title: trimmed(2, 200, "Title"),
  description: optionalText(4000),
  responsibleOrganizationId: optionalUuid,
  assigneeId: optionalUuid,
  dueDate: optionalDate,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
});

export const milestoneSchema = z.object({
  title: trimmed(2, 200, "Title"),
  description: optionalText(4000),
  targetDate: optionalDate,
  progress: z.coerce.number().int().min(0).max(100).default(0),
  status: z.enum(["planned", "in_progress", "completed", "missed"]).default("planned"),
});

export const DOCUMENT_CATEGORIES = ["general", "legal", "commercial", "marketing", "technical", "financial", "operations"] as const;

export const documentSchema = z.object({
  title: trimmed(2, 200, "Title"),
  category: z.enum(DOCUMENT_CATEGORIES),
  accessLevel: z.enum(["shared", "internal"]),
});

export const agreementSchema = z
  .object({
    title: trimmed(3, 200, "Title"),
    agreementType: trimmed(2, 80, "Agreement type"),
    commercialTerms: optionalText(10000),
    effectiveDate: optionalDate,
    expirationDate: optionalDate,
    renewalDate: optionalDate,
    changeNote: optionalText(500),
  })
  .refine((d) => !d.effectiveDate || !d.expirationDate || d.expirationDate >= d.effectiveDate, {
    message: "Expiration must be after the effective date",
    path: ["expirationDate"],
  });

export const dealSchema = z.object({
  title: trimmed(2, 200, "Deal title"),
  customerName: trimmed(2, 120, "Customer name"),
  customerCompany: optionalText(120),
  customerEmail: optionalEmail,
  ownerOrganizationId: uuid,
  referralSourceOrganizationId: optionalUuid,
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]),
  expectedValue: z.coerce.number().min(0, { message: "Must be positive" }).max(1e12),
  attributedRevenue: z.coerce
    .number()
    .min(0)
    .max(1e12)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  expectedCloseDate: optionalDate,
  notes: optionalText(4000),
});

export const messageSchema = z.object({
  conversationId: uuid,
  body: z.string().trim().min(1, { message: "Message cannot be empty" }).max(8000),
  clientId: z.string().max(64).optional(),
});

// ─── Team ─────────────────────────────────────────────────────────────
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email" }),
  role: z.enum(["admin", "partnership_manager", "member"]),
  permissions: z.array(z.string()).default([]),
});

// ─── Misc ─────────────────────────────────────────────────────────────
export const reportSchema = z.object({
  targetType: z.enum(["organization", "opportunity", "request", "message", "user"]),
  targetId: uuid,
  reason: z.enum(["spam", "fraud", "impersonation", "inappropriate", "misleading", "harassment", "other"]),
  details: optionalText(2000),
});

export const contactSchema = z.object({
  name: trimmed(2, 100, "Name"),
  email: z.string().trim().toLowerCase().email({ message: "Enter a valid email" }),
  company: optionalText(120),
  message: trimmed(10, 3000, "Message"),
  website: z.string().max(0, { message: "Spam detected" }).optional(), // honeypot
});
