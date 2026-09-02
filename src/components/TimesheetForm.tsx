"use client";

import { useActionState, useState } from "react";
import { addTimesheetEntryAction } from "@/app/actions/timesheet";

export type SiteOption = { id: string; name: string };

/** Монтажник, за которого текущий пользователь вправе вносить часы, и объекты,
 *  где это право действует (там, где он бригадир, а тот назначен). */
export type CrewOption = { id: string; fullName: string; siteIds: string[] };

function isoToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const IconPerson = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" strokeLinecap="round" />
  </svg>
);

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
  </svg>
);

const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M4 20.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 15 5v15.5M15 10h3.5A1.5 1.5 0 0 1 20 11.5v9M2.5 20.5h19" strokeLinecap="round" />
    <path d="M7.5 7.5h1M11 7.5h1M7.5 11h1M11 11h1M7.5 14.5h1M11 14.5h1" strokeLinecap="round" />
  </svg>
);

const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function TimesheetForm({
  me,
  sites,
  crew,
  recentSites,
}: {
  me: { id: string; fullName: string };
  sites: SiteOption[];
  crew: CrewOption[];
  recentSites: SiteOption[];
}) {
  const [state, formAction, pending] = useActionState(addTimesheetEntryAction, {});
  const [installerId, setInstallerId] = useState(me.id);
  const [date, setDate] = useState(isoToday());
  const [siteId, setSiteId] = useState("");

  const today = isoToday();
  const yesterday = isoToday(-1);

  // Монтажник и объект должны оставаться согласованной парой: право вносить
  // часы за другого действует только на объектах, где выбравший — бригадир.
  function chooseInstaller(nextId: string) {
    setInstallerId(nextId);
    if (nextId === me.id) return;
    const member = crew.find((c) => c.id === nextId);
    if (member && !member.siteIds.includes(siteId)) {
      setSiteId(member.siteIds[0] ?? "");
    }
  }

  function chooseSite(nextSiteId: string) {
    setSiteId(nextSiteId);
    if (installerId === me.id) return;
    const member = crew.find((c) => c.id === installerId);
    if (member && !member.siteIds.includes(nextSiteId)) {
      setInstallerId(me.id);
    }
  }

  return (
    <form action={formAction} className="ts-form">
      {state.error && <div className="error-banner">{state.error}</div>}

      <div className="ts-field">
        <span className="ts-icon">
          <IconPerson />
        </span>
        <span className="ts-body">
          {crew.length > 0 ? (
            <>
              <label htmlFor="ts-installer">Монтажник</label>
              <select
                id="ts-installer"
                name="installerId"
                value={installerId}
                onChange={(e) => chooseInstaller(e.target.value)}
              >
                <option value={me.id}>{me.fullName} (я)</option>
                {crew.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="ts-label">Монтажник</span>
              <span className="ts-static">{me.fullName}</span>
              <input type="hidden" name="installerId" value={me.id} />
            </>
          )}
        </span>
      </div>

      <div className="ts-group">
        <div className="ts-field">
          <span className="ts-icon">
            <IconCalendar />
          </span>
          <span className="ts-body">
            <label htmlFor="ts-date">Дата</label>
            <input
              id="ts-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </span>
        </div>
        <div className="ts-quick">
          <button
            type="button"
            aria-pressed={date === yesterday}
            onClick={() => setDate(yesterday)}
          >
            Вчера
          </button>
          <button type="button" aria-pressed={date === today} onClick={() => setDate(today)}>
            Сегодня
          </button>
        </div>
      </div>

      <div className="ts-group">
        <div className="ts-field">
          <span className="ts-icon">
            <IconBuilding />
          </span>
          <span className="ts-body">
            <label htmlFor="ts-site">Объект</label>
            <select
              id="ts-site"
              name="siteId"
              value={siteId}
              onChange={(e) => chooseSite(e.target.value)}
            >
              <option value="">— не указан —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </span>
        </div>
        {recentSites.length > 0 && (
          <>
            <span className="ts-caption">Последние объекты</span>
            <div className="ts-chips">
              {recentSites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="ts-chip"
                  aria-pressed={siteId === s.id}
                  onClick={() => chooseSite(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ts-field">
        <span className="ts-icon">
          <IconClock />
        </span>
        <span className="ts-body">
          <label htmlFor="ts-hours">Часы</label>
          <input
            id="ts-hours"
            name="hours"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            max="24"
            placeholder="8.0"
            required
          />
        </span>
        <span className="ts-suffix">ч</span>
      </div>

      <div className="ts-field">
        <span className="ts-body">
          <label htmlFor="ts-note">Комментарий (необязательно)</label>
          <input id="ts-note" name="note" />
        </span>
      </div>

      <button type="submit" className="ts-submit" disabled={pending}>
        {pending ? "Сохраняем..." : "Подтвердить"}
      </button>
    </form>
  );
}
