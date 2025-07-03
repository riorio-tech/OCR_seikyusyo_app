import { NextRequest, NextResponse } from 'next/server';
import vision from '@google-cloud/vision';
import path from 'path';

const keyPath = path.join(process.cwd(), 'src/lib/gcp-key.json');
const client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });

export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: 'No image' }, { status: 400 });
  }
  try {
    const [result] = await client.textDetection({
      image: { content: imageBase64.replace(/^data:image\/\w+;base64,/, '') }
    });
    const text = result.fullTextAnnotation?.text || '';
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: 'OCR failed', detail: String(e) }, { status: 500 });
  }
} 