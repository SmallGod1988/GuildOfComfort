import { prisma } from "@/lib/prisma";
import ActionForm from "@/components/ActionForm";
import { deactivateUserAction, reactivateUserAction, deleteUserAction } from "@/app/actions/users";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
  });

  const active = users.filter((u) => !u.deactivatedAt);
  const dismissed = users.filter((u) => u.deactivatedAt);

  return (
    <>
      <h1>Пользователи</h1>

      <div className="section card">
        <h2>Работают ({active.length})</h2>
        {active.length === 0 ? (
          <p className="empty">Нет активных пользователей</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>E-mail</th>
                <th>Роль</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {active.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <div className="btn-row">
                      <form action={deactivateUserAction.bind(null, u.id)}>
                        <button type="submit" className="secondary">
                          Уволить
                        </button>
                      </form>
                      <form action={deleteUserAction.bind(null, u.id)}>
                        <button type="submit" className="danger">
                          Удалить
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dismissed.length > 0 && (
        <div className="section card">
          <h2>Уволены ({dismissed.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>E-mail</th>
                <th>Роль</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {dismissed.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.fullName}
                    <div className="hint">отключён</div>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <form action={reactivateUserAction.bind(null, u.id)}>
                      <button type="submit" className="secondary">
                        Вернуть
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
