"use client";

import { useSyncExternalStore } from "react";

/**
 * Служебная метка в углу экрана: дата, время и версия сборки.
 *
 * Рисуется в корневом layout, поэтому видна и до входа — на экране входа,
 * куда заходят проверить, доехало ли обновление на сервер.
 *
 * Время берётся у браузера, а не у сервера: серверное застыло бы на моменте
 * отрисовки страницы, а при кэшировании показывало бы совсем не то.
 *
 * Часы — внешний по отношению к React источник, поэтому подключены через
 * useSyncExternalStore, а не через состояние с эффектом. Заодно это решает
 * гидратацию: на сервере снимок пустой, и до первой отрисовки в браузере
 * времени нет — разметке нечему разойтись.
 */

function subscribe(onChange: () => void): () => void {
  // Показываются минуты, поэтому чаще раза в четверть минуты обновляться
  // незачем — но и раз в минуту мало: метка отставала бы почти на минуту.
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}

function format(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Снимок обязан быть тем же значением, пока время не изменилось, иначе React
// уйдёт в бесконечную перерисовку. Строка сравнивается по значению, и внутри
// одной минуты она не меняется.
let snapshot = "";

function getSnapshot(): string {
  const next = format(new Date());
  if (next !== snapshot) snapshot = next;
  return snapshot;
}

/** На сервере времени нет — там рисуется только версия. */
function getServerSnapshot(): null {
  return null;
}

export default function AppStatus() {
  const version = process.env.APP_VERSION;
  const stamp = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!stamp && !version) return null;

  return (
    <span className="app-status">
      {stamp && <span>{stamp}</span>}
      {stamp && version && <span className="app-status-sep">·</span>}
      {version && <span title="Версия приложения">v{version}</span>}
    </span>
  );
}
