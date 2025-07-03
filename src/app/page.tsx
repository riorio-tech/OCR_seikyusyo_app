"use client";
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Invoice = {
  id: number;
  date: string;
  amount: string;
  to: string;
  applicant: string;
  paymentDate: string;
  issuer: string;
};
type Vertex = { x: number; y: number };
type Box = Vertex[];

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [highlightBoxes, setHighlightBoxes] = useState<Box[]>([]);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [loadingDots, setLoadingDots] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          setPreviewUrl(ev.target.result);
          setBase64Image(ev.target.result);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleExtract = async () => {
    if (!base64Image) return;
    setLoading(true);
    setHighlightBoxes([]);
    try {
      // Google Cloud Vision API連携
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image }),
      });
      const data = await res.json();
      const text = data.text || '';
      setRawText(text);
      const dateMatch = text.match(/\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}日?/);
      const amountMatches = Array.from(text.matchAll(/([\d,]+)\s*円/g));
      let maxAmount = '-';
      if (amountMatches.length > 0) {
        const amounts = amountMatches.map(m => parseInt((m as RegExpMatchArray)[1].replace(/,/g, ''), 10));
        const max = Math.max(...amounts);
        maxAmount = `¥${max.toLocaleString()}`;
      }
      const toMatch = text.match(/(株式会社|有限会社|合同会社)[^\s\n]*/);
      // 新規項目の抽出
      let applicantValue = '-';
      const applicantRegexes = [
        /([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]+様)/u,
        /申請者[:：]\s*([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]+)/u,
        /担当[:：]\s*([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]+)/u
      ];
      for (const regex of applicantRegexes) {
        const match = text.match(regex);
        if (match) {
          applicantValue = match[1];
          break;
        }
      }
      const paymentDateMatch = text.match(/(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}日?\s*\d{1,2}:\d{2})/); // 日時+時刻
      const issuerMatch = text.match(/(株式会社|有限会社|合同会社)[^\s\n]*/); // 請求元
      setInvoices([
        {
          id: 1,
          date: dateMatch ? dateMatch[0] : "-",
          amount: maxAmount,
          to: toMatch ? toMatch[0] : "-",
          applicant: applicantValue,
          paymentDate: paymentDateMatch ? paymentDateMatch[0] : "-",
          issuer: issuerMatch ? issuerMatch[0] : "-",
        },
      ]);
      // ハイライト処理はそのまま
      // const targets = [dateMatch?.[0], amountMatches.map(m => (m as RegExpMatchArray)[0]), toMatch?.[0]].filter(Boolean);
      // ハイライトは空に（Google OCRはバウンディングボックス情報が異なるため）
      setHighlightBoxes([]);
      // --- 追加: バウンディングボックス抽出 ---
      const ocrTargets: string[] = [];
      if (dateMatch?.[0]) ocrTargets.push(dateMatch[0]);
      if (amountMatches.length > 0) amountMatches.forEach(m => ocrTargets.push((m as RegExpMatchArray)[0]));
      if (toMatch?.[0]) ocrTargets.push(toMatch[0]);
      if (applicantValue) ocrTargets.push(applicantValue);
      if (paymentDateMatch?.[0]) ocrTargets.push(paymentDateMatch[0]);
      if (issuerMatch?.[0]) ocrTargets.push(issuerMatch[0]);
      // 各抽出値をtargetsに
      // const targets: string[] = [];
      // if (dateMatch?.[0]) targets.push(dateMatch[0]);
      // if (amountMatches.length > 0) amountMatches.forEach(m => targets.push((m as RegExpMatchArray)[0]));
      // if (toMatch?.[0]) targets.push(toMatch[0]);
      // if (applicantValue) targets.push(applicantValue);
      // if (paymentDateMatch?.[0]) targets.push(paymentDateMatch[0]);
      // if (issuerMatch?.[0]) targets.push(issuerMatch[0]);
      // ページ内の全ワードを走査
      data.fullTextAnnotation.pages.forEach((page: { blocks: { paragraphs: { words: { symbols: { text: string }[]; boundingBox: { vertices: Vertex[] } }[] }[] }[] }) => {
        page.blocks.forEach((block) => {
          block.paragraphs.forEach((para) => {
            para.words.forEach((word) => {
              const wordText = word.symbols.map((s) => s.text).join('');
              if (ocrTargets.some(t => wordText && t.includes(wordText))) {
                const boxes: Box[] = [];
                boxes.push(word.boundingBox.vertices);
                setHighlightBoxes(boxes);
              }
            });
          });
        });
      });
    } catch {
      setHighlightBoxes([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!imageRef.current || !highlightBoxes.length) return;
    const img = imageRef.current;
    const canvas = document.getElementById("highlight-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    // 画像の表示サイズと実サイズの比率を計算
    const scaleX = img.width / img.naturalWidth;
    const scaleY = img.height / img.naturalHeight;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#f59e42";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#f59e42";
    highlightBoxes.forEach((vertices) => {
      if (vertices.length === 4) {
        ctx.beginPath();
        ctx.moveTo(vertices[0].x * scaleX, vertices[0].y * scaleY);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(vertices[i].x * scaleX, vertices[i].y * scaleY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }, [highlightBoxes, previewUrl]);

  useEffect(() => {
    if (!loading) {
      setLoadingDots('');
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      setLoadingDots('.'.repeat((i % 3) + 1));
      i++;
    }, 400);
    return () => clearInterval(interval);
  }, [loading]);

  // テーブル編集用ハンドラ
  const handleInvoiceChange = (idx: number, key: string, value: string) => {
    setInvoices((prev) => prev.map((inv, i) => i === idx ? { ...inv, [key]: value } : inv));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-8 bg-gray-50">
      <Card className="w-full max-w-md p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold mb-2">請求書OCR・整理アプリ</h1>
        <Input type="file" accept="image/*" onChange={handleFileChange} />
        <div className="relative w-full">
          {previewUrl && (
            <>
              <img ref={imageRef} src={previewUrl} alt="プレビュー" className="w-full max-h-64 object-contain border my-2" />
              {/* ハイライト用canvas */}
              <canvas
                id="highlight-canvas"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  pointerEvents: 'none',
                  width: '100%',
                  height: '100%',
                }}
              />
            </>
          )}
        </div>
        <Button onClick={handleExtract} disabled={!selectedFile || loading}>
          {loading ? `抽出中${loadingDots}` : "画像から情報を抽出"}
        </Button>
      </Card>
      <Card className="w-full max-w-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">抽出結果一覧</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日付</TableHead>
              <TableHead>金額</TableHead>
              <TableHead>請求先</TableHead>
              <TableHead>申請者</TableHead>
              <TableHead>支払い日時</TableHead>
              <TableHead>請求元</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">データがありません</TableCell>
              </TableRow>
            ) : (
              invoices.map((inv, idx) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Input value={inv.date} onChange={e => handleInvoiceChange(idx, 'date', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={inv.amount} onChange={e => handleInvoiceChange(idx, 'amount', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={inv.to} onChange={e => handleInvoiceChange(idx, 'to', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={inv.applicant} onChange={e => handleInvoiceChange(idx, 'applicant', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={inv.paymentDate} onChange={e => handleInvoiceChange(idx, 'paymentDate', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={inv.issuer} onChange={e => handleInvoiceChange(idx, 'issuer', e.target.value)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {/* OCR生テキスト表示（デバッグ用） */}
        {rawText && (
          <div className="mt-6 p-2 bg-gray-100 rounded text-xs text-gray-700 whitespace-pre-wrap">
            <div className="font-bold mb-1">OCR抽出テキスト</div>
            {rawText}
          </div>
        )}
      </Card>
    </div>
  );
}
