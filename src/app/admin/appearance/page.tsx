import { getAnimeImages } from "@/lib/uploads";
import ActionForm from "@/components/ActionForm";
import { uploadHeroineAction, deleteHeroineAction } from "@/app/actions/anime";

export default async function AdminAppearancePage() {
  const images = getAnimeImages();

  return (
    <>
      <h1>Оформление</h1>
      <p className="hint">Загруженные изображения появляются на экране входа и в углу кабинета.</p>

      <div className="section card">
        <h2>Загрузить изображение</h2>
        <p className="hint">PNG, JPEG, WebP · максимум 5 МБ</p>
        <ActionForm action={uploadHeroineAction} submitLabel="Загрузить">
          <div className="field">
            <label htmlFor="image">Файл</label>
            <input
              id="image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
            />
          </div>
        </ActionForm>
      </div>

      {images.length === 0 ? (
        <p className="empty">Изображений пока нет.</p>
      ) : (
        <div className="section">
          <h2>Загруженные изображения</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "1rem",
            }}
          >
            {images.map((img) => (
              <div
                key={img}
                style={{
                  position: "relative",
                  paddingBottom: "100%",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/anime/${img}`}
                  alt={img}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <form
                  action={deleteHeroineAction.bind(null, img)}
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    margin: "0.5rem",
                  }}
                >
                  <button type="submit" className="btn danger" style={{ padding: "0.5rem" }}>
                    ✕
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
