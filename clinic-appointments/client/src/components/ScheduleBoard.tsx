import type { Booking, ClinicConfig } from "../lib/clinicApi";

export default function ScheduleBoard({
  config,
  bookings,
  selectedDate,
  onSelectDate,
}: {
  config: ClinicConfig;
  bookings: Booking[];
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
        {config.doctors.map((doc) => (
          <div key={doc.id} className="doc-col">
            <div className="doc-head">
              <strong>{doc.name}</strong>
              <span>{doc.specialty}</span>
            </div>
            <div className="slots">
              {config.slots.map((t) => {
                const b = bookings.find(
                  (x) => x.doctorId === doc.id && x.date === selectedDate && x.time === t
                );
                return (
                  <div key={t} className={`slot ${b ? "booked" : "free"}`}>
                    <span className="t">{t}</span>
                    {b ? (
                      <span className="who" title={`${b.name} · ${b.phone}`}>
                        {firstName(b.name)}
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
