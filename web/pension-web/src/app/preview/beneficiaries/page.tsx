"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Menu,
  Search,
  UserCheck,
  UserX,
  Users,
  Clock3,
  LayoutDashboard,
} from "lucide-react";
import { PreviewSidebar } from "@/components/preview/preview-sidebar";
import { usePreviewBeneficiaries } from "@/hooks/use-preview-beneficiaries";
import { useValidationText } from "@/hooks/use-validation-text";
import { searchText } from "@/lib/shared/validators";

const districts = [
  "All Districts",
  "Jaipur",
  "Ajmer",
  "Kota",
  "Jodhpur",
  "Udaipur",
];

const statuses = ["All Status", "Active", "Pending", "Inactive"];

function StatusBadge({
  status,
}: {
  status: "Active" | "Pending" | "Inactive";
}) {
  if (status === "Active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-[#c8102e]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#c8102e]" />
        Active
      </span>
    );
  }

  if (status === "Pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  primary,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <div
      className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        primary
          ? "border-[#c8102e]/20 bg-gradient-to-br from-[#fff4f6] to-white"
          : "border-rose-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>

          <p className="mt-1 text-[11px] text-slate-400">
            {subtitle}
          </p>
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            primary
              ? "bg-[#c8102e] text-white shadow-sm"
              : "bg-rose-50 text-[#c8102e]"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function BeneficiariesPage() {
  const router = useRouter();
  const t = useTranslations("preview");
  const beneficiaries = usePreviewBeneficiaries();
  const validationText = useValidationText();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [district, setDistrict] = useState("All Districts");
  const [status, setStatus] = useState("All Status");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const filteredData = useMemo(() => {
    const query = search.toLowerCase().trim();

    return beneficiaries.filter((item) => {
      const matchesSearch =
        !query ||
        item.id.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.centre.toLowerCase().includes(query);

      const matchesDistrict =
        district === "All Districts" ||
        item.district === district;

      const matchesStatus =
        status === "All Status" ||
        item.status === status;

      return matchesSearch && matchesDistrict && matchesStatus;
    });
  }, [beneficiaries, search, district, status]);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const pageData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, district, status]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (!value) {
      setSearch("");
      setSearchError("");
      return;
    }

    const parsed = searchText.safeParse(value);
    if (!parsed.success) {
      setSearchError(validationText(parsed.error.issues[0]?.message));
      return;
    }
    setSearch(parsed.data);
    setSearchError("");
  };

  return (
    <div className="min-h-screen bg-[#fff8f9] text-slate-900">

      <PreviewSidebar
        mobileOpen={mobileMenu}
        onMobileOpenChange={setMobileMenu}
      />

      {/* Main */}
      <main className="lg:pl-64">

        {/* Header */}
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-rose-100 bg-white/95 px-5 shadow-sm backdrop-blur lg:px-7">

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={t("openMenu")}
              onClick={() => setMobileMenu(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-rose-50 lg:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c8102e]">
                Government of Rajasthan
              </p>

              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
                Chikitsa AIDS Pension Portal
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden h-8 w-px bg-rose-100 sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c8102e] text-sm font-bold text-white">
                A
              </div>

              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  Admin User
                </p>

                <p className="text-[10px] text-slate-400">
                  Administrator
                </p>
              </div>

            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-5 lg:p-7">

          {/* Breadcrumb + Heading */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <LayoutDashboard size={13} />

              <span>Dashboard</span>

              <span>/</span>

              <span className="font-medium text-[#c8102e]">
                Beneficiaries
              </span>
            </div>

            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c8102e]">
                  Beneficiary Management
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Beneficiaries
                </h2>

                <p className="mt-1.5 text-sm text-slate-500">
                  Manage and review registered beneficiary records.
                </p>
              </div>

              <div className="hidden rounded-lg border border-rose-100 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm sm:block">
                <span className="font-semibold text-[#c8102e]">
                  Phase 1
                </span>{" "}
                · Beneficiary Management
              </div>
            </div>
          </div>

          <p role="note" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("demoNotice")}
          </p>

          {/* Statistics */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <StatCard
              title="Total Beneficiaries"
              value={beneficiaries.length.toLocaleString()}
              subtitle="Demo records"
              icon={<Users size={21} />}
              primary
            />

            <StatCard
              title="Active Beneficiaries"
              value={beneficiaries.filter((item) => item.status === "Active").length.toLocaleString()}
              subtitle="Demo records"
              icon={<UserCheck size={21} />}
            />

            <StatCard
              title="Pending Verification"
              value={beneficiaries.filter((item) => item.status === "Pending").length.toLocaleString()}
              subtitle="Demo records"
              icon={<Clock3 size={21} />}
            />

            <StatCard
              title="Inactive Records"
              value={beneficiaries.filter((item) => item.status === "Inactive").length.toLocaleString()}
              subtitle="Demo records"
              icon={<UserX size={21} />}
            />

          </div>

          {/* Beneficiary Records */}
          <section className="mt-6 overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">

            {/* Records Header */}
            <div className="border-b border-rose-100 p-5">

              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Beneficiary Records
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Search, filter and review beneficiary records.
                  </p>
                </div>

              </div>

              {/* Filters */}
              <div className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_auto]">

                <div className="flex h-10 items-center gap-2 rounded-lg border border-rose-100 bg-[#fffafa] px-3">

                  <Search
                    size={17}
                    className="shrink-0 text-slate-400"
                  />

                  <input
                    value={searchInput}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    aria-invalid={!!searchError}
                    aria-describedby={searchError ? "beneficiary-search-error" : undefined}
                  />

                </div>

                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="h-10 rounded-lg border border-rose-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#c8102e] focus:ring-2 focus:ring-[#c8102e]/10"
                >
                  {districts.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-10 rounded-lg border border-rose-100 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#c8102e] focus:ring-2 focus:ring-[#c8102e]/10"
                >
                  {statuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>

              </div>
              {searchError && (
                <p id="beneficiary-search-error" className="mt-2 text-xs text-destructive">
                  {searchError}
                </p>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">

                <thead>
                  <tr className="border-b border-rose-100 bg-[#fff8f9]">

                    {[
                      "Beneficiary",
                      "Gender / Age",
                      "District",
                      "ART Centre",
                      "Registration",
                      "Status",
                      "Action",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className={`px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
                          heading === "Action"
                            ? "text-right"
                            : ""
                        }`}
                      >
                        {heading}
                      </th>
                    ))}

                  </tr>
                </thead>

                <tbody>

                  {pageData.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-rose-50 transition hover:bg-[#fffafb]"
                    >

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">

                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm font-bold text-[#c8102e]">
                            {item.name.charAt(0)}
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {item.name}
                            </p>

                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {item.id}
                            </p>
                          </div>

                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {item.gender}

                        <span className="mx-1.5 text-slate-300">
                          •
                        </span>

                        {item.age} years
                      </td>

                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {item.district}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-700">
                        {item.centre}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {item.registrationDate}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-5 py-4 text-right">

                        <button
                          type="button"
                          title="View beneficiary"
                          aria-label={`View beneficiary ${item.id}`}
                          onClick={() => router.push(`/preview/beneficiaries/${encodeURIComponent(item.id)}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-[#c8102e]"
                        >
                          <Eye size={17} />
                        </button>

                      </td>

                    </tr>
                  ))}

                  {filteredData.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-16 text-center"
                      >

                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
                          <Users
                            size={21}
                            className="text-[#c8102e]"
                          />
                        </div>

                        <p className="mt-3 text-sm font-semibold text-slate-700">
                          No beneficiaries found
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Try changing your search or filters.
                        </p>

                      </td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-rose-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">

              <p className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {filteredData.length === 0 ? 0 : (page - 1) * pageSize + 1}
                  {filteredData.length > 0 && `-${Math.min(page * pageSize, filteredData.length)}`}
                </span>{" "}
                of {filteredData.length} matching demo beneficiaries
              </p>

              <div className="flex items-center gap-1">

                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-rose-100 p-2 text-slate-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    aria-current={pageNumber === page ? "page" : undefined}
                    onClick={() => setPage(pageNumber)}
                    className={`rounded-lg px-3 py-1.5 text-xs transition ${
                      pageNumber === page
                        ? "bg-[#c8102e] font-semibold text-white"
                        : "text-slate-600 hover:bg-rose-50 hover:text-[#c8102e]"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded-lg border border-rose-100 p-2 text-slate-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={15} />
                </button>

              </div>
            </div>

          </section>

          {/* Beneficiary Information */}
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3">

            <p className="text-xs leading-5 text-slate-600">

              <span className="font-semibold text-[#c8102e]">
                Beneficiary Management
              </span>{" "}

              Registered beneficiary records, verification status and associated ART centre details.

            </p>

          </div>

        </div>
      </main>
    </div>
  );
}