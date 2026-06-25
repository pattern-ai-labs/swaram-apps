import type { Ticket } from "../lib/supportApi";

const ICONS: Record<string, string> = {
  TV: "📺",
  Refrigerator: "🧊",
  AC: "❄️",
  "Washing Machine": "🌀",
};

const FIELDS = [
  "appliance",
  "requestType",
  "issue",
  "warranty",
  "preferredDate",
  "preferredTime",
  "area",
  "address",
  "name",
  "phone",
] as const;

const PILL_FIELDS = ["requestType", "warranty", "preferredTime", "area"];

function Value({ field, value }: { field: string; value: string }) {
  if (!value.trim()) return <span className="ld-empty">—</span>;
  if (field === "appliance") {
    return (
      <span className="ld-chips">
        <span className="ld-chip">{value}</span>
      </span>
    );
  }
  if (PILL_FIELDS.includes(field)) return <span className="ld-pill">{value}</span>;
  return <span className="ld-text">{value}</span>;
}

function TicketTable({ t }: { t: Partial<Ticket> }) {
  const rows: { label: string; field: (typeof FIELDS)[number]; group: string }[] = [
    { group: "Request", label: "Appliance", field: "appliance" },
    { group: "Request", label: "Type", field: "requestType" },
    { group: "Request", label: "Issue", field: "issue" },
    { group: "Request", label: "Warranty", field: "warranty" },
    { group: "Schedule", label: "Preferred date", field: "preferredDate" },
    { group: "Schedule", label: "Preferred time", field: "preferredTime" },
    { group: "Schedule", label: "Area", field: "area" },
    { group: "Schedule", label: "Address", field: "address" },
    { group: "Contact", label: "Name", field: "name" },
    { group: "Contact", label: "Phone", field: "phone" },
  ];
  let lastGroup = "";
  return (
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
          const v = (r.field === "appliance" ? t.appliance : (t as any)[r.field]) ?? "";
          out.push(
            <tr key={r.field} className={String(v).trim() ? "filled" : ""}>
              <td className="ld-k">{r.label}</td>
              <td className="ld-v">
                <Value field={r.field} value={String(v)} />
              </td>
            </tr>
          );
          return out;
        })}
      </tbody>
    </table>
  );
}

export default function TicketCard({
  ticket,
  recent,
}: {
  ticket: Partial<Ticket> | null;
  recent: Ticket[];
}) {
  const t = ticket ?? {};
  const captured = FIELDS.filter((k) => String((t as any)[k] ?? "").trim()).length;
  const pct = Math.round((captured / FIELDS.length) * 100);
  const scheduled = t.status === "Scheduled";
  const icon = ICONS[t.appliance ?? ""] ?? "🛠️";

  return (
    <div className="ld">
      <div className="ld-head">
        <div className="ld-avatar">{icon}</div>
        <div className="ld-id">
          <div className="ld-name">{t.ref || "New request"}</div>
          <div className="ld-sub">{(t.requestType || "logging…") as string}</div>
        </div>
        <span className={`tk-status ${scheduled ? "scheduled" : "draft"}`}>
          {scheduled ? "✓ Scheduled" : "Draft"}
        </span>
      </div>

      <div className="ld-progress">
        <div className="ld-progress-track">
          <div className="ld-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ld-progress-num">{captured}/{FIELDS.length}</span>
      </div>

      <TicketTable t={t} />

      {recent.length > 0 && (
        <div className="sq">
          <div className="sq-title">Recent tickets</div>
          {recent.slice(0, 6).map((r) => (
            <div key={r.id} className="sq-row">
              <span className="sq-icon">{ICONS[r.appliance] ?? "🛠️"}</span>
              <span className="sq-ref">{r.ref}</span>
              <span className="sq-main">
                {r.appliance} · {r.requestType}
                {r.name ? ` · ${r.name.split(" ")[0]}` : ""}
              </span>
              <span className="sq-when">
                {r.preferredDate}
                {r.preferredTime ? ` · ${r.preferredTime.split(" ")[0]}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
