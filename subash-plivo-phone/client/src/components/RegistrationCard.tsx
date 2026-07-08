import type { Registration } from "../lib/subashApi";

// Fields that count toward the capture progress bar.
const FIELDS = [
  "name",
  "phone",
  "address",
  "district",
  "pincode",
  "productName",
  "modelNumber",
  "serialNumber",
  "purchaseDate",
  "shopName",
  "shopLocation",
] as const;

const PILL_FIELDS = ["district"];

function Value({ field, value }: { field: string; value: string }) {
  if (!value.trim()) return <span className="ld-empty">—</span>;
  if (PILL_FIELDS.includes(field)) return <span className="ld-pill">{value}</span>;
  return <span className="ld-text">{value}</span>;
}

function RegistrationTable({ r }: { r: Partial<Registration> }) {
  const rows: { label: string; field: (typeof FIELDS)[number]; group: string }[] = [
    { group: "Customer", label: "Name", field: "name" },
    { group: "Customer", label: "Mobile", field: "phone" },
    { group: "Customer", label: "Address", field: "address" },
    { group: "Customer", label: "District", field: "district" },
    { group: "Customer", label: "Pincode", field: "pincode" },
    { group: "Product", label: "Product", field: "productName" },
    { group: "Product", label: "Model no.", field: "modelNumber" },
    { group: "Product", label: "Serial no.", field: "serialNumber" },
    { group: "Product", label: "Purchased", field: "purchaseDate" },
    { group: "Product", label: "Shop", field: "shopName" },
    { group: "Product", label: "Shop location", field: "shopLocation" },
  ];
  let lastGroup = "";
  return (
    <table className="ld-table">
      <tbody>
        {rows.flatMap((row) => {
          const out = [];
          if (row.group !== lastGroup) {
            lastGroup = row.group;
            out.push(
              <tr key={`g-${row.group}`} className="ld-grouprow">
                <td colSpan={2}>{row.group}</td>
              </tr>
            );
          }
          const v = (r as any)[row.field] ?? "";
          out.push(
            <tr key={row.field} className={String(v).trim() ? "filled" : ""}>
              <td className="ld-k">{row.label}</td>
              <td className="ld-v">
                <Value field={row.field} value={String(v)} />
              </td>
            </tr>
          );
          return out;
        })}
      </tbody>
    </table>
  );
}

export default function RegistrationCard({
  registration,
  recent,
}: {
  registration: Partial<Registration> | null;
  recent: Registration[];
}) {
  const r = registration ?? {};
  const captured = FIELDS.filter((k) => String((r as any)[k] ?? "").trim()).length;
  const pct = Math.round((captured / FIELDS.length) * 100);
  const done = r.status === "Registered";

  return (
    <div className="ld">
      <div className="ld-head">
        <div className="ld-avatar">🧾</div>
        <div className="ld-id">
          <div className="ld-name">{r.ref || "New registration"}</div>
          <div className="ld-sub">{(r.productName || "product registration…") as string}</div>
        </div>
        <span className={`tk-status ${done ? "scheduled" : "draft"}`}>
          {done ? "✓ Registered" : "Draft"}
        </span>
      </div>

      <div className="ld-progress">
        <div className="ld-progress-track">
          <div className="ld-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ld-progress-num">
          {captured}/{FIELDS.length}
        </span>
      </div>

      <RegistrationTable r={r} />

      {recent.length > 0 && (
        <div className="sq">
          <div className="sq-title">Recent registrations</div>
          {recent.slice(0, 6).map((x) => (
            <div key={x.id} className="sq-row" title={x.name}>
              <span className="sq-icon">🧾</span>
              <span className="sq-ref">{x.ref}</span>
              <span className="sq-main">
                {x.productName || "Product"}
                {x.name ? ` · ${x.name.split(" ")[0]}` : ""}
              </span>
              <span className="sq-when">{x.district}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
