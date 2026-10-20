# Gera PDFs de teste do Zebra Leitor (texto em português, cabeçalho/rodapé, hifenização, parágrafo entre páginas e um PDF só de imagem).
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A5
from PIL import Image, ImageDraw, ImageFont
import io

W, H = A5
LEFT, RIGHT, TOP, BOTTOM = 50, W - 50, H - 70, 70
FONT, SIZE, LEAD = 'Times-Roman', 11, 15

def wrap(c, text, width, hyphen_every=1):
    """Quebra em linhas; a cada N linhas parte a última palavra com hífen (como em livros reais)."""
    words, lines, cur, n = text.split(), [], '', 0
    for w in words:
        trial = (cur + ' ' + w).strip()
        if c.stringWidth(trial, FONT, SIZE) <= width:
            cur = trial
            continue
        n += 1
        if n % hyphen_every == 0 and len(w) > 6:
            cut = len(w) // 2
            part = w[:cut] + '-'
            if c.stringWidth((cur + ' ' + part).strip(), FONT, SIZE) <= width:
                lines.append((cur + ' ' + part).strip()); cur = w[cut:]; continue
        lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

PARAS = [
 ("Capítulo Primeiro", 'h'),
 ("Era uma vez uma pequena livraria no centro da cidade, onde as histórias esperavam pacientemente por quem quisesse ouvi-las. O dono, o senhor Antônio, acreditava que cada livro merecia ser lido em voz alta pelo menos uma vez na vida. Dr. Silva costumava passar por lá todas as tardes, às 15h30, para conversar sobre literatura brasileira e tomar um café fresquinho.", 'p'),
 ("— Você já leu este? — perguntou ele, mostrando um volume antigo. A resposta veio com um sorriso: ainda não, mas pretendo começar hoje mesmo!", 'p'),
 ("A conversa se estendeu por horas. Falaram sobre a infância, sobre as viagens que fizeram e sobre os livros que nunca terminaram de ler. No fim, o senhor Antônio guardou o volume cuidadosamente na estante e prometeu que o deixaria reservado para a próxima visita, porque algumas histórias precisam esperar o momento certo para serem contadas, e este parecia ser exatamente esse momento especial para todos os presentes na pequena livraria.", 'p'),
 ("Capítulo Segundo", 'h'),
 ("No dia seguinte, a chuva caiu forte desde cedo. Poucas pessoas passaram pela rua, mas a livraria continuou aberta, com as luzes acesas e o cheiro de papel antigo no ar. Maria chegou molhada, trazendo uma caixa de livros usados que a avó havia deixado de herança, entre eles romances, poesias e um dicionário enorme com capa de couro desgastada pelo tempo.", 'p'),
]

def page_decor(c, n, total):
    c.setFont('Helvetica-Oblique', 8); c.drawString(LEFT, H - 40, 'A Livraria da Chuva — Romance')
    c.setFont('Helvetica', 9); c.drawCentredString(W / 2, 35, str(n))

def build_text_pdf(path, pages=4):
    c = canvas.Canvas(path, pagesize=A5)
    c.setTitle('A Livraria da Chuva'); c.setAuthor('Autora de Teste')
    # repete o conteúdo até preencher as páginas, deixando um parágrafo atravessar de uma página para outra
    stream = []
    while len(stream) < 40:
        stream.extend(PARAS)
    y, page = TOP, 1
    page_decor(c, page, pages)
    for text, kind in stream:
        if kind == 'h':
            if y < BOTTOM + 60: y = -1
            c.setFont('Times-Bold', 15)
            if y == -1:
                c.showPage(); page += 1
                if page > pages: break
                page_decor(c, page, pages); y = TOP
            c.drawString(LEFT, y, text); y -= 30; continue
        c.setFont(FONT, SIZE)
        lines = wrap(c, text, RIGHT - LEFT)
        for i, line in enumerate(lines):
            if y < BOTTOM:
                c.showPage(); page += 1
                if page > pages: break
                page_decor(c, page, pages); y = TOP; c.setFont(FONT, SIZE)
            indent = 14 if i == 0 else 0
            c.drawString(LEFT + indent, y, line); y -= LEAD
        if page > pages: break
        y -= 8
    c.save()

def build_scanned_pdf(path):
    c = canvas.Canvas(path, pagesize=A5)
    for n in range(2):
        img = Image.new('RGB', (600, 850), 'white'); d = ImageDraw.Draw(img)
        d.text((40, 80), 'Pagina escaneada ' + str(n + 1) + ' (somente imagem)', fill='black')
        buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(buf), 0, 0, W, H); c.showPage()
    c.save()

build_text_pdf('fixtures/livro-texto.pdf', pages=6)
build_scanned_pdf('fixtures/livro-escaneado.pdf')
print('ok')
