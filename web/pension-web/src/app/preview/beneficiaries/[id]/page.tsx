"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Eye,
  EyeOff,
  History,
  IdCard,
  MapPin,
  Menu,
  Phone,
  Save,
  Search,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { PreviewSidebar } from "@/components/preview/preview-sidebar";
import { usePreviewBeneficiaries } from "@/hooks/use-preview-beneficiaries";
import { useValidationText } from "@/hooks/use-validation-text";
import {
  age,
  address,
  CATEGORY_VALUES,
  category,
  personName,
  searchText,
  sex,
} from "@/lib/shared/validators";
import {
  PREVIEW_BENEFICIARIES,
  savePreviewBeneficiary,
  type PreviewBeneficiary,
  type PreviewPaymentStatus,
} from "@/lib/preview/beneficiaries";

function StatusBadge({
  status,
}: {
  status: PreviewBeneficiary["status"];
}) {
  const style = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Inactive: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${style[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function PaymentBadge({
  status,
}: {
  status: PreviewPaymentStatus;
}) {
  const style = {
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Failed: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style[status]}`}
    >
      {status}
    </span>
  );
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>

      <p className="break-words text-sm font-semibold text-slate-800">
        {value || "Not available"}
      </p>
    </div>
  );
}

export default function BeneficiaryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const t = useTranslations("preview");
  const beneficiaries = usePreviewBeneficiaries();
  const validationText = useValidationText();

  const id = params?.id || "PLHIV-00001";
  const record = beneficiaries.find((item) => item.id === id);
  const initialData = record ?? PREVIEW_BENEFICIARIES[0];
  const [localData, setLocalData] = useState(() => ({ id, value: initialData }));
  const beneficiary = localData.id === id ? localData.value : initialData;
  const setBeneficiary = (value: PreviewBeneficiary) => setLocalData({ id, value });

  const [editMode, setEditMode] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const [showAadhaar, setShowAadhaar] = useState(false);
  const [showJanAadhaar, setShowJanAadhaar] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const [activeTab, setActiveTab] =
    useState<"overview" | "payments">("overview");

  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentSearchInput, setPaymentSearchInput] = useState("");
  const [paymentSearchError, setPaymentSearchError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "gender" | "age" | "category" | "address", string>>
  >({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!showAadhaar && !showJanAadhaar && !showAccount) return;
    const timer = window.setTimeout(() => {
      setShowAadhaar(false);
      setShowJanAadhaar(false);
      setShowAccount(false);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [showAadhaar, showJanAadhaar, showAccount]);

  const filteredPayments = useMemo(() => {
    const search = paymentSearch.trim().toLowerCase();

    if (!search) {
      return beneficiary.payments;
    }

    return beneficiary.payments.filter((payment) =>
      `${payment.id} ${payment.month} ${payment.date} ${payment.status} ${payment.reference}`
        .toLowerCase()
        .includes(search)
    );
  }, [beneficiary.payments, paymentSearch]);

  const handleSave = () => {
    const errors: Partial<
      Record<"name" | "gender" | "age" | "category" | "address", string>
    > = {};
    const nameResult = personName.safeParse(beneficiary.name);
    const genderResult = sex.safeParse(beneficiary.gender.toUpperCase());
    const ageResult = age.safeParse(beneficiary.age);
    const categoryResult = category.safeParse(beneficiary.category);
    const addressResult = address.safeParse(beneficiary.address);

    if (!nameResult.success) errors.name = validationText(nameResult.error.issues[0]?.message);
    if (!genderResult.success) errors.gender = validationText(genderResult.error.issues[0]?.message);
    if (!ageResult.success) errors.age = validationText(ageResult.error.issues[0]?.message);
    if (!categoryResult.success) errors.category = validationText(categoryResult.error.issues[0]?.message);
    if (!addressResult.success) errors.address = validationText(addressResult.error.issues[0]?.message);

    setFieldErrors(errors);
    if (
      !nameResult.success ||
      !genderResult.success ||
      !ageResult.success ||
      !categoryResult.success ||
      !addressResult.success
    ) {
      return;
    }

    const validatedBeneficiary = {
      ...beneficiary,
      name: nameResult.data,
      age: ageResult.data,
      category: categoryResult.data,
      address: addressResult.data,
    };
    setBeneficiary(validatedBeneficiary);
    savePreviewBeneficiary(validatedBeneficiary);
    setEditMode(false);
    setMessage(t("saved"));

    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  const handleCancel = () => {
    setBeneficiary(initialData);
    setFieldErrors({});
    setEditMode(false);
  };

  const handlePaymentSearch = (value: string) => {
    setPaymentSearchInput(value);
    if (!value) {
      setPaymentSearch("");
      setPaymentSearchError("");
      return;
    }
    const parsed = searchText.safeParse(value);
    if (!parsed.success) {
      setPaymentSearchError(validationText(parsed.error.issues[0]?.message));
      return;
    }
    setPaymentSearch(parsed.data);
    setPaymentSearchError("");
  };

  const copyValue = async (
    value: string,
    label: string
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t("copied", { label }));

      setTimeout(() => {
        setMessage("");
      }, 2000);
    } catch {
      setMessage(t("copyFailed", { label }));

      setTimeout(() => {
        setMessage("");
      }, 2000);
    }
  };

  if (!record) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">{t("notFoundTitle")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("notFoundText")}</p>
          <button
            type="button"
            onClick={() => router.push("/preview/beneficiaries")}
            className="mt-5 rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white"
          >
            {t("backToList")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <PreviewSidebar mobileOpen={mobileMenu} onMobileOpenChange={setMobileMenu} />

      {/* MAIN */}
      <div className="lg:pl-64">

        {/* HEADER */}
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6">

          <div className="flex items-center gap-3">

            <button
              type="button"
              aria-label={t("openMenu")}
              onClick={() => setMobileMenu(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
            >
              <Menu size={20} />
            </button>

            <div>
              <p className="text-xs font-medium text-slate-500">
                Beneficiary Management
              </p>

              <h1 className="text-lg font-bold text-[#881337] sm:text-xl">
                Beneficiary Details
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#fce7ef] text-[#9F1745] sm:flex">
              <User size={17} />
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">

          <p role="note" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("demoNotice")}
          </p>

          {/* BACK */}
          <button
            type="button"
            onClick={() =>
              router.push("/preview/beneficiaries")
            }
            className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#9F1745] hover:underline"
          >
            <ArrowLeft size={17} />
            Back to Beneficiaries
          </button>

          {/* MESSAGE */}
          {message && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} />
              {message}
            </div>
          )}

          {/* PROFILE */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex items-start gap-4">

                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#fce7ef] text-[#9F1745]">
                  <User size={30} />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                      {beneficiary.name}
                    </h2>

                    <StatusBadge
                      status={beneficiary.status}
                    />
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Beneficiary ID:{" "}
                    <span className="font-semibold text-slate-700">
                      {beneficiary.id}
                    </span>
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">

                    <span className="flex items-center gap-1.5">
                      <MapPin size={15} />
                      {beneficiary.district}
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Building2 size={15} />
                      {beneficiary.centre}
                    </span>

                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={15} />
                      Registered {beneficiary.registrationDate}
                    </span>

                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">

                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#C8102E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a90d27]"
                  >
                    <Edit3 size={16} />
                    Edit Beneficiary
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancel}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <X size={16} />
                      Cancel
                    </button>

                    <button
                      onClick={handleSave}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#C8102E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a90d27]"
                    >
                      <Save size={16} />
                      Save Changes
                    </button>
                  </>
                )}

                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download size={16} />
                  Print
                </button>

              </div>
            </div>
          </section>

          {/* TABS */}
          <div className="mt-6 border-b border-slate-200">

            <div className="flex gap-6">

              <button
                onClick={() => setActiveTab("overview")}
                className={`relative flex items-center gap-2 pb-3 text-sm font-semibold ${
                  activeTab === "overview"
                    ? "text-[#C8102E]"
                    : "text-slate-500"
                }`}
              >
                <IdCard size={17} />
                Beneficiary Information

                {activeTab === "overview" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C8102E]" />
                )}
              </button>

              <button
                onClick={() => setActiveTab("payments")}
                className={`relative flex items-center gap-2 pb-3 text-sm font-semibold ${
                  activeTab === "payments"
                    ? "text-[#C8102E]"
                    : "text-slate-500"
                }`}
              >
                <History size={17} />
                Payment History

                {activeTab === "payments" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C8102E]" />
                )}
              </button>

            </div>
          </div>

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="mt-6 space-y-6">

              {/* BASIC INFORMATION */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <User size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Basic Information
                    </h3>
                    <p className="text-xs text-slate-500">
                      Personal and registration details
                    </p>
                  </div>

                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">

                  {editMode ? (
                    <>
                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Beneficiary Name
                        </span>

                        <input
                          id="beneficiary-name"
                          value={beneficiary.name}
                          onChange={(e) =>
                            {
                              setBeneficiary({ ...beneficiary, name: e.target.value });
                              setFieldErrors((current) => ({ ...current, name: undefined }));
                            }
                          }
                          aria-invalid={!!fieldErrors.name}
                          aria-describedby={fieldErrors.name ? "beneficiary-name-error" : undefined}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#C8102E]"
                        />
                        {fieldErrors.name && (
                          <span id="beneficiary-name-error" className="mt-1 block text-xs text-destructive">
                            {fieldErrors.name}
                          </span>
                        )}
                      </label>

                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Gender
                        </span>

                        <select
                          value={beneficiary.gender}
                          onChange={(e) => {
                            const parsed = sex.safeParse(e.target.value.toUpperCase());
                            if (!parsed.success) return;
                            const gender = parsed.data === "MALE"
                              ? "Male"
                              : parsed.data === "FEMALE"
                                ? "Female"
                                : "Transgender";
                            setBeneficiary({ ...beneficiary, gender });
                            setFieldErrors((current) => ({ ...current, gender: undefined }));
                          }}
                          aria-invalid={!!fieldErrors.gender}
                          aria-describedby={fieldErrors.gender ? "beneficiary-gender-error" : undefined}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C8102E]"
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Transgender">Transgender</option>
                        </select>
                        {fieldErrors.gender && (
                          <span id="beneficiary-gender-error" className="mt-1 block text-xs text-destructive">
                            {fieldErrors.gender}
                          </span>
                        )}
                      </label>

                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Age
                        </span>

                        <input
                          type="number"
                          value={beneficiary.age}
                          min={0}
                          max={120}
                          step={1}
                          onChange={(e) =>
                            {
                              setBeneficiary({ ...beneficiary, age: Number(e.target.value) });
                              setFieldErrors((current) => ({ ...current, age: undefined }));
                            }
                          }
                          aria-invalid={!!fieldErrors.age}
                          aria-describedby={fieldErrors.age ? "beneficiary-age-error" : undefined}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#C8102E]"
                        />
                        {fieldErrors.age && (
                          <span id="beneficiary-age-error" className="mt-1 block text-xs text-destructive">
                            {fieldErrors.age}
                          </span>
                        )}
                      </label>

                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Category
                        </span>

                        <select
                          value={beneficiary.category}
                          onChange={(e) => {
                            const parsed = category.safeParse(e.target.value);
                            if (!parsed.success) return;
                            setBeneficiary({ ...beneficiary, category: parsed.data });
                            setFieldErrors((current) => ({ ...current, category: undefined }));
                          }}
                          aria-invalid={!!fieldErrors.category}
                          aria-describedby={fieldErrors.category ? "beneficiary-category-error" : undefined}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C8102E]"
                        >
                          {CATEGORY_VALUES.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                        {fieldErrors.category && (
                          <span id="beneficiary-category-error" className="mt-1 block text-xs text-destructive">
                            {fieldErrors.category}
                          </span>
                        )}
                      </label>
                    </>
                  ) : (
                    <>
                      <InfoCard
                        label="Beneficiary Name"
                        value={beneficiary.name}
                        icon={<User size={14} />}
                      />

                      <InfoCard
                        label="Gender"
                        value={beneficiary.gender}
                        icon={<Users size={14} />}
                      />

                      <InfoCard
                        label="Age"
                        value={`${beneficiary.age} Years`}
                        icon={<CalendarDays size={14} />}
                      />

                      <InfoCard
                        label="Category"
                        value={beneficiary.category}
                        icon={<BadgeCheck size={14} />}
                      />
                    </>
                  )}

                </div>
              </section>

              {/* LOCATION */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <MapPin size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Location & ART Centre
                    </h3>
                    <p className="text-xs text-slate-500">
                      District and centre association
                    </p>
                  </div>

                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">

                  <InfoCard
                    label="District"
                    value={beneficiary.district}
                    icon={<MapPin size={14} />}
                  />

                  <InfoCard
                    label="ART Centre"
                    value={beneficiary.centre}
                    icon={<Building2 size={14} />}
                  />

                  <InfoCard
                    label="Registration Date"
                    value={beneficiary.registrationDate}
                    icon={<CalendarDays size={14} />}
                  />

                  <div className="sm:col-span-2 lg:col-span-3">

                    {editMode ? (
                      <label>
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Complete Address
                        </span>

                        <textarea
                          id="beneficiary-address"
                          rows={3}
                          value={beneficiary.address}
                          onChange={(e) =>
                            {
                              setBeneficiary({ ...beneficiary, address: e.target.value });
                              setFieldErrors((current) => ({ ...current, address: undefined }));
                            }
                          }
                          aria-invalid={!!fieldErrors.address}
                          aria-describedby={fieldErrors.address ? "beneficiary-address-error" : undefined}
                          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#C8102E]"
                        />
                        {fieldErrors.address && (
                          <span id="beneficiary-address-error" className="mt-1 block text-xs text-destructive">
                            {fieldErrors.address}
                          </span>
                        )}
                      </label>
                    ) : (
                      <InfoCard
                        label="Complete Address"
                        value={beneficiary.address}
                        icon={<MapPin size={14} />}
                      />
                    )}

                  </div>
                </div>
              </section>

              {/* CONTACT */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <Phone size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Contact Information
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registered contact details
                    </p>
                  </div>

                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">

                  <InfoCard
                    label="Mobile Number"
                    value={beneficiary.mobile}
                    icon={<Phone size={14} />}
                  />

                  <InfoCard
                    label="Beneficiary ID"
                    value={beneficiary.id}
                    icon={<IdCard size={14} />}
                  />

                </div>
              </section>

              {/* IDENTITY */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <ShieldCheck size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Identity Information
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sensitive identifiers are masked by default
                    </p>
                  </div>

                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">

                  {/* AADHAAR */}
                  <div className="rounded-xl border border-slate-200 p-4">

                    <div className="mb-2 flex items-center justify-between">

                      <span className="text-xs font-medium text-slate-500">
                        Aadhaar Number
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setShowAadhaar(!showAadhaar)
                        }
                        aria-label={showAadhaar ? t("hideAadhaar") : t("showAadhaar")}
                        aria-pressed={showAadhaar}
                        className="rounded-md p-1.5 text-[#9F1745] hover:bg-[#fce7ef]"
                      >
                        {showAadhaar ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>

                    </div>

                    <p className="text-sm font-semibold tracking-wide text-slate-800">
                      {showAadhaar
                        ? beneficiary.aadhaar
                        : "XXXX XXXX XXXX"}
                    </p>

                  </div>

                  {/* JAN AADHAAR */}
                  <div className="rounded-xl border border-slate-200 p-4">

                    <div className="mb-2 flex items-center justify-between">

                      <span className="text-xs font-medium text-slate-500">
                        Jan Aadhaar
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setShowJanAadhaar(!showJanAadhaar)
                        }
                        aria-label={showJanAadhaar ? t("hideJanAadhaar") : t("showJanAadhaar")}
                        aria-pressed={showJanAadhaar}
                        className="rounded-md p-1.5 text-[#9F1745] hover:bg-[#fce7ef]"
                      >
                        {showJanAadhaar ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>

                    </div>

                    <p className="text-sm font-semibold tracking-wide text-slate-800">
                      {showJanAadhaar
                        ? beneficiary.janAadhaar
                        : "XXXX XXXX XXXX"}
                    </p>

                  </div>

                  {/* VERIFICATION */}
                  <div className="rounded-xl border border-slate-200 p-4">

                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                      <BadgeCheck size={14} />
                      Verification Status
                    </div>

                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 size={16} />
                      Verified
                    </p>

                  </div>

                </div>
              </section>

              {/* BANK */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <CreditCard size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Bank Details
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sensitive banking information
                    </p>
                  </div>

                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">

                  <InfoCard
                    label="Bank Name"
                    value={beneficiary.bankName}
                    icon={<Building2 size={14} />}
                  />

                  <div className="rounded-xl border border-slate-200 p-4">

                    <div className="mb-2 flex items-center justify-between">

                      <span className="text-xs font-medium text-slate-500">
                        Bank Account Number
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setShowAccount(!showAccount)
                        }
                        aria-label={showAccount ? t("hideAccount") : t("showAccount")}
                        aria-pressed={showAccount}
                        className="rounded-md p-1.5 text-[#9F1745] hover:bg-[#fce7ef]"
                      >
                        {showAccount ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>

                    </div>

                    <p className="text-sm font-semibold tracking-wide text-slate-800">
                      {showAccount
                        ? beneficiary.accountNumber
                        : "XXXXXXXXXX"}
                    </p>

                  </div>

                  <InfoCard
                    label="IFSC Code"
                    value={beneficiary.ifsc}
                    icon={<CreditCard size={14} />}
                  />

                </div>
              </section>

            </div>
          )}

          {/* PAYMENT HISTORY */}
          {activeTab === "payments" && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">

              <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">

                <div className="flex items-center gap-3">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fce7ef] text-[#9F1745]">
                    <History size={18} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Payment History
                    </h3>

                    <p className="text-xs text-slate-500">
                      Beneficiary payment records
                    </p>
                  </div>

                </div>

                <div className="relative w-full sm:w-72">

                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={paymentSearchInput}
                    onChange={(e) => handlePaymentSearch(e.target.value)}
                    placeholder="Search payment history..."
                    aria-invalid={!!paymentSearchError}
                    aria-describedby={paymentSearchError ? "payment-search-error" : undefined}
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C8102E]"
                  />

                </div>
              </div>
              {paymentSearchError && (
                <p id="payment-search-error" className="border-b border-slate-100 px-5 py-2 text-xs text-destructive sm:px-6">
                  {paymentSearchError}
                </p>
              )}

              {filteredPayments.length > 0 ? (
                <div className="overflow-x-auto">

                  <table className="w-full min-w-[750px] text-left">

                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Payment ID
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Month
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Date
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Amount
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </th>

                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Reference
                        </th>

                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">

                      {filteredPayments.map((payment) => (
                        <tr
                          key={payment.id}
                          className="hover:bg-slate-50"
                        >

                          <td className="px-5 py-4 text-sm font-semibold text-[#9F1745]">
                            {payment.id}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {payment.month}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {payment.date}
                          </td>

                          <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                            {payment.amount}
                          </td>

                          <td className="px-5 py-4">
                            <PaymentBadge
                              status={payment.status}
                            />
                          </td>

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-2">

                              <span className="text-sm text-slate-600">
                                {payment.reference}
                              </span>

                              {payment.reference !== "Not available" && (
                                <button
                                  onClick={() =>
                                    copyValue(
                                      payment.reference,
                                      "Transaction reference"
                                    )
                                  }
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#9F1745]"
                                  title="Copy reference"
                                >
                                  <Copy size={14} />
                                </button>
                              )}

                            </div>

                          </td>

                        </tr>
                      ))}

                    </tbody>
                  </table>

                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">

                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <History size={25} />
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-800">
                    No payment records found
                  </h4>

                  <p className="mt-1 text-sm text-slate-500">
                    No payment records match your search.
                  </p>

                </div>
              )}

            </section>
          )}

          {/* FOOTER INFO */}
          <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3">
            <p className="text-xs leading-5 text-slate-600">
              <span className="font-semibold text-[#c8102e]">
                Beneficiary Management
              </span>{" "}
              Registered beneficiary records, verification status and associated ART centre details.
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}