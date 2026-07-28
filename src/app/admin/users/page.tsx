import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["INSTALLER", "CUSTOMER"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const roleLabel: Record<string, string> = { INSTALLER: "Монтажник", CUSTOMER: "Заказчик" };

  return (
    <>
      <h1>Пользователи</h1>
      <p className="hint">
        Монтажники и заказчики регистрируются сами на странице /register.
      </p>
      {users.length === 0 ? (
        <p className="empty">Пока никто не зарегистрирован.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Роль</th>
              <th>E-mail</th>
              <th>Телефон</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{roleLabel[u.role]}</td>
                <td>{u.email}</td>
                <td>{u.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
