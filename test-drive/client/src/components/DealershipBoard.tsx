import type { TestDriveBooking, TestDriveConfig } from "../lib/testdriveApi";

/** A reference board of booked test drives: dealership columns × time slots for the
 *  selected day. Screen-only (the voice agent never sees this) — booked slots show the
 *  model and the customer's first name, with full details on hover. */
export default function DealershipBoard({
  config,
  bookings,
  selectedDate,
  onSelectDate,
}: {
  config: TestDriveConfig;
  bookings: TestDriveBooking[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const firstName = (n: string) => n.split(" ")[0];

  return (
    <div className="board">
      <div className="day-strip">
        {config.days.map((d) => (
          <button
            key={d.date}
            className={`day ${d.date === selectedDate ? "on" : ""}`}
            onClick={() => onSelectDate(d.date)}
          >
            {d.label}
            {d.date === config.today && <span className="today-dot" />}
          </button>
        ))}
      </div>

      <div className="board-grid">
        {config.dealerships.map((dlr) => (
          <div key={dlr.id} className="doc-col">
            <div className="doc-head">
              <strong>{dlr.name}</strong>
              <span>{config.brand.name} test drives</span>
            </div>
            <div className="slots">
              {config.slots.map((t) => {
                const b = bookings.find(
                  (x) => x.dealershipId === dlr.id && x.date === selectedDate && x.time === t
                );
                return (
                  <div key={t} className={`slot ${b ? "booked" : "free"}`}>
                    <span className="t">{t}</span>
                    {b ? (
                      <span className="who" title={`${b.carModel} · ${b.name}`}>
                        {b.carModel} · {firstName(b.name)}
                      </span>
                    ) : (
                      <span className="open">open</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
