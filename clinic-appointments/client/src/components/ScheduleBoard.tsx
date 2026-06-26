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
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = selectedDate
    ? WEEKDAYS[new Date(`${selectedDate}T00:00:00`).getDay()]
    : "";

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
        {config.doctors.map((doc) => {
          const worksToday = doc.workingDays.includes(weekday);
          return (
            <div key={doc.id} className="doc-col">
              <div className="doc-head">
                <strong>{doc.name}</strong>
                <span>{doc.specialty}</span>
                <span className="doc-hours">{doc.daysLabel} · {doc.hoursLabel}</span>
              </div>
              <div className="slots">
                {!worksToday ? (
                  <div className="slot closed">
                    <span className="open">Closed this day</span>
                  </div>
                ) : (
                  doc.slots.map((t) => {
                    const b = bookings.find(
                      (x) => x.doctorId === doc.id && x.date === selectedDate && x.time === t
                    );
                    return (
                      <div key={t} className={`slot ${b ? "booked" : "free"}`}>
                        <span className="t">{t}</span>
                        {b ? (
                          <span className="who" title={b.name}>
                            {firstName(b.name)}
                          </span>
                        ) : (
                          <span className="open">open</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
