import type { ServiceBooking, CarServiceConfig } from "../lib/carServiceApi";

export default function CentreBoard({
  config,
  bookings,
  selectedDate,
  onSelectDate,
}: {
  config: CarServiceConfig;
  bookings: ServiceBooking[];
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
        {config.centres.map((centre) => (
          <div key={centre.id} className="doc-col">
            <div className="doc-head">
              <strong>{centre.name}</strong>
              <span>{config.brand.name} service</span>
            </div>
            <div className="slots">
              {config.slots.map((t) => {
                const b = bookings.find(
                  (x) => x.centreId === centre.id && x.date === selectedDate && x.time === t
                );
                return (
                  <div key={t} className={`slot ${b ? "booked" : "free"}`}>
                    <span className="t">{t}</span>
                    {b ? (
                      <span
                        className="who"
                        title={`${b.carModel} · ${b.name}${b.works ? ` · ${b.works}` : ""}`}
                      >
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
