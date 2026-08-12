import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="container narrow">
      <h1>Гильдия Комфорта</h1>
      {reason === "deactivated" && (
        <div className="error-banner">
          Учётная запись отключена. Обратитесь к администратору.
        </div>
      )}
      <LoginForm />
    </div>
  );
}
