import io

from flask import Flask, render_template, request, send_file, jsonify
from PIL import Image, ImageOps, UnidentifiedImageError

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB por requisição

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"}

# Página padrão A4 (retrato) a 200 DPI, com margem uniforme
DPI = 200
PAGE_W, PAGE_H = 1654, 2339
MARGIN = 80


def allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def to_rgb(img: Image.Image) -> Image.Image:
    """Converte para RGB; transparência vira fundo branco."""
    img = ImageOps.exif_transpose(img)  # respeita a rotação de fotos de celular
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])  # usa o canal alpha como máscara
        return background
    return img.convert("RGB")


def fit_on_page(img: Image.Image) -> Image.Image:
    """Centraliza a imagem numa página A4 branca, mantendo a proporção."""
    box = (PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN)
    img = ImageOps.contain(img, box, Image.LANCZOS)
    page = Image.new("RGB", (PAGE_W, PAGE_H), (255, 255, 255))
    page.paste(img, ((PAGE_W - img.width) // 2, (PAGE_H - img.height) // 2))
    return page


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/convert", methods=["POST"])
def convert():
    files = request.files.getlist("images")
    files = [f for f in files if f and f.filename]

    if not files:
        return jsonify(error="Nenhuma imagem enviada."), 400

    images = []
    for f in files:
        if not allowed(f.filename):
            return jsonify(error=f"Formato não suportado: {f.filename}"), 400
        try:
            images.append(fit_on_page(to_rgb(Image.open(io.BytesIO(f.read())))))
        except (UnidentifiedImageError, OSError):
            return jsonify(error=f"Arquivo inválido: {f.filename}"), 400

    pdf_buffer = io.BytesIO()
    images[0].save(
        pdf_buffer,
        format="PDF",
        save_all=True,
        append_images=images[1:],
        resolution=float(DPI),
        quality=90,
    )
    pdf_buffer.seek(0)

    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name="imagens.pdf",
    )


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="Arquivos muito grandes (limite de 100 MB)."), 413


if __name__ == "__main__":
    app.run(debug=True)
