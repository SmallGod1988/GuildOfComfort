import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { createFinancialRecordAction } from "@/app/actions/finance";
import { FINANCIAL_TYPE_LABEL } from "@/lib/labels";

export default async function AdminFinancePage() {
  const [installers, records, sites] = await Promise.all([
    prisma.user.findMany({ where: { role: "INSTALLER" }, orderBy: { fullName: "asc" } }),
    prisma.financialRecord.findMany({
      include: { participant: true, site: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.site.findMany({ orderBy: { name: "asc" } }),
  ]);

  const balances = new Map<string, number>();
  for (const r of records) {
    const delta = r.type === "ACCRUAL" ? Number(r.amount) : -Number(r.amount);
    balances.set(r.participantId, (balances.get(r.participantId) ?? 0) + delta);
  }

  return (
    <>
      <h1>Финансы</h1>
      <p className="hint">
        Приватный раздел: виден только администратору. Каждый монтажник видит в
        своём кабинете только собственные записи.
      </p>

      <div className="section card">
        <h2>Остатки по монтажникам (начислено − выплачено)</h2>
        {installers.length === 0 ? (
          <p className="empty">Монтажников пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Монтажник</th>
                <th>Баланс</th>
              </tr>
            </thead>
            <tbody>
              {installers.map((i) => (
                <tr key={i.id}>
                  <td>{i.fullName}</td>
                  <td>{(balances.get(i.id) ?? 0).toFixed(2)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section card">
        <h2>Новая запись</h2>
        {installers.length === 0 ? (
          <p className="hint">Сначала должен зарегистрироваться хотя бы один монтажник.</p>
        ) : (
          <ActionForm action={createFinancialRecordAction} submitLabel="Добавить запись">
            <div className="field">
              <label htmlFor="participantId">Участник</label>
              <select id="participantId" name="participantId" required defaultValue="">
                <option value="" disabled>
                  Выберите монтажника
                </option>
                {installers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="type">Тип</label>
              <select id="type" name="type" required defaultValue="ACCRUAL">
                <option value="ACCRUAL">Начисление</option>
                <option value="PAYOUT">Выплата</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="amount">Сумма, ₽</label>
              <input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="field">
              <label htmlFor="siteId">Объект (необязательно)</label>
              <select id="siteId" name="siteId" defaultValue="">
                <option value="">—</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="note">Комментарий (необязательно)</label>
              <input id="note" name="note" />
            </div>
          </ActionForm>
        )}
      </div>

      <div className="section">
        <h2>История записей</h2>
        {records.length === 0 ? (
          <p className="empty">Записей пока нет.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Участник</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Объект</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt.toLocaleDateString("ru-RU")}</td>
                  <td>{r.participant.fullName}</td>
                  <td>{FINANCIAL_TYPE_LABEL[r.type]}</td>
                  <td>{r.amount.toString()} ₽</td>
                  <td>{r.site?.name ?? "—"}</td>
                  <td>{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
