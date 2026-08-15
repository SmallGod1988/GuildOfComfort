/**
 * Версия развёрнутой сборки в углу экрана.
 *
 * Рисуется в корневом layout, поэтому видна и до входа — на экране входа,
 * куда и заходят проверить, доехало ли обновление на сервер. Метка
 * служебная: приглушена и не перехватывает нажатия, чтобы не мешать
 * работе с формами на телефоне.
 */
export default function AppVersion() {
  const version = process.env.APP_VERSION;
  if (!version) return null;

  return (
    <span className="app-version" aria-label={`Версия приложения ${version}`}>
      v{version}
    </span>
  );
}
