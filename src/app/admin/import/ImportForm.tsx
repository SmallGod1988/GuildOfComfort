"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { importKpWorkbookAction, type ImportState } from "@/app/actions/kp";

const initialState: ImportState = {};

export default function ImportForm({
  sites,
}: {
  sites: { id: string; name: string; address: string }[];
}) {
  const [state, formAction, pending] = useActionState(importKpWorkbookAction, initialState);
  // Пустое значение = завести объект тут же; тогда нужны название и адрес.
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");

  if (state.result) {
    const r = state.result;
    return (
      <div className="card">
        <h2>Книга загружена</h2>
        <p>
          Объект <strong>{r.siteName}</strong>, состав работ «{r.subProjectName}».
        </p>
        <ul>
          <li>
            Задач: <strong>{r.tasks}</strong> в {r.sections} разделах, из них гибких:{" "}
            {r.flexible}
          </li>
          <li>
            Блоков работ: <strong>{r.blocks}</strong>, связей очерёдности: {r.dependencies}
          </li>
          <li>
            Сумма по КП: <strong>{r.total.toLocaleString("ru-RU")} ₽</strong>
          </li>
        </ul>

        {r.warnings.length > 0 && (
          <div className="section">
            <h3>На что обратить внимание</h3>
            <ul className="hint">
              {r.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="btn-row">
          <Link href={`/admin/sites/${r.siteId}`}>Перейти к объекту</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="card">
      {state.error && <div className="error-banner">{state.error}</div>}

      <div className="field">
        <label htmlFor="siteId">Объект</label>
        <select id="siteId" name="siteId" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.address}
            </option>
          ))}
          <option value="">➕ Новый объект</option>
        </select>
      </div>

      {siteId === "" && (
        <>
          <div className="field">
            <label htmlFor="siteName">Название объекта</label>
            <input id="siteName" name="siteName" required placeholder="БЦ «Северный», 3 этаж" />
          </div>
          <div className="field">
            <label htmlFor="siteAddress">Адрес</label>
            <input
              id="siteAddress"
              name="siteAddress"
              required
              placeholder="Санкт-Петербург, ул. Примерная, 1"
            />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="subProjectName">Состав работ</label>
        <input
          id="subProjectName"
          name="subProjectName"
          required
          defaultValue="Обвязка ПВ1 / ПВ2"
          placeholder="Обвязка ПВ1 / ПВ2 (REMAK)"
        />
        <p className="hint">
          Под этим названием дерево задач ляжет в объект. Повторная загрузка создаёт ещё один
          состав работ рядом и не трогает уже отмеченные объёмы.
        </p>
      </div>

      <div className="field">
        <label htmlFor="file">Рабочая книга (.xlsx)</label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
        <p className="hint">
          Нужны листы «КП» и «Задачи монтажа»; «Зависимости» — по желанию, из них берутся блоки
          работ и их очерёдность.
        </p>
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Разбираем книгу..." : "Загрузить"}
      </button>
    </form>
  );
}
