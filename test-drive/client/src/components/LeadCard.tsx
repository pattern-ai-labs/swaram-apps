import type { Lead, TestDrive } from "../lib/testdriveApi";

const FIELDS = [
  "name",
  "phone",
  "city",
  "interestedModels",
  "budget",
  "fuel",
  "transmission",
  "timeline",
  "exchange",
  "finance",
] as const;

function val(l: Partial<Lead>, k: (typeof FIELDS)[number]): string {
  if (k === "interestedModels") return (l.interestedModels ?? []).join(", ");
  return (l[k] as string) ?? "";
}

function temperature(timeline?: string): { label: string; cls: string } | null {
  if (timeline === "This month") return { label: "🔥 Hot", cls: "hot" };
  if (timeline === "1–3 months") return { label: "Warm", cls: "warm" };
  if (timeline === "Just exploring") return { label: "Cold", cls: "cold" };
  return null;
}

/** A value cell: empty placeholder, chips for models, or a pill for enum fields. */
function Value({ field, value }: { field: string; value: string }) {
  if (!value.trim()) return <span className="ld-empty">—</span>;
  if (field === "interestedModels") {
    return (
      <span className="ld-chips">
        {value.split(", ").map((m) => (
          <span key={m} className="ld-chip">
            {m}
          </span>
        ))}
      </span>
    );
  }
  const pillFields = ["budget", "fuel", "transmission", "timeline", "finance"];
  if (pillFields.includes(field)) return <span className="ld-pill">{value}</span>;
  return <span className="ld-text">{value}</span>;
}

export default function LeadCard({
  lead,
  testDrive,
}: {
  lead: Partial<Lead> | null;
  testDrive: (TestDrive & { dealershipName?: string }) | null;
}) {
  const l = lead ?? {};
  const captured = FIELDS.filter((k) => val(l, k).trim()).length;
  const pct = Math.round((captured / FIELDS.length) * 100);
  const temp = temperature(l.timeline);
  const initials =
    (l.name ?? "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  const rows: { label: string; field: (typeof FIELDS)[number]; group: string }[] = [
    { group: "Contact", label: "Name", field: "name" },
    { group: "Contact", label: "Phone", field: "phone" },
    { group: "Contact", label: "City", field: "city" },
    { group: "Requirement", label: "Interested in", field: "interestedModels" },
    { group: "Requirement", label: "Budget", field: "budget" },
    { group: "Requirement", label: "Fuel", field: "fuel" },
    { group: "Requirement", label: "Transmission", field: "transmission" },
    { group: "Qualification", label: "Timeline", field: "timeline" },
    { group: "Qualification", label: "Exchange", field: "exchange" },
    { group: "Qualification", label: "Finance", field: "finance" },
  ];

  let lastGroup = "";

  return (
    <div className="ld">
      <div className="ld-head">
        <div className="ld-avatar">{initials}</div>
        <div className="ld-id">
          <div className="ld-name">{(l.name ?? "").trim() || "New lead"}</div>
          <div className="ld-sub">{(l.city ?? "").trim() || "qualifying…"}</div>
        </div>
        {temp && <span className={`ld-temp ${temp.cls}`}>{temp.label}</span>}
      </div>

      <div className="ld-progress">
        <div className="ld-progress-track">
          <div className="ld-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ld-progress-num">{captured}/{FIELDS.length}</span>
      </div>

      <table className="ld-table">
        <tbody>
          {rows.flatMap((r) => {
            const out = [];
            if (r.group !== lastGroup) {
              lastGroup = r.group;
              out.push(
                <tr key={`g-${r.group}`} className="ld-grouprow">
                  <td colSpan={2}>{r.group}</td>
                </tr>
              );
            }
            const v = val(l, r.field);
            out.push(
              <tr key={r.field} className={v.trim() ? "filled" : ""}>
                <td className="ld-k">{r.label}</td>
                <td className="ld-v">
                  <Value field={r.field} value={v} />
                </td>
              </tr>
            );
            return out;
          })}
        </tbody>
      </table>

      {testDrive && (
        <div className="ld-booked">
          <div className="ld-booked-head">🚗 Test drive booked</div>
          <div className="ld-booked-grid">
            <div>
              <span>Model</span>
              <strong>{testDrive.carModel}</strong>
            </div>
            <div>
              <span>Dealership</span>
              <strong>{testDrive.dealershipName ?? testDrive.dealershipId}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{testDrive.date}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{testDrive.time}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
